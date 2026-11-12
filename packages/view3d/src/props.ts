import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { COLLISION, type MapInfo } from '@vazante/shared';
import { toon } from './materials.ts';
import { PALETTE } from './palette.ts';

/**
 * Set dressing from the CC0 kit: wrecked cars along the curbs, road barriers at crossings, and a
 * lived-in look for the base and the depot (sandbag positions, containers, an armoured vehicle).
 * The simulation supplies occupied footprints and placements; no objects are placed independently.
 */

export type PropName = 'Debris_BrokenCar' | 'SackTrench' | 'Barrier_Large' | 'Container_Long' | 'Tank';

interface PropSpec {
  /** Longest horizontal size in metres. */
  length: number;
  /** Colour overrides (sRGB hex) by material name. */
  colors?: Record<string, number>;
}

const SPECS: Record<PropName, PropSpec> = {
  Debris_BrokenCar: { length: 4.4 },
  SackTrench: { length: 3.4 },
  Barrier_Large: { length: 3.2 },
  Container_Long: { length: 6.1, colors: { Red: 0x6b5a3a } },
  Tank: { length: 6.6, colors: { Tank_Main: 0x55603a, Tank_Main2: 0x434b2e } },
};

export interface Placement {
  x: number;
  y: number;
  /** Rotation around +y; at 0 the prop's length runs along x. */
  yaw: number;
}

/** Merge a glTF scene into one vertex-coloured geometry, length along x, standing on y = 0. */
async function loadProp(url: string, spec: PropSpec): Promise<THREE.BufferGeometry> {
  const gltf = await new GLTFLoader().loadAsync(url);
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const c = new THREE.Color();
  const v = new THREE.Vector3();
  const nm = new THREE.Matrix3();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const g = mesh.geometry;
    const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
    const override = spec.colors?.[mat.name];
    if (override !== undefined) c.setHex(override);
    else c.copy(mat.color);
    nm.getNormalMatrix(mesh.matrixWorld);
    const pa = g.getAttribute('position');
    const na = g.getAttribute('normal');
    const base = pos.length / 3;
    for (let i = 0; i < pa.count; i++) {
      v.fromBufferAttribute(pa, i).applyMatrix4(mesh.matrixWorld);
      pos.push(v.x, v.y, v.z);
      if (na) v.fromBufferAttribute(na, i).applyMatrix3(nm).normalize();
      else v.set(0, 1, 0);
      nor.push(v.x, v.y, v.z);
      col.push(c.r, c.g, c.b);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(base + g.index.getX(i));
    else for (let i = 0; i < pa.count; i++) idx.push(base + i);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeBoundingBox();
  const b = geo.boundingBox!;
  const sx = b.max.x - b.min.x;
  const sz = b.max.z - b.min.z;
  if (sz > sx) geo.rotateY(Math.PI / 2);
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const k = spec.length / Math.max(bb.max.x - bb.min.x, 0.01);
  geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  geo.scale(k, k, k);
  return geo;
}

/** The worker owns placement and collision; the renderer only consumes it. */
export function placeProps(map: MapInfo): Record<PropName, Placement[]> {
  const out: Record<PropName, Placement[]> = { Debris_BrokenCar: [], SackTrench: [], Barrier_Large: [], Container_Long: [], Tank: [] };
  for (const prop of map.props ?? []) if (prop.kind !== 'Tent') out[prop.kind].push(prop);
  return out;
}

/** A ridge tent: triangular prism with a darker roof line, length along x. */
function tentGeometry(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(2.4, 2.4, 7, 3, 1).toNonIndexed();
  g.rotateZ(Math.PI / 2);
  g.rotateX(Math.PI / 6);
  g.computeBoundingBox();
  g.translate(0, -g.boundingBox!.min.y, 0);
  g.scale(1, 0.75, 0.9);
  g.computeVertexNormals();
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  const c = new THREE.Color(PALETTE.tent);
  for (let i = 0; i < n; i++) {
    const k = 0.85 + 0.15 * (g.getAttribute('position').getY(i) / 3);
    col.set([c.r * k, c.g * k, c.b * k], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Instanced props, one draw call per kind. */
export async function buildProps(map: MapInfo, baseUrl: string): Promise<THREE.Group> {
  const group = new THREE.Group();
  const placements = placeProps(map);
  const mat = toon({ vertexColors: true });
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  const tents = (map.props ?? []).filter(p => p.kind === 'Tent');
  if (tents.length) {
    const mesh = new THREE.InstancedMesh(tentGeometry(), mat, tents.length);
    tents.forEach((pl, i) => mesh.setMatrixAt(i, m.compose(p.set(pl.x, 0, pl.y), q.identity(), s)));
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.name = 'Tent';
    group.add(mesh);
  }
  await Promise.all(
    (Object.keys(SPECS) as PropName[]).map(async (name) => {
      const list = placements[name];
      if (!list.length) return;
      const geo = await loadProp(`${baseUrl}props/${name}.glb`, SPECS[name]);
      geo.computeBoundingBox();
      const bounds = geo.boundingBox!;
      const footprint = COLLISION.props[name];
      const fit = Math.min(1, footprint.length / (bounds.max.x - bounds.min.x), footprint.width / (bounds.max.z - bounds.min.z));
      geo.scale(fit, fit, fit);
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((pl, i) => {
        q.setFromAxisAngle(up, pl.yaw);
        p.set(pl.x, 0, pl.y);
        mesh.setMatrixAt(i, m.compose(p, q, s));
      });
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = name;
      group.add(mesh);
    }),
  );
  return group;
}
