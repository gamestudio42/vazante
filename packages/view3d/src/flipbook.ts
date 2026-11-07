import * as THREE from 'three';

/** A horizontal strip of square frames, played once at a fixed rate (see docs/assets.md). */
export interface FlipbookAtlas {
  file: string;
  frames: number;
  fps: number;
}

export interface FlipbookOptions {
  /** Lie flat on the ground instead of facing the camera. */
  ground?: boolean;
  /** Metres to move each quad towards the camera, for effects that start inside a solid body. */
  nudge?: number;
  /**
   * Keep the art's up on screen. Off, each animation turns at a random angle so repeats differ,
   * which suits round effects; anything with a base on the ground or that falls must stay upright.
   */
  upright?: boolean;
  /** Multiplies the atlas colour; lets one white atlas serve several tones (0xffffff keeps it). */
  tint?: number;
}

const VERT = /* glsl */ `
  attribute vec3 aOffset;
  attribute float aSize;
  attribute float aFrame;
  attribute float aSpin;
  uniform float frames;
  uniform float nudge;
  varying vec2 vUv;
  void main() {
    vUv = vec2((uv.x + aFrame) / frames, uv.y);
    // Quad around the effect centre, turned by its own angle so repeats differ.
    float c = cos(aSpin);
    float s = sin(aSpin);
    vec2 corner = mat2(c, s, -s, c) * position.xy * aSize;
  #ifdef GROUND
    // Flat on the ground (rings that spread over the street), facing up: -y keeps the winding.
    gl_Position = projectionMatrix * modelViewMatrix * vec4(aOffset + vec3(corner.x, 0.0, -corner.y), 1.0);
  #else
    // Facing the camera, moved 'nudge' metres towards it (out of the surface that was struck).
    vec4 mv = modelViewMatrix * vec4(aOffset, 1.0);
    mv.xy += corner;
    mv.z += nudge;
    gl_Position = projectionMatrix * mv;
  #endif
  }
`;
const FRAG = /* glsl */ `
  uniform sampler2D map;
  uniform float shade;
  uniform vec3 tint;
  varying vec2 vUv;
  void main() {
    vec4 c = texture2D(map, vUv);
    if (c.a < 0.03) discard;
    gl_FragColor = vec4(c.rgb * tint * shade, c.a);
  }
`;

interface Shot {
  x: number;
  y: number;
  z: number;
  size: number;
  spin: number;
  age: number;
}

/**
 * One-shot sprite animations from a baked atlas (explosions, bursts), one draw call per atlas.
 * Purely visual. Until the atlas loads (or if it fails) play() does nothing, and the procedural
 * particles drawn for the same event still show.
 */
export class FlipbookLayer {
  readonly mesh: THREE.Mesh;
  /** Multiplies the colour: 1 for light sources (fire), lower at night for lit matter (bile). */
  shade = 1;
  private readonly geo: THREE.InstancedBufferGeometry;
  private readonly mat: THREE.ShaderMaterial;
  private readonly offset: Float32Array;
  private readonly size: Float32Array;
  private readonly frame: Float32Array;
  private readonly spin: Float32Array;
  private readonly shots: Shot[] = [];
  private ready = false;

  private readonly upright: boolean;

  constructor(
    private readonly atlas: FlipbookAtlas,
    private readonly capacity: number,
    { ground = false, nudge = 0, upright = false, tint = 0xffffff }: FlipbookOptions = {},
  ) {
    this.upright = upright;
    const base = new THREE.PlaneGeometry(1, 1);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = base.index;
    this.geo.setAttribute('position', base.getAttribute('position'));
    this.geo.setAttribute('uv', base.getAttribute('uv'));
    this.offset = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.frame = new Float32Array(capacity);
    this.spin = new Float32Array(capacity);
    this.geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(this.offset, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aFrame', new THREE.InstancedBufferAttribute(this.frame, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSpin', new THREE.InstancedBufferAttribute(this.spin, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.instanceCount = 0;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: null }, frames: { value: atlas.frames }, shade: { value: 1 }, nudge: { value: nudge }, tint: { value: new THREE.Color(tint) } },
      defines: ground ? { GROUND: '' } : {},
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
  }

  async load(baseUrl: string): Promise<void> {
    const tex = await new THREE.TextureLoader().loadAsync(`${baseUrl}${this.atlas.file}`);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    this.mat.uniforms.map.value = tex;
    this.ready = true;
  }

  /**
   * Start one animation centred at world (x, y), z metres up, `size` metres across. Returns false
   * while the atlas is not loaded, so a caller can draw its procedural stand-in instead.
   */
  play(x: number, y: number, z: number, size: number): boolean {
    if (!this.ready) return false;
    if (this.shots.length >= this.capacity) this.shots.shift();
    this.shots.push({ x, y, z, size, spin: this.upright ? 0 : Math.random() * Math.PI * 2, age: 0 });
    return true;
  }

  update(dt: number): void {
    const last = this.atlas.frames - 1;
    let n = 0;
    for (const s of this.shots) {
      s.age += dt;
      const f = Math.floor(s.age * this.atlas.fps);
      if (f > last) continue;
      this.offset[n * 3] = s.x;
      this.offset[n * 3 + 1] = s.z;
      this.offset[n * 3 + 2] = s.y;
      this.size[n] = s.size;
      this.frame[n] = f;
      this.spin[n] = s.spin;
      this.shots[n++] = s;
    }
    this.shots.length = n;
    this.mat.uniforms.shade.value = this.shade;
    this.geo.instanceCount = n;
    for (const name of ['aOffset', 'aSize', 'aFrame', 'aSpin']) (this.geo.getAttribute(name) as THREE.InstancedBufferAttribute).needsUpdate = true;
  }
}
