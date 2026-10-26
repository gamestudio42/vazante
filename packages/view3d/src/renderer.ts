import * as THREE from 'three';
import {
  SOLDIER_STRIDE,
  SoldierCondition,
  SoldierField,
  ZOMBIE_POOL_CAPACITY,
  ZOMBIE_STRIDE,
  ZombieField,
  type Frame,
  type MapInfo,
} from '@vazante/shared';
import { CameraRig } from './camera.ts';
import { buildCity, buildDistrictOverlay } from './city.ts';
import { PALETTE } from './palette.ts';

const INTERNAL_HEIGHT = 270;
const MAX_SOLDIERS = 256;
const MAX_TRACERS = 512;
const TRACER_LIFE_S = 0.08;

interface Tracer {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  age: number;
}

/**
 * Three.js view of the world. Reads frames, interpolates between the last two, draws.
 * It never writes to the simulation.
 */
export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly rig: CameraRig;
  readonly map: MapInfo;
  private readonly soldierMesh: THREE.InstancedMesh;
  private readonly zombieMesh: THREE.InstancedMesh;
  private readonly ringMesh: THREE.InstancedMesh;
  private readonly markerMesh: THREE.InstancedMesh;
  private readonly tracerGeo: THREE.BufferGeometry;
  private readonly tracerLines: THREE.LineSegments;
  private readonly districts: THREE.Group;
  private readonly tracers: Tracer[] = [];

  // Interpolation state.
  private prev: Frame | null = null;
  private curr: Frame | null = null;
  private currAt = 0;
  private interval = 100;
  private readonly zPrevX = new Float32Array(ZOMBIE_POOL_CAPACITY);
  private readonly zPrevY = new Float32Array(ZOMBIE_POOL_CAPACITY);
  private readonly zSeenTick = new Int32Array(ZOMBIE_POOL_CAPACITY).fill(-1);
  private readonly zPrevSlotX = new Float32Array(ZOMBIE_POOL_CAPACITY);
  private readonly zPrevSlotY = new Float32Array(ZOMBIE_POOL_CAPACITY);

  selectedSquads = new Set<number>();
  private pixelScale = 1;
  private readonly tmpM = new THREE.Matrix4();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpS = new THREE.Vector3();
  private readonly tmpP = new THREE.Vector3();
  private readonly tmpC = new THREE.Color();
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor(canvas: HTMLCanvasElement, map: MapInfo) {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.background = new THREE.Color(PALETTE.sky);
    const wM = map.width * map.cellSize;
    const hM = map.height * map.cellSize;
    this.rig = new CameraRig(wM, hM);

    this.scene.add(new THREE.HemisphereLight(0xd8e4ff, 0x30281e, 1.4));
    const sun = new THREE.DirectionalLight(0xfff1d6, 1.6);
    sun.position.set(-300, 600, -200);
    this.scene.add(sun);

    this.scene.add(buildCity(map));
    this.districts = buildDistrictOverlay(map);
    this.scene.add(this.districts);

    const body = new THREE.BoxGeometry(0.7, 1.8, 0.5);
    body.translate(0, 0.9, 0);
    this.soldierMesh = new THREE.InstancedMesh(body, new THREE.MeshLambertMaterial({ flatShading: true }), MAX_SOLDIERS);
    this.soldierMesh.count = 0;
    this.soldierMesh.frustumCulled = false;
    this.scene.add(this.soldierMesh);

    const zbody = new THREE.BoxGeometry(0.6, 1.7, 0.45);
    zbody.translate(0, 0.85, 0);
    this.zombieMesh = new THREE.InstancedMesh(zbody, new THREE.MeshLambertMaterial({ flatShading: true }), ZOMBIE_POOL_CAPACITY);
    this.zombieMesh.count = 0;
    this.zombieMesh.frustumCulled = false;
    this.scene.add(this.zombieMesh);

    const ring = new THREE.RingGeometry(0.8, 1.05, 12);
    ring.rotateX(-Math.PI / 2);
    this.ringMesh = new THREE.InstancedMesh(ring, new THREE.MeshBasicMaterial({ color: PALETTE.selection, side: THREE.DoubleSide }), MAX_SOLDIERS);
    this.ringMesh.count = 0;
    this.ringMesh.frustumCulled = false;
    this.scene.add(this.ringMesh);

    const marker = new THREE.CircleGeometry(1, 16);
    marker.rotateX(-Math.PI / 2);
    this.markerMesh = new THREE.InstancedMesh(marker, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85 }), 64);
    this.markerMesh.count = 0;
    this.markerMesh.frustumCulled = false;
    this.scene.add(this.markerMesh);

    this.tracerGeo = new THREE.BufferGeometry();
    this.tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_TRACERS * 6), 3));
    this.tracerLines = new THREE.LineSegments(this.tracerGeo, new THREE.LineBasicMaterial({ color: PALETTE.tracer }));
    this.tracerLines.frustumCulled = false;
    this.scene.add(this.tracerLines);
  }

  resize(cssW: number, cssH: number): void {
    this.pixelScale = Math.max(1, Math.round(cssH / INTERNAL_HEIGHT));
    const w = Math.max(1, Math.floor(cssW / this.pixelScale));
    const h = Math.max(1, Math.floor(cssH / this.pixelScale));
    this.renderer.setSize(w, h, false);
    this.rig.setAspect(w / h);
  }

  pushFrame(f: Frame, nowMs: number): void {
    // Remember where each zombie slot was so we can interpolate.
    if (this.curr) {
      const z = this.curr.zombies;
      for (let i = 0; i < z.length; i += ZOMBIE_STRIDE) {
        const slot = z[i + ZombieField.Slot];
        this.zPrevSlotX[slot] = z[i + ZombieField.X];
        this.zPrevSlotY[slot] = z[i + ZombieField.Y];
      }
      this.interval = Math.min(250, Math.max(16, nowMs - this.currAt));
    }
    const prevTick = this.curr ? this.curr.tick : -1;
    const z = f.zombies;
    for (let i = 0; i < z.length; i += ZOMBIE_STRIDE) {
      const slot = z[i + ZombieField.Slot];
      if (this.zSeenTick[slot] !== prevTick) {
        // New (or reused) slot: no interpolation from a stale position.
        this.zPrevSlotX[slot] = z[i + ZombieField.X];
        this.zPrevSlotY[slot] = z[i + ZombieField.Y];
      }
      this.zPrevX[slot] = this.zPrevSlotX[slot];
      this.zPrevY[slot] = this.zPrevSlotY[slot];
      this.zSeenTick[slot] = f.tick;
    }
    this.prev = this.curr;
    this.curr = f;
    this.currAt = nowMs;
    for (const e of f.events) {
      if (e.type === 'shot' && e.x !== undefined && e.x2 !== undefined) {
        if (this.tracers.length >= MAX_TRACERS) this.tracers.shift();
        this.tracers.push({ x0: e.x, y0: e.y!, x1: e.x2, y1: e.y2!, age: 0 });
      }
    }
  }

  /** Interpolated soldier position by frame index. */
  soldierPos(i: number, alpha: number): [number, number] {
    const c = this.curr!.soldiers;
    const o = i * SOLDIER_STRIDE;
    const x = c[o + SoldierField.X];
    const y = c[o + SoldierField.Y];
    const p = this.prev?.soldiers;
    if (!p || p.length <= o) return [x, y];
    return [p[o + SoldierField.X] + (x - p[o + SoldierField.X]) * alpha, p[o + SoldierField.Y] + (y - p[o + SoldierField.Y]) * alpha];
  }

  alpha(nowMs: number): number {
    return Math.min(1, Math.max(0, (nowMs - this.currAt) / this.interval));
  }

  render(nowMs: number, dtS: number): void {
    this.rig.update(dtS);
    const f = this.curr;
    if (f) {
      const a = this.alpha(nowMs);
      this.drawSoldiers(f, a);
      this.drawZombies(f, a);
      this.drawMarkers(f);
    }
    this.drawTracers(dtS);
    this.districts.visible = this.rig.band !== 'tactical' && !this.rig.direct;
    this.renderer.render(this.scene, this.rig.active);
  }

  private drawSoldiers(f: Frame, a: number): void {
    const s = f.soldiers;
    const n = Math.min(MAX_SOLDIERS, s.length / SOLDIER_STRIDE);
    const boost = this.unitScale();
    let rings = 0;
    for (let i = 0; i < n; i++) {
      const o = i * SOLDIER_STRIDE;
      const cond = s[o + SoldierField.Condition];
      const [x, y] = this.soldierPos(i, a);
      const fx = s[o + SoldierField.FacingX];
      const fy = s[o + SoldierField.FacingY];
      const squad = s[o + SoldierField.Squad];
      const id = s[o + SoldierField.Id];
      if (cond === SoldierCondition.Turned) {
        this.tmpS.set(0, 0, 0);
      } else if (cond === SoldierCondition.Dead) {
        this.tmpS.set(boost, 0.25, boost);
      } else {
        this.tmpS.set(boost, boost, boost);
      }
      this.tmpQ.setFromAxisAngle(this.up, Math.atan2(-fx, -fy));
      this.tmpP.set(x, 0, y);
      this.tmpM.compose(this.tmpP, this.tmpQ, this.tmpS);
      this.soldierMesh.setMatrixAt(i, this.tmpM);
      const col = cond === SoldierCondition.Dead ? PALETTE.soldierDead : cond === SoldierCondition.Bitten ? PALETTE.soldierBitten : PALETTE.squads[(squad - 1) % PALETTE.squads.length];
      this.soldierMesh.setColorAt(i, this.tmpC.set(col));
      const isDirect = f.directSoldier === id;
      if ((this.selectedSquads.has(squad) || isDirect) && (cond === SoldierCondition.Ok || cond === SoldierCondition.Bitten)) {
        this.tmpS.set(boost, 1, boost);
        this.tmpQ.identity();
        this.tmpP.set(x, 0.05, y);
        this.tmpM.compose(this.tmpP, this.tmpQ, this.tmpS);
        this.ringMesh.setMatrixAt(rings, this.tmpM);
        this.ringMesh.setColorAt(rings, this.tmpC.set(isDirect ? PALETTE.directRing : PALETTE.selection));
        rings++;
      }
    }
    this.soldierMesh.count = n;
    this.soldierMesh.instanceMatrix.needsUpdate = true;
    if (this.soldierMesh.instanceColor) this.soldierMesh.instanceColor.needsUpdate = true;
    this.ringMesh.count = rings;
    this.ringMesh.instanceMatrix.needsUpdate = true;
    if (this.ringMesh.instanceColor) this.ringMesh.instanceColor.needsUpdate = true;
  }

  private drawZombies(f: Frame, a: number): void {
    const z = f.zombies;
    const n = z.length / ZOMBIE_STRIDE;
    const boost = this.unitScale();
    const t = nowSeconds();
    for (let i = 0; i < n; i++) {
      const o = i * ZOMBIE_STRIDE;
      const slot = z[o + ZombieField.Slot];
      const x = this.zPrevX[slot] + (z[o + ZombieField.X] - this.zPrevX[slot]) * a;
      const y = this.zPrevY[slot] + (z[o + ZombieField.Y] - this.zPrevY[slot]) * a;
      const vx = z[o + ZombieField.HeadingX];
      const vy = z[o + ZombieField.HeadingY];
      const kind = Math.floor(z[o + ZombieField.KindState] / 16);
      const sway = Math.sin(t * 6 + slot) * 0.15;
      this.tmpQ.setFromAxisAngle(this.up, (vx !== 0 || vy !== 0 ? Math.atan2(-vx, -vy) : slot) + sway);
      const k = kind === 2 ? 1.35 : kind === 1 ? 0.9 : 1;
      this.tmpS.set(boost * k, boost * k, boost * k);
      this.tmpP.set(x, 0, y);
      this.tmpM.compose(this.tmpP, this.tmpQ, this.tmpS);
      this.zombieMesh.setMatrixAt(i, this.tmpM);
      this.zombieMesh.setColorAt(i, this.tmpC.set(PALETTE.zombie[kind] ?? PALETTE.zombie[0]));
    }
    this.zombieMesh.count = n;
    this.zombieMesh.instanceMatrix.needsUpdate = true;
    if (this.zombieMesh.instanceColor) this.zombieMesh.instanceColor.needsUpdate = true;
  }

  /** Squad markers that grow with the strategic blend so units stay readable on the map. */
  private drawMarkers(f: Frame): void {
    const blend = this.rig.direct ? 0 : this.rig.strategicBlend;
    let k = 0;
    if (blend > 0.05) {
      const r = (this.rig.span / 60) * blend;
      for (const q of f.squads) {
        if (q.alive === 0 || k >= 64) continue;
        this.tmpS.set(r, 1, r);
        this.tmpQ.identity();
        this.tmpP.set(q.anchorX, 30, q.anchorY);
        this.tmpM.compose(this.tmpP, this.tmpQ, this.tmpS);
        this.markerMesh.setMatrixAt(k, this.tmpM);
        const col = PALETTE.squads[(q.id - 1) % PALETTE.squads.length];
        this.markerMesh.setColorAt(k, this.tmpC.set(this.selectedSquads.has(q.id) ? PALETTE.selection : col));
        k++;
      }
    }
    this.markerMesh.count = k;
    this.markerMesh.instanceMatrix.needsUpdate = true;
    if (this.markerMesh.instanceColor) this.markerMesh.instanceColor.needsUpdate = true;
  }

  private drawTracers(dtS: number): void {
    const pos = this.tracerGeo.attributes.position as THREE.BufferAttribute;
    let n = 0;
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.age += dtS;
      if (t.age > TRACER_LIFE_S) {
        this.tracers.splice(i, 1);
        continue;
      }
      pos.setXYZ(n * 2, t.x0, 1.4, t.y0);
      pos.setXYZ(n * 2 + 1, t.x1, 1.0, t.y1);
      n++;
    }
    pos.needsUpdate = true;
    this.tracerGeo.setDrawRange(0, n * 2);
  }

  /** Units are drawn larger when zoomed out so they remain visible at low resolution. */
  private unitScale(): number {
    if (this.rig.direct) return 1;
    return Math.max(1, this.rig.span / 90);
  }

  // ----- Picking (CSS pixel coordinates) -----

  private readonly raycaster = new THREE.Raycaster();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  screenToGround(cssX: number, cssY: number, cssW: number, cssH: number): { x: number; y: number } | null {
    const ndc = new THREE.Vector2((cssX / cssW) * 2 - 1, -(cssY / cssH) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.rig.active);
    const hit = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.plane, hit) ? { x: hit.x, y: hit.z } : null;
  }

  worldToScreen(x: number, y: number, cssW: number, cssH: number, height = 1): { x: number; y: number } {
    const v = new THREE.Vector3(x, height, y).project(this.rig.active);
    return { x: ((v.x + 1) / 2) * cssW, y: ((1 - v.y) / 2) * cssH };
  }

  /** Squad of the living soldier nearest to a screen point within `radiusPx`, or null. */
  pickSquad(cssX: number, cssY: number, cssW: number, cssH: number, radiusPx = 14): number | null {
    const f = this.curr;
    if (!f) return null;
    let best: number | null = null;
    let bd = radiusPx * radiusPx;
    for (let i = 0; i < f.soldiers.length / SOLDIER_STRIDE; i++) {
      const o = i * SOLDIER_STRIDE;
      const c = f.soldiers[o + SoldierField.Condition];
      if (c !== SoldierCondition.Ok && c !== SoldierCondition.Bitten) continue;
      const p = this.worldToScreen(f.soldiers[o + SoldierField.X], f.soldiers[o + SoldierField.Y], cssW, cssH);
      const d = (p.x - cssX) ** 2 + (p.y - cssY) ** 2;
      if (d < bd) {
        bd = d;
        best = f.soldiers[o + SoldierField.Squad];
      }
    }
    if (best === null && this.rig.strategicBlend > 0.05) {
      for (const q of f.squads) {
        if (q.alive === 0) continue;
        const p = this.worldToScreen(q.anchorX, q.anchorY, cssW, cssH, 30);
        const d = (p.x - cssX) ** 2 + (p.y - cssY) ** 2;
        if (d < bd * 4) {
          bd = d / 4;
          best = q.id;
        }
      }
    }
    return best;
  }

  /** Squads with any living soldier inside a screen rectangle. */
  pickSquadsInRect(x0: number, y0: number, x1: number, y1: number, cssW: number, cssH: number): number[] {
    const f = this.curr;
    if (!f) return [];
    const out = new Set<number>();
    const [ax, bx] = x0 < x1 ? [x0, x1] : [x1, x0];
    const [ay, by] = y0 < y1 ? [y0, y1] : [y1, y0];
    for (let i = 0; i < f.soldiers.length / SOLDIER_STRIDE; i++) {
      const o = i * SOLDIER_STRIDE;
      const c = f.soldiers[o + SoldierField.Condition];
      if (c !== SoldierCondition.Ok && c !== SoldierCondition.Bitten) continue;
      const p = this.worldToScreen(f.soldiers[o + SoldierField.X], f.soldiers[o + SoldierField.Y], cssW, cssH);
      if (p.x >= ax && p.x <= bx && p.y >= ay && p.y <= by) out.add(f.soldiers[o + SoldierField.Squad]);
    }
    return [...out];
  }

  get latest(): Frame | null {
    return this.curr;
  }
}

function nowSeconds(): number {
  return performance.now() / 1000;
}
