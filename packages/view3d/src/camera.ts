import * as THREE from 'three';

export type ViewBand = 'tactical' | 'transition' | 'strategic';

/** Visible vertical span (metres) at which the view becomes fully tactical / fully strategic. */
const TACTICAL_SPAN = 220;
const STRATEGIC_SPAN = 480;
const MIN_SPAN = 30;
const TACTICAL_TILT = (55 * Math.PI) / 180;
const STRATEGIC_TILT = Math.PI / 2 - 0.0001;
const DISTANCE = 1200;

/**
 * Continuous camera over the city plus a third-person rig for direct control.
 * Pure presentation: it never talks to the simulation.
 */
export class CameraRig {
  readonly ortho: THREE.OrthographicCamera;
  readonly persp: THREE.PerspectiveCamera;
  focusX: number;
  focusY: number;
  span: number;
  targetSpan: number;
  yaw = 0;
  targetYaw = 0;
  direct: { x: number; y: number; yaw: number } | null = null;
  private aspect = 16 / 9;
  private savedFocus: [number, number] | null = null;
  readonly maxSpan: number;
  private readonly mapW: number;
  private readonly mapH: number;

  constructor(mapWidthM: number, mapHeightM: number) {
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 5000);
    this.persp = new THREE.PerspectiveCamera(60, 16 / 9, 0.3, 2000);
    this.focusX = mapWidthM / 2;
    this.focusY = mapHeightM / 2;
    this.mapW = mapWidthM;
    this.mapH = mapHeightM;
    this.maxSpan = Math.max(mapWidthM, mapHeightM) * 1.1;
    this.span = 110;
    this.targetSpan = 110;
  }

  get active(): THREE.Camera {
    return this.direct ? this.persp : this.ortho;
  }

  get band(): ViewBand {
    if (this.span <= TACTICAL_SPAN) return 'tactical';
    if (this.span >= STRATEGIC_SPAN) return 'strategic';
    return 'transition';
  }

  /** 0 at tactical, 1 at strategic. */
  get strategicBlend(): number {
    return clamp01((this.span - TACTICAL_SPAN) / (STRATEGIC_SPAN - TACTICAL_SPAN));
  }

  setAspect(a: number): void {
    this.aspect = a;
    this.persp.aspect = a;
    this.persp.updateProjectionMatrix();
  }

  zoom(notches: number): void {
    const f = notches > 0 ? Math.pow(1.18, notches) : Math.pow(0.85, -notches);
    this.targetSpan = clamp(this.targetSpan * f, MIN_SPAN, this.maxSpan);
  }

  /** Toggle between the operations map (whole city) and the tactical view at the previous spot. */
  toggleMap(): void {
    if (this.targetSpan >= STRATEGIC_SPAN) {
      this.targetSpan = 110;
      if (this.savedFocus) [this.focusX, this.focusY] = this.savedFocus;
      this.savedFocus = null;
    } else {
      this.savedFocus = [this.focusX, this.focusY];
      this.targetSpan = this.maxSpan;
      this.focusX = this.mapW / 2;
      this.focusY = this.mapH / 2;
    }
  }

  rotate(steps: number): void {
    this.targetYaw += (steps * Math.PI) / 4;
  }

  /** Pan in screen directions (metres scaled by the current span). */
  pan(dxScreen: number, dyScreen: number): void {
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    // Screen right is (cos, -sin) and screen down is (sin, cos) on the simulation plane.
    this.focusX += dxScreen * c + dyScreen * s;
    this.focusY += -dxScreen * s + dyScreen * c;
  }

  centerOn(x: number, y: number): void {
    this.focusX = x;
    this.focusY = y;
  }

  /** Trauma 0..1; shake grows with its square and decays over about a second. */
  private trauma = 0;
  private shakeT = 0;

  /** Kick the camera (explosions, heavy hits). Amounts add up and saturate at 1. */
  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  private shakeOffset(dtS: number): { x: number; y: number } {
    this.trauma = Math.max(0, this.trauma - dtS * 1.2);
    this.shakeT += dtS;
    const a = this.trauma * this.trauma;
    if (a === 0) return { x: 0, y: 0 };
    // Smooth noise from a few incommensurate sines (no per-frame random jitter).
    const t = this.shakeT * 30;
    const mag = a * (this.direct ? 0.6 : this.span * 0.012);
    return { x: (Math.sin(t * 1.1) + Math.sin(t * 2.3 + 1.7)) * 0.5 * mag, y: (Math.sin(t * 1.7 + 0.5) + Math.sin(t * 2.9 + 2.1)) * 0.5 * mag };
  }

  update(dtS: number): void {
    const sh = this.shakeOffset(dtS);
    const k = 1 - Math.exp(-dtS / 0.15);
    this.span += (this.targetSpan - this.span) * k;
    this.yaw += (this.targetYaw - this.yaw) * k;

    if (this.direct) {
      const { x, y, yaw } = this.direct;
      const fx = Math.cos(yaw);
      const fy = Math.sin(yaw);
      this.persp.position.set(x - fx * 12 + sh.x, 8 + sh.y, y - fy * 12);
      this.persp.up.set(0, 1, 0);
      this.persp.lookAt(x + fx * 10 + sh.x, 1.5 + sh.y, y + fy * 10);
      this.persp.updateMatrixWorld();
      return;
    }

    const tilt = TACTICAL_TILT + (STRATEGIC_TILT - TACTICAL_TILT) * this.strategicBlend;
    const halfH = this.span / 2;
    const halfW = halfH * this.aspect;
    const cam = this.ortho;
    cam.left = -halfW;
    cam.right = halfW;
    cam.top = halfH;
    cam.bottom = -halfH;
    // Camera sits "south" of the focus (rotated by yaw), raised by the tilt.
    const back = Math.cos(tilt) * DISTANCE;
    const up = Math.sin(tilt) * DISTANCE;
    const bx = Math.sin(this.yaw) * back;
    const by = Math.cos(this.yaw) * back;
    const fxs = this.focusX + sh.x;
    const fys = this.focusY + sh.y;
    cam.position.set(fxs + bx, up, fys + by);
    // Screen-up points toward the yawed north.
    cam.up.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    cam.lookAt(fxs, 0, fys);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  /** Metres per CSS pixel at the focus, for panning. */
  metresPerPixel(viewportHeightPx: number): number {
    return this.span / viewportHeightPx;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function clamp01(v: number): number {
  return clamp(v, 0, 1);
}
