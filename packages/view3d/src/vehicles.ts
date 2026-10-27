import * as THREE from 'three';
import type { VehicleView } from '@vazante/shared';
import { toon } from './materials.ts';
import { PALETTE } from './palette.ts';

const CAP = 64;

/**
 * Military cargo truck, front at local -z, about 6.4 m long and 2.4 m wide: bonnet, cab with a dark
 * windscreen, a bed under a canvas tilt with a rounded roof, six wheels and a front bumper.
 */
function truckParts(): { geo: THREE.BufferGeometry; color: number }[] {
  const merge = (...geos: THREE.BufferGeometry[]) => mergeSimple(geos);
  const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

  const bonnet = box(2.0, 0.9, 1.3, 0, 1.25, -2.65);
  const cab = box(2.3, 1.5, 1.5, 0, 1.75, -1.4);
  const chassis = box(2.2, 0.35, 6.0, 0, 0.75, 0.0);
  const bed = box(2.4, 0.55, 4.0, 0, 1.15, 1.25);
  const tiltWalls = box(2.35, 1.2, 3.9, 0, 2.0, 1.25);
  const roof = new THREE.CylinderGeometry(1.175, 1.175, 3.9, 10, 1, false, -Math.PI / 2, Math.PI);
  roof.rotateX(Math.PI / 2);
  roof.scale(1, 0.35, 1);
  roof.translate(0, 2.6, 1.25);
  const glass = box(2.05, 0.65, 0.08, 0, 2.05, -2.17);
  const sideGlass = merge(box(0.06, 0.55, 0.8, -1.16, 2.05, -1.45), box(0.06, 0.55, 0.8, 1.16, 2.05, -1.45));
  const bumper = merge(box(2.5, 0.3, 0.25, 0, 0.8, -3.35), box(0.25, 0.18, 0.12, -0.75, 1.3, -3.32), box(0.25, 0.18, 0.12, 0.75, 1.3, -3.32));
  const wheel = new THREE.CylinderGeometry(0.55, 0.55, 0.45, 10);
  wheel.rotateZ(Math.PI / 2);
  const wheels: THREE.BufferGeometry[] = [];
  for (const z of [-2.3, 0.9, 2.15]) for (const x of [-1.0, 1.0]) wheels.push(wheel.clone().translate(x, 0.55, z));
  return [
    { geo: merge(bonnet, cab), color: PALETTE.truckCab },
    { geo: merge(chassis, bed), color: PALETTE.truck },
    { geo: merge(tiltWalls, roof), color: PALETTE.cargo },
    { geo: merge(glass, sideGlass), color: 0x1b2228 },
    { geo: merge(bumper, ...wheels), color: PALETTE.boots },
  ];
}

/** Concatenate non-indexed copies of simple geometries (position and normal only). */
function mergeSimple(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const count = parts.reduce((n, g) => n + g.attributes.position.count, 0);
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array as Float32Array, o * 3);
    nor.set(g.attributes.normal.array as Float32Array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}

/** Trucks, interpolated between simulation frames; selection ring and remaining route. */
export class VehicleLayer {
  readonly group = new THREE.Group();
  private readonly parts: { mesh: THREE.InstancedMesh; color: THREE.Color; isCargo: boolean }[] = [];
  private readonly ring: THREE.InstancedMesh;
  private readonly routeGeo = new THREE.BufferGeometry();
  private prev = new Map<number, VehicleView>();
  private curr: VehicleView[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3(1, 1, 1);
  private readonly c = new THREE.Color();
  private readonly wreck = new THREE.Color(PALETTE.wreck);
  private readonly up = new THREE.Vector3(0, 1, 0);
  selected: number | null = null;

  constructor() {
    const mat = toon();
    for (const part of truckParts()) {
      const mesh = new THREE.InstancedMesh(part.geo, mat, CAP);
      mesh.count = 0;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.parts.push({ mesh, color: new THREE.Color(part.color), isCargo: part.color === PALETTE.cargo });
    }
    const ring = new THREE.RingGeometry(3.6, 4.0, 24);
    ring.rotateX(-Math.PI / 2);
    this.ring = new THREE.InstancedMesh(ring, new THREE.MeshBasicMaterial({ color: PALETTE.selection, transparent: true, opacity: 0.8, depthWrite: false }), 1);
    this.ring.count = 0;
    this.ring.frustumCulled = false;
    this.group.add(this.ring);
    this.routeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(2048 * 3), 3));
    const route = new THREE.LineSegments(this.routeGeo, new THREE.LineBasicMaterial({ color: PALETTE.depot, transparent: true, opacity: 0.8, depthWrite: false }));
    route.frustumCulled = false;
    this.group.add(route);
  }

  push(list: readonly VehicleView[]): void {
    this.prev = new Map(this.curr.map((v) => [v.id, v]));
    this.curr = list.slice();
  }

  /** Interpolated position of a vehicle, or null. */
  position(id: number, alpha: number): { x: number; y: number } | null {
    const v = this.curr.find((x) => x.id === id);
    if (!v) return null;
    const p = this.prev.get(id);
    return p ? { x: p.x + (v.x - p.x) * alpha, y: p.y + (v.y - p.y) * alpha } : { x: v.x, y: v.y };
  }

  get list(): readonly VehicleView[] {
    return this.curr;
  }

  draw(alpha: number, scale: number, nowS: number): void {
    let n = 0;
    for (const v of this.curr) {
      if (n >= CAP) break;
      const pos = this.position(v.id, alpha)!;
      const dead = v.state === 'destroyed';
      const moving = v.state === 'moving';
      const yaw = Math.atan2(-v.hx, -v.hy);
      this.q.setFromAxisAngle(this.up, yaw);
      // Engine shake while moving; wrecks sit a little lower.
      const shake = moving ? Math.sin(nowS * 40 + v.id) * 0.03 : 0;
      this.p.set(pos.x, dead ? -0.3 : shake, pos.y);
      this.s.setScalar(scale);
      this.m.compose(this.p, this.q, this.s);
      for (const part of this.parts) {
        const empty = part.isCargo && v.cargoAmmo === 0 && v.cargoMaterials === 0;
        if (empty) {
          // Hide the crates when the truck is empty by collapsing them into the bed.
          const flat = this.m.clone().multiply(new THREE.Matrix4().makeScale(1, 0.01, 1));
          part.mesh.setMatrixAt(n, flat);
        } else part.mesh.setMatrixAt(n, this.m);
        this.c.copy(part.color);
        if (dead) this.c.lerp(this.wreck, 0.85);
        else this.c.lerp(this.wreck, (1 - v.hp / v.maxHp) * 0.5);
        part.mesh.setColorAt(n, this.c);
      }
      n++;
    }
    for (const part of this.parts) {
      part.mesh.count = n;
      part.mesh.instanceMatrix.needsUpdate = true;
      if (part.mesh.instanceColor) part.mesh.instanceColor.needsUpdate = true;
    }

    // Selection ring and route of the selected truck.
    const pos = this.routeGeo.attributes.position as THREE.BufferAttribute;
    let k = 0;
    this.ring.count = 0;
    const sel = this.curr.find((v) => v.id === this.selected && v.state !== 'destroyed');
    if (sel) {
      const p = this.position(sel.id, alpha)!;
      this.m.compose(this.p.set(p.x, 0.06, p.y), this.q.identity(), this.s.setScalar(scale));
      this.ring.setMatrixAt(0, this.m);
      this.ring.count = 1;
      this.ring.instanceMatrix.needsUpdate = true;
      let px = p.x;
      let py = p.y;
      for (let i = 0; i + 1 < sel.path.length && k + 2 <= 2048; i += 2) {
        pos.setXYZ(k++, px, 0.2, py);
        pos.setXYZ(k++, sel.path[i], 0.2, sel.path[i + 1]);
        px = sel.path[i];
        py = sel.path[i + 1];
      }
    }
    pos.needsUpdate = true;
    this.routeGeo.setDrawRange(0, k);
  }
}
