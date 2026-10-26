import * as THREE from 'three';

/** Radial falloff texture shared by every light pool. */
function poolTexture(): THREE.CanvasTexture {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Fake lights for the night: additive pools on the ground under street lamps, floodlights at bases
 * and depots, and flashlight beams in front of soldiers. Cheap at any count (one instanced draw),
 * unlike real point lights, and they read well through the pixel post-process.
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
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      toneMapped: false,
      opacity: 0,
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
    this.material.opacity = night * 0.7;
    this.mesh.visible = night > 0.01;
  }
}
