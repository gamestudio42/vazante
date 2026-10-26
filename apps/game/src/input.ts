import { FORMATIONS, SOLDIER_STRIDE, SoldierField, type Stance } from '@vazante/shared';
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
  private fire = false;
  private reload = false;
  private lastDirectSend = 0;
  private lastDirectKey = '';
  box: BoxRect | null = null;
  helpVisible = true;
  private listeners = new Set<() => void>();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly client: GameClient,
    private readonly view: GameRenderer,
  ) {
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('dblclick', this.onDblClick);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    client.onFrame((f) => {
      if (this.directId !== null && f.directSoldier !== this.directId) this.leaveDirectLocal();
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
    let dx = 0;
    let dy = 0;
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
    if (e.button === 0) this.dragStart = { x, y };
    else if (e.button === 1) {
      e.preventDefault();
      this.panning = { x: e.clientX, y: e.clientY };
    } else if (e.button === 2) this.orderMove(x, y);
  };

  private onMouseMove = (e: MouseEvent): void => {
    const r = this.canvas.getBoundingClientRect();
    this.mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
    if (this.directId !== null) {
      if (document.pointerLockElement === this.canvas) this.directYaw += e.movementX * MOUSE_SENSITIVITY;
      return;
    }
    if (this.panning) {
      const mpp = this.view.rig.metresPerPixel(r.height);
      this.view.rig.pan(-(e.clientX - this.panning.x) * mpp, -(e.clientY - this.panning.y) * mpp);
      this.panning = { x: e.clientX, y: e.clientY };
    }
    if (this.dragStart) {
      this.box = { x0: this.dragStart.x, y0: this.dragStart.y, x1: this.mouse.x, y1: this.mouse.y };
      this.changed();
    }
  };

  private onMouseUp = (e: MouseEvent): void => {
    if (e.button === 0) this.fire = false;
    if (e.button === 1) this.panning = null;
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
  }

  private orderMove(x: number, y: number): void {
    const sel = this.client.state.selected;
    if (sel.length === 0) return;
    const { w, h } = this.size();
    const p = this.view.screenToGround(x, y, w, h);
    if (p) this.client.send({ type: 'move', squads: sel, to: p });
  }

  setStance(stance: Stance): void {
    const sel = this.client.state.selected;
    if (sel.length) this.client.send({ type: 'stance', squads: sel, stance });
  }

  cycleFormation(): void {
    const sel = this.client.state.selected;
    const f = this.client.state.frame;
    if (!sel.length || !f) return;
    const q = f.squads.find((s) => s.id === sel[0]);
    const next = FORMATIONS[(FORMATIONS.indexOf(q?.formation ?? 'line') + 1) % FORMATIONS.length];
    this.client.send({ type: 'formation', squads: sel, formation: next });
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.target instanceof HTMLInputElement) return;
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

  // ----- Direct control -----

  toggleDirect(): void {
    if (this.directId !== null) {
      this.client.send({ type: 'set_direct_control', soldier: null });
      this.leaveDirectLocal();
      return;
    }
    const f = this.client.state.frame;
    const sel = this.client.state.selected;
    if (!f || sel.length === 0) return;
    const q = f.squads.find((s) => s.id === sel[0]);
    if (!q) return;
    for (let i = 0; i < f.soldiers.length / SOLDIER_STRIDE; i++) {
      const o = i * SOLDIER_STRIDE;
      const id = f.soldiers[o + SoldierField.Id];
      const cond = f.soldiers[o + SoldierField.Condition];
      if (q.members.includes(id) && cond <= 1) {
        this.directId = id;
        this.directYaw = Math.atan2(f.soldiers[o + SoldierField.FacingY], f.soldiers[o + SoldierField.FacingX]);
        this.client.send({ type: 'set_direct_control', soldier: id });
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
