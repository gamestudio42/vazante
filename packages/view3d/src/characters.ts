import * as THREE from 'three';

/** Pose of a procedural humanoid. Angles in radians, blends in 0..1. */
export interface Pose {
  /** Leg swing (walk cycle) angle. */
  legSwing: number;
  /** Arm pitch, positive raises the arm forward. */
  armL: number;
  armR: number;
  /** Torso lean forward. */
  lean: number;
  /** 0 standing, 1 lying on the ground. */
  lie: number;
  /** Vertical bob in metres. */
  bob: number;
}

export const IDLE_POSE: Pose = { legSwing: 0, armL: 0, armR: 0, lean: 0, lie: 0, bob: 0 };

type PartName = 'legL' | 'legR' | 'torso' | 'head' | 'armL' | 'armR' | 'weapon';

interface PartSpec {
  name: PartName;
  size: [number, number, number];
  /** Pivot (joint) position relative to the feet. */
  pivot: [number, number, number];
  /** Offset of the box centre from the pivot. */
  offset: [number, number, number];
}

const PARTS: PartSpec[] = [
  { name: 'legL', size: [0.2, 0.86, 0.22], pivot: [-0.13, 0.9, 0], offset: [0, -0.43, 0] },
  { name: 'legR', size: [0.2, 0.86, 0.22], pivot: [0.13, 0.9, 0], offset: [0, -0.43, 0] },
  { name: 'torso', size: [0.52, 0.66, 0.3], pivot: [0, 0.9, 0], offset: [0, 0.33, 0] },
  { name: 'head', size: [0.28, 0.3, 0.28], pivot: [0, 1.56, 0], offset: [0, 0.15, 0] },
  { name: 'armL', size: [0.14, 0.68, 0.14], pivot: [-0.34, 1.5, 0], offset: [0, -0.32, 0] },
  { name: 'armR', size: [0.14, 0.68, 0.14], pivot: [0.34, 1.5, 0], offset: [0, -0.32, 0] },
  { name: 'weapon', size: [0.08, 0.1, 0.78], pivot: [0.2, 1.22, 0], offset: [0, 0, -0.38] },
];

export interface CharacterColors {
  torso: THREE.Color;
  legs: THREE.Color;
  skin: THREE.Color;
  arms: THREE.Color;
  weapon?: THREE.Color;
}

/**
 * A batch of procedural humanoids drawn with one InstancedMesh per body part.
 * Front of the character is local -z.
 */
export class CharacterBatch {
  readonly group = new THREE.Group();
  private readonly meshes = new Map<PartName, THREE.InstancedMesh>();
  private readonly specs: PartSpec[];
  private readonly root = new THREE.Matrix4();
  private readonly tmp = new THREE.Matrix4();
  private readonly tmp2 = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly e = new THREE.Euler();
  count = 0;

  constructor(capacity: number, material: THREE.Material, withWeapon: boolean) {
    this.specs = PARTS.filter((p) => withWeapon || p.name !== 'weapon');
    for (const p of this.specs) {
      const g = new THREE.BoxGeometry(...p.size);
      g.translate(...p.offset);
      const m = new THREE.InstancedMesh(g, material, capacity);
      m.count = 0;
      m.castShadow = true;
      m.receiveShadow = false;
      m.frustumCulled = false;
      this.meshes.set(p.name, m);
      this.group.add(m);
    }
  }

  begin(): void {
    this.count = 0;
  }

  /** Write one character at (x, y) on the simulation plane. `yaw` rotates around +y; the character faces its local -z. */
  add(x: number, y: number, yaw: number, scale: number, pose: Pose, colors: CharacterColors): void {
    const i = this.count++;
    this.q.setFromAxisAngle(Y_AXIS, yaw);
    this.s.set(scale, scale, scale);
    this.v.set(x, pose.bob * scale, y);
    this.root.compose(this.v, this.q, this.s);
    if (pose.lie > 0) {
      // Fall backwards around the feet.
      this.tmp.makeRotationX((Math.PI / 2) * pose.lie);
      this.tmp2.makeTranslation(0, 0.12 * pose.lie, 0);
      this.root.multiply(this.tmp2).multiply(this.tmp);
    }
    for (const p of this.specs) {
      const mesh = this.meshes.get(p.name)!;
      let rx = 0;
      switch (p.name) {
        case 'legL':
          rx = pose.legSwing;
          break;
        case 'legR':
          rx = -pose.legSwing;
          break;
        case 'torso':
        case 'head':
          rx = -pose.lean;
          break;
        case 'armL':
          rx = pose.armL;
          break;
        case 'armR':
          rx = pose.armR;
          break;
        case 'weapon':
          // Hanging arm points the barrel down; a raised arm levels it.
          rx = pose.armR - Math.PI / 2;
          break;
      }
      this.e.set(rx, 0, 0);
      this.q.setFromEuler(this.e);
      let px = p.pivot[0];
      let py = p.pivot[1];
      let pz = p.pivot[2];
      if (p.name === 'head' && pose.lean !== 0) {
        // Head follows the leaning torso.
        pz -= Math.sin(pose.lean) * 0.66;
        py -= (1 - Math.cos(pose.lean)) * 0.66;
      }
      if (p.name === 'weapon') {
        // The weapon sits at the right hand: follow the arm swing.
        const a = pose.armR;
        px = 0.3;
        py = 1.5 - Math.cos(a) * 0.6;
        pz = -Math.sin(a) * 0.6;
      }
      this.v.set(px, py, pz);
      this.s.set(1, 1, 1);
      this.tmp.compose(this.v, this.q, this.s);
      this.tmp2.multiplyMatrices(this.root, this.tmp);
      mesh.setMatrixAt(i, this.tmp2);
      const c =
        p.name === 'torso' ? colors.torso : p.name === 'head' ? colors.skin : p.name === 'weapon' ? (colors.weapon ?? colors.legs) : p.name.startsWith('arm') ? colors.arms : colors.legs;
      mesh.setColorAt(i, c);
    }
  }

  end(): void {
    for (const m of this.meshes.values()) {
      m.count = this.count;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }
}

const Y_AXIS = new THREE.Vector3(0, 1, 0);

/** Walk-cycle helpers. `phase` advances with distance travelled so feet match speed. */
export function walkPose(phase: number, amount: number, base: Pose = IDLE_POSE): Pose {
  const s = Math.sin(phase);
  return {
    ...base,
    legSwing: s * 0.6 * amount,
    armL: base.armL + -s * 0.5 * amount,
    armR: base.armR + s * 0.5 * amount,
    bob: Math.abs(Math.cos(phase)) * 0.05 * amount,
  };
}
