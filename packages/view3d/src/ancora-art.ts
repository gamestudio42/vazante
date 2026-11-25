import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Original FT Âncora paint and equipment, shared by military scenery and infantry. */
export const ANCORA = { hull: 0x49686b, dark: 0x293c43, canvas: 0x96957a, ivory: 0xd7ceb0, rubber: 0x303739, steel: 0x737e79 };
function box(w: number, h: number, d: number, x: number, y: number, z: number, color: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed().translate(x, y, z);
  const c = new THREE.Color(color), colors = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) c.toArray(colors, i);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.deleteAttribute('uv');
  return g;
}
function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const geometry = mergeGeometries(parts)!;
  parts.forEach(p => p.dispose());
  return geometry;
}

/** Local x is length. All details remain within the authoritative occupied footprint. */
export function ancoraProp(kind: 'Tank' | 'Container_Long' | 'Tent'): THREE.BufferGeometry {
  const a = ANCORA;
  const p: THREE.BufferGeometry[] = [];
  const add = (w: number, h: number, d: number, x: number, y: number, z: number, c: number) => p.push(box(w, h, d, x, y, z, c));
  if (kind === 'Tank') {
    add(5.4, 0.65, 2.8, -0.3, 1.15, 0, a.hull);
    add(4.4, 0.3, 2.5, -0.55, 1.62, 0, a.hull);
    add(2.25, 0.65, 1.95, -0.15, 2.02, 0, a.dark);
    add(1.9, 0.14, 1.75, -0.15, 2.4, 0, a.hull);
    add(3.1, 0.18, 0.18, 2, 2.07, 0, a.steel);
    add(0.4, 0.26, 0.28, 3.55, 2.07, 0, a.dark);
    add(0.65, 0.16, 0.65, -0.5, 2.54, 0.2, a.steel);
    add(0.04, 1.05, 0.04, -1, 2.9, -0.65, a.dark);
    for (const s of [-1, 1]) {
      add(5.5, 0.85, 0.58, -0.3, 0.55, s * 1.43, a.rubber);
      for (let i = 0; i < 6; i++) {
        add(0.52, 0.5, 0.08, -2.5 + i * 0.87, 0.55, s * 1.75, a.steel);
        add(0.77, 0.48, 0.12, -2.5 + i * 0.87, 1.13, s * 1.74, a.hull);
      }
      add(0.35, 0.48, 0.14, 1, 1.13, s * 1.75, a.ivory);
      add(0.65, 0.48, 0.44, -1.85, 1.87, s * 0.93, a.canvas);
      add(0.65, 0.18, 0.04, -0.1, 2.08, s * 0.99, a.ivory);
    }
    for (let i = 0; i < 5; i++) add(0.12, 0.05, 1.1, -2.2 + i * 0.21, 1.8, 0, a.dark);
  } else if (kind === 'Container_Long') {
    add(6.1, 2.6, 2.6, 0, 1.3, 0, a.hull);
    for (const s of [-1, 1]) {
      for (let i = 0; i < 15; i++) add(0.09, 2.35, 0.07, -2.8 + i * 0.4, 1.3, s * 1.33, a.steel);
      for (const y of [0.1, 2.6]) add(6.2, 0.16, 0.16, 0, y, s * 1.32, a.dark);
      add(1.1, 0.42, 0.09, -1.3, 1.85, s * 1.36, a.ivory);
      for (const x of [-3, 3]) add(0.16, 2.6, 0.16, x, 1.3, s * 1.32, a.ivory);
      for (const z of [-0.65, 0.65]) add(0.09, 2.2, 0.07, s * 3.09, 1.3, z, a.ivory);
      add(0.08, 2.4, 0.04, s * 3.1, 1.3, 0, a.dark);
    }
  } else {
    add(7, 1.4, 3.4, 0, 0.7, 0, a.canvas);
    // Sloped canvas panels with raised seams, not an unbroken triangular block.
    for (const s of [-1, 1]) {
      const panel = box(7.15, 0.12, 2.05, 0, 0, 0, a.canvas);
      panel.rotateX(s * 0.59).translate(0, 1.96, s * 0.85); p.push(panel);
      for (const x of [-3.3, -1.1, 1.1, 3.3]) {
        const seam = box(0.07, 0.15, 2.05, 0, 0, 0, a.ivory);
        seam.rotateX(s * 0.59).translate(x, 1.99, s * 0.85); p.push(seam);
      }
      add(7, 0.28, 0.08, 0, 0.18, s * 1.72, a.dark);
      for (const x of [-2, 0, 2]) add(0.7, 0.44, 0.08, x, 1, s * 1.72, a.dark);
      add(0.08, 1.5, 1.1, s * 3.53, 0.75, 0, a.dark);
      add(0.09, 0.22, 1.35, s * 3.54, 1.65, 0, a.ivory);
    }
  }
  return merge(p);
}

/** Attach rigid field gear to the existing torso bone before animation baking. */
export function equipAncoraSoldier(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  let torso: THREE.Object3D | undefined;
  root.traverse(o => { if (o.type === 'Bone' && o.name === 'Torso') torso = o; });
  if (!torso) throw new Error('Soldier rig is missing the Torso bone');
  const bounds = new THREE.Box3().setFromObject(root, true);
  const h = bounds.max.y - bounds.min.y;
  const center = bounds.getCenter(new THREE.Vector3());
  const add = (w: number, height: number, d: number, x: number, y: number, z: number, color: number) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w * h, height * h, d * h), new THREE.MeshStandardMaterial({ color }));
    mesh.name = 'AncoraFieldGear';
    mesh.position.set(center.x + x * h, bounds.min.y + y * h, center.z + z * h);
    root.add(mesh); root.updateMatrixWorld(true); torso!.attach(mesh);
  };
  // The source rig faces +z; the baker performs the final facing conversion.
  add(0.25, 0.19, 0.1, 0, 0.59, 0.075, ANCORA.dark);
  for (const x of [-0.075, 0, 0.075]) add(0.06, 0.075, 0.06, x, 0.56, 0.14, ANCORA.canvas);
  add(0.19, 0.24, 0.1, 0, 0.59, -0.12, ANCORA.canvas);
  add(0.025, 0.17, 0.115, -0.06, 0.59, -0.12, ANCORA.ivory);
  add(0.12, 0.025, 0.02, 0, 0.65, 0.13, ANCORA.ivory);
}
