import * as THREE from 'three';

const Y_UP = new THREE.Vector3(0, 1, 0);

/** Ring buffer of flat ground decals (blood, scorch), drawn as one instanced mesh. */
export class DecalLayer {
  readonly mesh: THREE.InstancedMesh;
  private next = 0;
  private used = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();

  constructor(capacity: number, color: number, opacity: number) {
    const g = new THREE.CircleGeometry(0.5, 7);
    g.rotateX(-Math.PI / 2);
    this.mesh = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }), capacity);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.receiveShadow = false;
  }

  add(x: number, y: number, size: number, angle: number, stretch = 1): void {
    this.q.setFromAxisAngle(Y_UP, angle);
    this.p.set(x, 0.03 + (this.next % 7) * 0.002, y);
    this.s.set(size * stretch, 1, size);
    this.m.compose(this.p, this.q, this.s);
    this.mesh.setMatrixAt(this.next, this.m);
    this.next = (this.next + 1) % this.mesh.instanceMatrix.count;
    this.used = Math.min(this.used + 1, this.mesh.instanceMatrix.count);
    this.mesh.count = this.used;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
  color: number;
  gravity: number;
}

/** Small CPU particle system: sparks, blood spray, dust, muzzle flashes. */
export class Particles {
  readonly mesh: THREE.InstancedMesh;
  private readonly list: Particle[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly c = new THREE.Color();

  constructor(private readonly capacity: number) {
    const g = new THREE.BoxGeometry(1, 1, 1);
    this.mesh = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ toneMapped: false }), capacity);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
  }

  emit(x: number, y: number, z: number, n: number, opts: { speed: number; up: number; life: number; size: number; color: number; gravity?: number; dirX?: number; dirY?: number; spread?: number }): void {
    for (let i = 0; i < n; i++) {
      if (this.list.length >= this.capacity) this.list.shift();
      const spread = opts.spread ?? 1;
      const a = Math.random() * Math.PI * 2;
      const sp = opts.speed * (0.4 + Math.random() * 0.6);
      const dx = (opts.dirX ?? 0) + Math.cos(a) * spread;
      const dy = (opts.dirY ?? 0) + Math.sin(a) * spread;
      this.list.push({
        x,
        y,
        z,
        vx: dx * sp,
        vy: dy * sp,
        vz: opts.up * (0.5 + Math.random()),
        life: 0,
        max: opts.life * (0.6 + Math.random() * 0.4),
        size: opts.size,
        color: opts.color,
        gravity: opts.gravity ?? 9.8,
      });
    }
  }

  update(dt: number): void {
    let n = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life += dt;
      if (p.life >= p.max) {
        this.list.splice(i, 1);
        continue;
      }
      p.vz -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z = Math.max(0.02, p.z + p.vz * dt);
      const k = 1 - p.life / p.max;
      this.p.set(p.x, p.z, p.y);
      this.s.setScalar(p.size * (0.4 + 0.6 * k));
      this.m.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(n, this.m);
      this.mesh.setColorAt(n, this.c.set(p.color));
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

/** Expanding ring at an order destination. */
export class OrderMarkers {
  readonly group = new THREE.Group();
  private readonly items: { mesh: THREE.Mesh; age: number }[] = [];
  private readonly geo: THREE.RingGeometry;

  constructor(private readonly color: number) {
    this.geo = new THREE.RingGeometry(0.85, 1, 20);
    this.geo.rotateX(-Math.PI / 2);
  }

  /** Finished markers are kept and reused: disposing the last material would free its shader program, and the next order would recompile it mid-game. */
  private readonly pool: THREE.Mesh[] = [];

  add(x: number, y: number): void {
    const mesh = this.pool.pop() ?? new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ color: this.color, transparent: true, depthWrite: false }));
    mesh.position.set(x, 0.08, y);
    this.group.add(mesh);
    this.items.push({ mesh, age: 0 });
  }

  update(dt: number, scale: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.age += dt;
      const k = it.age / 0.7;
      if (k >= 1) {
        this.group.remove(it.mesh);
        this.pool.push(it.mesh);
        this.items.splice(i, 1);
        continue;
      }
      const r = (3 - 2 * k) * scale;
      it.mesh.scale.set(r, 1, r);
      (it.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - k;
    }
  }
}

/** The active mission area: a pulsing amber frame on the ground with a faint fill. */
export class ZoneMarker {
  readonly group = new THREE.Group();
  private readonly fill: THREE.Mesh;
  private readonly edges: THREE.Mesh[] = [];
  private key = '';

  constructor(color: number) {
    const plane = new THREE.PlaneGeometry(1, 1);
    plane.rotateX(-Math.PI / 2);
    plane.translate(0.5, 0, 0.5);
    this.fill = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.1, depthWrite: false, fog: false }));
    const edgeMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, fog: false });
    for (let i = 0; i < 4; i++) this.edges.push(new THREE.Mesh(plane, edgeMat));
    this.group.add(this.fill, ...this.edges);
    this.group.position.y = 0.12;
    this.group.renderOrder = 2;
    this.group.visible = false;
  }

  /** Show the area (metres) or hide it with null. Rebuilds only when the area changes. */
  set(area: { x0: number; y0: number; x1: number; y1: number } | null): void {
    this.group.visible = area !== null;
    if (!area) return;
    const key = `${area.x0},${area.y0},${area.x1},${area.y1}`;
    if (key === this.key) return;
    this.key = key;
    const w = area.x1 - area.x0;
    const h = area.y1 - area.y0;
    this.fill.position.set(area.x0, 0, area.y0);
    this.fill.scale.set(w, 1, h);
    const t = 1.2;
    const rects: [number, number, number, number][] = [
      [area.x0, area.y0, w, t],
      [area.x0, area.y1 - t, w, t],
      [area.x0, area.y0, t, h],
      [area.x1 - t, area.y0, t, h],
    ];
    rects.forEach(([x, y, sw, sh], i) => {
      this.edges[i].position.set(x, 0, y);
      this.edges[i].scale.set(sw, 1, sh);
    });
  }

  update(t: number): void {
    if (!this.group.visible) return;
    (this.fill.material as THREE.MeshBasicMaterial).opacity = 0.08 + 0.06 * (0.5 + 0.5 * Math.sin(t * 3));
  }
}
