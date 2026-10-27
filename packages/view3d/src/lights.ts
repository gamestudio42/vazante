import * as THREE from 'three';

/** Radial falloff texture shared by every light pool. */
function poolTexture(): THREE.CanvasTexture {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  // Intensity in the colour channels (the pool multiplies what it lands on): a bright core and an
  // inverse-square-like tail that reaches zero at the rim.
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2);
      const k = r >= 1 ? 0 : (1 - r * r) ** 2 / (1 + 6 * r * r);
      const v = Math.round(255 * k);
      img.data.set([v, v, v, 255], (y * size + x) * 4);
    }
  }
  g.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}

/**
 * Fake lights for the night: pools on the ground under street lamps, floodlights at bases and
 * depots, and flashlight beams in front of soldiers. Each pool multiplies the colour already on
 * screen (dst + dst * light), so asphalt stays asphalt and grass stays green under a lamp instead
 * of being washed grey. Cheap at any count (one instanced draw), unlike real point lights.
 */
export class LightPools {
  readonly mesh: THREE.InstancedMesh;
  private readonly material: THREE.MeshBasicMaterial;
  private staticCount = 0;
  private n = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly c = new THREE.Color();
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor(capacity: number) {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    this.material = new THREE.MeshBasicMaterial({
      map: poolTexture(),
      transparent: true,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.DstColorFactor,
      blendDst: THREE.OneFactor,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    });
    this.mesh = new THREE.InstancedMesh(geo, this.material, capacity);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  private put(x: number, y: number, w: number, l: number, yaw: number, color: number, gain: number): void {
    if (this.n >= this.mesh.instanceMatrix.count) return;
    this.q.setFromAxisAngle(this.up, yaw);
    this.m.compose(this.p.set(x, 0.05, y), this.q, this.s.set(w, 1, l));
    this.mesh.setMatrixAt(this.n, this.m);
    this.mesh.setColorAt(this.n, this.c.set(color).multiplyScalar(gain));
    this.n++;
  }

  /** Lights that never move; call once, before any dynamic ones. */
  addStatic(x: number, y: number, radius: number, color: number, gain = 1): void {
    this.put(x, y, radius * 2, radius * 2, 0, color, gain);
    this.staticCount = this.n;
  }

  beginDynamic(): void {
    this.n = this.staticCount;
  }

  /** A beam starting at (x, y) pointing along (fx, fy). */
  addBeam(x: number, y: number, fx: number, fy: number, length: number, width: number, color: number, gain = 1): void {
    const yaw = Math.atan2(fx, fy);
    this.put(x + fx * length * 0.5, y + fy * length * 0.5, width, length, yaw, color, gain);
  }

  addPool(x: number, y: number, radius: number, color: number, gain = 1): void {
    this.put(x, y, radius * 2, radius * 2, 0, color, gain);
  }

  end(night: number): void {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    // The scene target is half float, so a pool can brighten a dark street several times over.
    this.material.color.setScalar(night * 6);
    this.mesh.visible = night > 0.01;
  }
}
