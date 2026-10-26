import * as THREE from 'three';

/** Soft round sprite. */
function puffTexture(): THREE.CanvasTexture {
  const size = 32;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

const VERT = /* glsl */ `
  attribute vec3 aOffset;
  attribute float aSize;
  attribute vec4 aColor;
  varying vec2 vUv;
  varying vec4 vColor;
  void main() {
    vUv = uv;
    vColor = aColor;
    // Camera-facing quad around the particle centre.
    vec4 mv = modelViewMatrix * vec4(aOffset, 1.0);
    mv.xy += position.xy * aSize;
    gl_Position = projectionMatrix * mv;
  }
`;
const FRAG = /* glsl */ `
  uniform sampler2D map;
  varying vec2 vUv;
  varying vec4 vColor;
  void main() {
    float a = texture2D(map, vUv).a * vColor.a;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor.rgb, a);
  }
`;

interface Puff {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  size0: number;
  size1: number;
  kind: 0 | 1; // 0 fire (additive), 1 smoke (alpha)
}

/** Billboard sprites with per-particle colour and alpha; one draw call per blend mode. */
class SpriteBatch {
  readonly mesh: THREE.Mesh;
  private readonly geo: THREE.InstancedBufferGeometry;
  private readonly offset: Float32Array;
  private readonly size: Float32Array;
  private readonly color: Float32Array;

  constructor(
    readonly capacity: number,
    additive: boolean,
    tex: THREE.Texture,
  ) {
    const base = new THREE.PlaneGeometry(1, 1);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = base.index;
    this.geo.setAttribute('position', base.getAttribute('position'));
    this.geo.setAttribute('uv', base.getAttribute('uv'));
    this.offset = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.color = new Float32Array(capacity * 4);
    this.geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(this.offset, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(this.color, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 4 : 3;
  }

  set(i: number, x: number, y: number, z: number, size: number, r: number, g: number, b: number, a: number): void {
    this.offset[i * 3] = x;
    this.offset[i * 3 + 1] = z;
    this.offset[i * 3 + 2] = y;
    this.size[i] = size;
    this.color.set([r, g, b, a], i * 4);
  }

  commit(n: number): void {
    this.geo.instanceCount = n;
    for (const name of ['aOffset', 'aSize', 'aColor']) (this.geo.getAttribute(name) as THREE.InstancedBufferAttribute).needsUpdate = true;
  }
}

export interface FireSource {
  x: number;
  y: number;
  /** 0..1, scales the flame and the smoke column. */
  strength: number;
  /** Seconds left; Infinity for fires that burn forever. */
  ttl: number;
  /** Height of the fire's base (rooftops). */
  z: number;
}

/**
 * Fire, smoke and explosions. Fires are persistent emitters (burning wrecks, ambient fires in the
 * fallen city); explosions are one-shot bursts. Purely visual.
 */
export class FireAndSmoke {
  readonly group = new THREE.Group();
  readonly fires: FireSource[] = [];
  private readonly puffs: Puff[] = [];
  private readonly flame: SpriteBatch;
  private readonly smoke: SpriteBatch;
  private acc = 0;
  /** Smoke tint follows the time of day (darker at night). */
  smokeShade = 1;

  constructor(capacity = 3000) {
    const tex = puffTexture();
    this.flame = new SpriteBatch(capacity, true, tex);
    this.smoke = new SpriteBatch(capacity, false, tex);
    this.group.add(this.smoke.mesh, this.flame.mesh);
  }

  addFire(x: number, y: number, strength: number, ttl = Infinity, z = 0): FireSource {
    const f = { x, y, strength, ttl, z };
    this.fires.push(f);
    return f;
  }

  explode(x: number, y: number, power = 1): void {
    for (let i = 0; i < 36 * power; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (2 + Math.random() * 7) * power;
      this.push(x, y, 1 + Math.random(), Math.cos(a) * sp, Math.sin(a) * sp, 2 + Math.random() * 6, 0.4 + Math.random() * 0.4, 3 * power, 6.5 * power, 0);
    }
    for (let i = 0; i < 18 * power; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (1 + Math.random() * 3) * power;
      this.push(x, y, 1.5, Math.cos(a) * sp, Math.sin(a) * sp, 1 + Math.random() * 3, 3 + Math.random() * 3, 3 * power, 9 * power, 1);
    }
  }

  private push(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size0: number, size1: number, kind: 0 | 1): void {
    if (this.puffs.length >= this.flame.capacity) return;
    this.puffs.push({ x, y, z, vx, vy, vz, age: 0, life, size0, size1, kind });
  }

  /** Flicker 0..1 for a fire's light at time t (seconds). */
  static flicker(f: FireSource, t: number): number {
    const p = f.x * 0.37 + f.y * 0.11;
    return 0.75 + 0.15 * Math.sin(t * 13 + p) + 0.1 * Math.sin(t * 29 + p * 2);
  }

  update(dt: number): void {
    // Emit from fires at a steady rate.
    this.acc += dt;
    const steps = Math.min(4, Math.floor(this.acc / 0.05));
    this.acc -= steps * 0.05;
    for (let k = this.fires.length - 1; k >= 0; k--) {
      const f = this.fires[k];
      f.ttl -= dt;
      if (f.ttl <= 0) {
        this.fires.splice(k, 1);
        continue;
      }
      const s = f.strength * Math.min(1, f.ttl / 10);
      for (let i = 0; i < steps; i++) {
        const jx = (Math.random() - 0.5) * 1.6 * s;
        const jy = (Math.random() - 0.5) * 1.6 * s;
        this.push(f.x + jx, f.y + jy, f.z + 0.3, jx * 0.3, jy * 0.3, 2.5 + Math.random() * 2, 0.6 + Math.random() * 0.5, 2.2 * s, 0.8 * s, 0);
        if (Math.random() < 0.6) this.push(f.x + jx, f.y + jy, f.z + 2 * s, 0.6 + Math.random() * 0.4, 0.3, 1.8 + Math.random(), 4 + Math.random() * 3, 1.2 * s, 6 * s, 1);
      }
    }
    let nf = 0;
    let ns = 0;
    const shade = this.smokeShade;
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.puffs.splice(i, 1);
        continue;
      }
      const k = p.age / p.life;
      const drag = p.kind === 0 ? 2.5 : 0.6;
      p.vx -= p.vx * Math.min(1, drag * dt);
      p.vy -= p.vy * Math.min(1, drag * dt);
      p.vz -= p.vz * Math.min(1, drag * 0.5 * dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const size = p.size0 + (p.size1 - p.size0) * k;
      if (p.kind === 0) {
        // Yellow core → orange → red, fading out.
        const r = 1;
        const g = 0.85 - 0.6 * k;
        const b = 0.35 - 0.33 * k;
        this.flame.set(nf++, p.x, p.y, p.z, size, r, g, b, (1 - k) * 0.9);
      } else {
        const v = (0.04 + 0.05 * k) * shade;
        const a = Math.min(1, k * 5) * (1 - k) * 0.75;
        this.smoke.set(ns++, p.x, p.y, p.z, size, v, v * 0.97, v * 0.95, a);
      }
    }
    this.flame.commit(nf);
    this.smoke.commit(ns);
  }
}
