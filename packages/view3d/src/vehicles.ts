import * as THREE from 'three';
import type { VehicleView } from '@vazante/shared';
import { toon } from './materials.ts';
import { PALETTE } from './palette.ts';

const CAP = 64;

/** Box truck: cab at the front (local -z), flat bed with crates; length 6 m, width 2.4 m. */
function truckParts(): { geo: THREE.BufferGeometry; color: number }[] {
  const cab = new THREE.BoxGeometry(2.3, 2.2, 1.8);
  cab.translate(0, 1.5, -2.1);
  const bed = new THREE.BoxGeometry(2.4, 0.5, 4.2);
  bed.translate(0, 0.85, 0.8);
  const cargo = new THREE.BoxGeometry(2.1, 1.3, 3.6);
  cargo.translate(0, 1.75, 0.9);
  const wheels = new THREE.BoxGeometry(2.6, 0.8, 0.8);
  const w2 = wheels.clone();
  wheels.translate(0, 0.4, -1.9);
  w2.translate(0, 0.4, 1.8);
  return [
    { geo: cab, color: PALETTE.truckCab },
    { geo: bed, color: PALETTE.truck },
    { geo: cargo, color: PALETTE.cargo },
    { geo: wheels, color: PALETTE.boots },
    { geo: w2, color: PALETTE.boots },
  ];
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
