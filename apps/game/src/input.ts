import { FORMATIONS, SOLDIER_STRIDE, STRUCTURE_KINDS, SoldierField, type RiskPolicy, type Stance, type StructureKind } from '@vazante/shared';
import { BuildTool } from './build.ts';
import type { GameRenderer } from '@vazante/view3d';
import type { GameClient } from './client.ts';

export interface BoxRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const PAN_SPEED_PX = 600; // CSS pixels per second
const MOUSE_SENSITIVITY = 0.0025;
const DIRECT_SEND_MS = 50;

/**
 * Translates keyboard and mouse into camera moves (local) and commands (to the worker).
 * Camera changes never reach the simulation.
 */
export class InputController {
  private keys = new Set<string>();
  private dragStart: { x: number; y: number } | null = null;
  private panning: { x: number; y: number } | null = null;
  private mouse = { x: 0, y: 0 };
  private directYaw = 0;
  private directId: number | null = null;
  /** The simulation has acknowledged the current direct control (frames lag one or two ticks behind). */
  private directConfirmed = false;
  private fire = false;
  private reload = false;
  private lastDirectSend = 0;
  private lastDirectKey = '';
  box: BoxRect | null = null;
  /** The briefing teaches the controls; H brings the full list back. */
  helpVisible = false;
  readonly build: BuildTool;
  /** Immediate audio feedback for player actions (wired to the audio director in main). */
  feedback: (kind: 'select' | 'order' | 'stance' | 'deny' | 'toggle') => void = () => {};
  /** Mute toggle hook (N key). */
  onToggleMute: () => void = () => {};
  /** Esc with nothing to cancel (opens or closes the pause menu). */
  onEscape: () => void = () => {};
  onQuickSave: () => void = () => {};
  onQuickLoad: () => void = () => {};
  /** False while a menu covers the game: only Esc gets through. */
  enabled = true;
  /** Pan when the mouse touches the screen edge. */
  edgePan = false;
  private mouseInside = false;
  private listeners = new Set<() => void>();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly client: GameClient,
    private readonly view: GameRenderer,
  ) {
    this.build = new BuildTool(view.map);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('dblclick', this.onDblClick);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('mouseleave', () => (this.mouseInside = false));
    document.addEventListener('mouseenter', () => (this.mouseInside = true));
    client.onFrame((f) => {
      // Leave only when the simulation drops control it had granted (soldier died, turned), not
      // in the ticks before it has seen the request.
      if (this.directId === null) return;
      if (f.directSoldier === this.directId) this.directConfirmed = true;
      else if (this.directConfirmed) this.leaveDirectLocal();
    });
  }

  get inDirect(): boolean {
    return this.directId !== null;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private changed(): void {
    for (const fn of this.listeners) fn();
  }

  private size(): { w: number; h: number } {
    const r = this.canvas.getBoundingClientRect();
    return { w: r.width, h: r.height };
  }

  /** Called every animation frame. */
  update(dtS: number, nowMs: number): void {
    const rig = this.view.rig;
    if (this.directId !== null) {
      this.updateDirect(nowMs);
      rig.direct = this.directCameraTarget();
      return;
    }
    rig.direct = null;
    if (!this.enabled) return;
    if (this.build.active) this.refreshGhost();
    let dx = 0;
    let dy = 0;
    if (this.edgePan && this.mouseInside && !this.panning && !this.dragStart) {
      const { w, h } = this.size();
      const m = 6;
      if (this.mouse.x <= m) dx -= 1;
      if (this.mouse.x >= w - m) dx += 1;
      if (this.mouse.y <= m) dy -= 1;
      if (this.mouse.y >= h - m) dy += 1;
    }
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) dy -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) dy += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) dx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) dx += 1;
    if (dx || dy) {
      const mpp = rig.metresPerPixel(this.size().h);
      rig.pan(dx * PAN_SPEED_PX * dtS * mpp, dy * PAN_SPEED_PX * dtS * mpp);
    }
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    if (this.directId !== null) return;
    this.view.rig.zoom(Math.sign(e.deltaY));
  };

  private onMouseDown = (e: MouseEvent): void => {
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (this.directId !== null) {
      if (document.pointerLockElement !== this.canvas) this.canvas.requestPointerLock();
      if (e.button === 0) this.fire = true;
      return;
    }
    if (this.build.active && e.button !== 1) {
      if (e.button === 2) this.setBuild(null);
      else {
        const p = this.groundAt(x, y);
        if (p) this.build.press(p.x, p.y);
        this.refreshGhost();
      }
      return;
    }
    if (e.button === 0) this.dragStart = { x, y };
    else if (e.button === 1) {
      e.preventDefault();
      this.panning = { x: e.clientX, y: e.clientY };
    } else if (e.button === 2) this.orderMove(x, y);
  };

  private onMouseMove = (e: MouseEvent): void => {
    const r = this.canvas.getBoundingClientRect();
    this.mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
    this.mouseInside = true;
    if (this.directId !== null) {
      if (document.pointerLockElement === this.canvas) this.directYaw += e.movementX * MOUSE_SENSITIVITY;
      return;
    }
    if (this.panning) {
      const mpp = this.view.rig.metresPerPixel(r.height);
      this.view.rig.pan(-(e.clientX - this.panning.x) * mpp, -(e.clientY - this.panning.y) * mpp);
      this.panning = { x: e.clientX, y: e.clientY };
    }
    if (this.build.active) this.refreshGhost();
    if (this.dragStart) {
      this.box = { x0: this.dragStart.x, y0: this.dragStart.y, x1: this.mouse.x, y1: this.mouse.y };
      this.changed();
    }
  };

  private onMouseUp = (e: MouseEvent): void => {
    if (e.button === 0) this.fire = false;
    if (e.button === 1) this.panning = null;
    if (e.button === 0 && this.build.active) {
      const cells = this.build.release();
      const kind = this.build.kind!;
      for (const c of cells) this.client.send({ type: 'build', kind, at: { x: (c.cx + 0.5) * this.view.map.cellSize, y: (c.cy + 0.5) * this.view.map.cellSize } });
      this.feedback(cells.length ? 'order' : 'deny');
      if (!e.shiftKey && cells.length) this.setBuild(null);
      else this.refreshGhost();
      return;
    }
    if (e.button !== 0 || !this.dragStart || this.directId !== null) return;
    const { w, h } = this.size();
    const s = this.dragStart;
    const end = this.mouse;
    this.dragStart = null;
    this.box = null;
    let ids: number[];
    if (Math.abs(end.x - s.x) + Math.abs(end.y - s.y) < 6) {
      const id = this.view.pickSquad(end.x, end.y, w, h);
      ids = id === null ? [] : [id];
      if (id === null && !e.shiftKey) {
        const v = this.view.pickVehicle(end.x, end.y, w, h);
        if (v !== null) {
          this.selectVehicle(v);
          this.changed();
          return;
        }
      }
    } else {
      ids = this.view.pickSquadsInRect(s.x, s.y, end.x, end.y, w, h);
    }
    if (e.shiftKey) ids = [...new Set([...this.client.state.selected, ...ids])];
    this.select(ids);
    this.changed();
  };

  private onDblClick = (): void => {
    const f = this.client.state.frame;
    const id = this.client.state.selected[0];
    const q = f?.squads.find((s) => s.id === id);
    if (q) this.view.rig.centerOn(q.anchorX, q.anchorY);
  };

  select(ids: number[]): void {
    this.client.select(ids);
    this.view.selectedSquads = new Set(ids);
    if (ids.length) {
      this.view.vehicles.selected = null;
      this.feedback('select');
    }
  }

  selectVehicle(id: number | null): void {
    this.client.selectVehicle(id);
    this.view.vehicles.selected = id;
    if (id !== null) {
      this.view.selectedSquads = new Set();
      this.feedback('select');
    }
    this.changed();
  }

  setVehiclePolicy(policy: RiskPolicy): void {
    const v = this.client.state.vehicle;
    if (v === null) return;
    this.client.send({ type: 'set_policy', vehicle: v, policy });
    this.feedback('stance');
  }

  stopVehicle(): void {
    const v = this.client.state.vehicle;
    if (v === null) return;
    this.client.send({ type: 'stop_vehicle', vehicle: v });
    this.feedback('stance');
  }

  loadVehicle(ammo: number, materials: number): void {
    const v = this.client.state.vehicle;
    if (v === null) return;
    this.client.send({ type: 'load', vehicle: v, ammo, materials });
    this.feedback('order');
  }

  /** Send the selected truck to a base or depot. */
  sendConvoy(to: number, policy: RiskPolicy): void {
    const v = this.client.state.vehicle;
    if (v === null) return;
    this.client.send({ type: 'convoy', vehicle: v, to, policy });
    this.feedback('order');
  }

  private orderMove(x: number, y: number): void {
    const sel = this.client.state.selected;
    const { w, h } = this.size();
    const p = this.view.screenToGround(x, y, w, h);
    const veh = this.client.state.vehicle;
    if (sel.length === 0 && veh !== null && p) {
      // Right click on a base or depot sends the selected truck there with its current policy.
      const f = this.client.state.frame;
      const cs = this.view.map.cellSize;
      const site = f?.bases.find((b) => p.x >= b.x0 * cs && p.x < (b.x1 + 1) * cs && p.y >= b.y0 * cs && p.y < (b.y1 + 1) * cs);
      const v = f?.vehicles.find((x) => x.id === veh);
      if (site && v) {
        this.sendConvoy(site.id, v.policy);
        this.view.markOrder(p.x, p.y);
      } else this.feedback('deny');
      return;
    }
    if (sel.length === 0) return;
    if (!p) return;
    this.client.send({ type: 'move', squads: sel, to: p });
    this.view.markOrder(p.x, p.y);
    this.feedback('order');
  }

  setStance(stance: Stance): void {
    const sel = this.client.state.selected;
    if (!sel.length) return;
    this.client.send({ type: 'stance', squads: sel, stance });
    this.feedback('stance');
  }

  cycleFormation(): void {
    const sel = this.client.state.selected;
    const f = this.client.state.frame;
    if (!sel.length || !f) return;
    const q = f.squads.find((s) => s.id === sel[0]);
    const next = FORMATIONS[(FORMATIONS.indexOf(q?.formation ?? 'line') + 1) % FORMATIONS.length];
    this.client.send({ type: 'formation', squads: sel, formation: next });
    this.feedback('stance');
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    if (!this.enabled) {
      if (e.code === 'Escape') this.onEscape();
      return;
    }
    this.keys.add(e.code);
    const rig = this.view.rig;
    switch (e.code) {
      case 'Tab':
        e.preventDefault();
        this.toggleDirect();
        return;
      case 'KeyR':
        if (this.directId !== null) this.reload = true;
        return;
    }
    if (this.directId !== null) return;
    switch (e.code) {
      case 'Space':
        e.preventDefault();
        this.client.send({ type: 'set_speed', speed: this.client.state.frame?.speed === 0 ? 1 : 0 });
        break;
      case 'F1':
      case 'F2':
      case 'F3':
        e.preventDefault();
        this.client.send({ type: 'set_speed', speed: e.code === 'F1' ? 1 : e.code === 'F2' ? 2 : 4 });
        break;
      case 'KeyM':
        rig.toggleMap();
        break;
      case 'KeyQ':
        rig.rotate(-1);
        break;
      case 'KeyE':
        rig.rotate(1);
        break;
      case 'KeyZ':
        this.setStance('hold');
        break;
      case 'KeyX':
        this.setStance('aggressive');
        break;
      case 'KeyC':
        this.setStance('defensive');
        break;
      case 'KeyV':
        this.setStance('withdraw');
        break;
      case 'KeyF':
        this.cycleFormation();
        break;
      case 'KeyB':
        this.setBuild(this.build.active ? null : (this.build.kind ?? 'wall'));
        break;
      case 'Digit1':
      case 'Digit2':
      case 'Digit3':
      case 'Digit4':
        this.setBuild(STRUCTURE_KINDS[Number(e.code.slice(5)) - 1]);
        break;
      case 'Escape':
        if (this.build.active) this.setBuild(null);
        else if (this.client.state.vehicle !== null) this.selectVehicle(null);
        else if (this.client.state.selected.length > 0) this.select([]);
        else this.onEscape();
        break;
      case 'F5':
        e.preventDefault();
        this.onQuickSave();
        break;
      case 'F9':
        e.preventDefault();
        this.onQuickLoad();
        break;
      case 'KeyG':
      case 'Delete':
      case 'Backspace': {
        const st = this.structureUnderCursor();
        if (!st) break;
        if (e.code === 'KeyG') {
          if (st.kind === 'gate') this.client.send({ type: 'toggle_gate', structure: st.id });
        } else this.client.send({ type: 'demolish', structure: st.id });
        this.feedback('stance');
        break;
      }
      case 'KeyN':
        this.onToggleMute();
        this.changed();
        break;
      case 'KeyH':
        this.helpVisible = !this.helpVisible;
        this.changed();
        break;
      case 'KeyK': {
        const { w, h } = this.size();
        const p = this.view.screenToGround(this.mouse.x, this.mouse.y, w, h);
        if (p) this.client.send({ type: 'debug_spawn', at: p, count: 30 });
        break;
      }
      case 'Home': {
        const a = this.client.state.alerts.find((x) => x.x !== undefined);
        if (a) rig.centerOn(a.x!, a.y!);
        break;
      }
    }
  };

  // ----- Construction -----

  setBuild(kind: StructureKind | null): void {
    if (kind === null) this.build.cancel();
    else this.build.begin(kind);
    this.feedback('toggle');
    this.refreshGhost();
    this.changed();
  }

  private groundAt(x: number, y: number): { x: number; y: number } | null {
    const { w, h } = this.size();
    return this.view.screenToGround(x, y, w, h);
  }

  private refreshGhost(): void {
    if (!this.build.active) {
      this.view.structures.setGhosts(null, []);
      return;
    }
    const p = this.groundAt(this.mouse.x, this.mouse.y);
    if (!p) return;
    const before = `${this.build.reason}:${this.build.cells.length}`;
    this.build.hover(p.x, p.y, this.client.state.frame);
    this.view.structures.setGhosts(this.build.kind, this.build.cells);
    if (`${this.build.reason}:${this.build.cells.length}` !== before) this.changed();
  }

  private structureUnderCursor() {
    const f = this.client.state.frame;
    const p = this.groundAt(this.mouse.x, this.mouse.y);
    if (!f || !p) return undefined;
    const { cx, cy } = this.build.cellOf(p.x, p.y);
    return f.structures.find((s) => s.cx === cx && s.cy === cy);
  }

  // ----- Direct control -----

  toggleDirect(): void {
    if (this.directId !== null) {
      this.client.send({ type: 'set_direct_control', soldier: null });
      this.leaveDirectLocal();
      return;
    }
    const f = this.client.state.frame;
    const sel = this.client.state.selected;
    if (!f || sel.length === 0) {
      this.feedback('deny');
      return;
    }
    const q = f.squads.find((s) => s.id === sel[0]);
    if (!q) return;
    for (let i = 0; i < f.soldiers.length / SOLDIER_STRIDE; i++) {
      const o = i * SOLDIER_STRIDE;
      const id = f.soldiers[o + SoldierField.Id];
      const cond = f.soldiers[o + SoldierField.Condition];
      if (q.members.includes(id) && cond <= 1) {
        this.directId = id;
        this.directConfirmed = false;
        this.directYaw = Math.atan2(f.soldiers[o + SoldierField.FacingY], f.soldiers[o + SoldierField.FacingX]);
        this.client.send({ type: 'set_direct_control', soldier: id });
        this.feedback('toggle');
        this.canvas.requestPointerLock?.();
        this.changed();
        return;
      }
    }
  }

  private leaveDirectLocal(): void {
    this.directId = null;
    this.fire = false;
    this.view.rig.direct = null;
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.changed();
  }

  private updateDirect(nowMs: number): void {
    const fx = Math.cos(this.directYaw);
    const fy = Math.sin(this.directYaw);
    let f = 0;
    let s = 0;
    if (this.keys.has('KeyW')) f += 1;
    if (this.keys.has('KeyS')) f -= 1;
    if (this.keys.has('KeyD')) s += 1;
    if (this.keys.has('KeyA')) s -= 1;
    // Right of forward on the simulation plane (y points south).
    const mx = fx * f - fy * s;
    const my = fy * f + fx * s;
    const key = `${mx.toFixed(2)},${my.toFixed(2)},${fx.toFixed(3)},${fy.toFixed(3)},${this.fire},${this.reload}`;
    if (key !== this.lastDirectKey || nowMs - this.lastDirectSend > 250) {
      if (nowMs - this.lastDirectSend >= DIRECT_SEND_MS || this.reload) {
        this.client.send({ type: 'direct_input', soldier: this.directId!, move: { x: mx, y: my }, aim: { x: fx, y: fy }, fire: this.fire, reload: this.reload });
        this.lastDirectKey = key;
        this.lastDirectSend = nowMs;
        this.reload = false;
      }
    }
  }

  private directCameraTarget(): { x: number; y: number; yaw: number } | null {
    const f = this.view.latest;
    if (!f || this.directId === null) return null;
    for (let i = 0; i < f.soldiers.length / SOLDIER_STRIDE; i++) {
      const o = i * SOLDIER_STRIDE;
      if (f.soldiers[o + SoldierField.Id] === this.directId) {
        const [x, y] = this.view.soldierPos(i, this.view.alpha(performance.now()));
        return { x, y, yaw: this.directYaw };
      }
    }
    return null;
  }
}
