import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Ground, type MapInfo } from '@vazante/shared';
import { hash } from './city.ts';
import { toon } from './materials.ts';
import { PALETTE } from './palette.ts';

/**
 * Set dressing from the CC0 kit: wrecked cars along the curbs, road barriers at crossings, and a
 * lived-in look for the base and the depot (sandbag positions, containers, an armoured vehicle).
 * Purely visual: the simulation does not know about these, so they sit where units rarely walk.
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

/** Where each prop goes, from the map alone (same city, same props). */
export function placeProps(map: MapInfo): Record<PropName, Placement[]> {
  const out: Record<PropName, Placement[]> = { Debris_BrokenCar: [], SackTrench: [], Barrier_Large: [], Container_Long: [], Tank: [] };
  const cs = map.cellSize;
  const W = map.width;
  const H = map.height;
  const g = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? -1 : map.ground[y * W + x]);
  const inSite = (x: number, y: number, pad: number) => map.sites.some((s) => x >= s.x0 - pad && x <= s.x1 + pad && y >= s.y0 - pad && y <= s.y1 + pad);

  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (g(x, y) !== Ground.Street || inSite(x, y, 3)) continue;
      const h = hash(x * 92821 + y * 68917 + map.seed * 7);
      // Wrecks park against the curb, along the street.
      if (h % 41 === 0) {
        const curbW = g(x - 1, y) === Ground.Sidewalk;
        const curbE = g(x + 1, y) === Ground.Sidewalk;
        const curbN = g(x, y - 1) === Ground.Sidewalk;
        const curbS = g(x, y + 1) === Ground.Sidewalk;
        const jitter = ((h >> 8) % 100) / 100 - 0.5;
        if ((curbW || curbE) && !(curbN || curbS)) {
          const off = curbW ? -0.9 : 0.9;
          out.Debris_BrokenCar.push({ x: (x + 0.5) * cs + off, y: (y + 0.5) * cs, yaw: Math.PI / 2 + jitter * 0.4 + ((h >> 4) & 1) * Math.PI });
        } else if ((curbN || curbS) && !(curbW || curbE)) {
          const off = curbN ? -0.9 : 0.9;
          out.Debris_BrokenCar.push({ x: (x + 0.5) * cs, y: (y + 0.5) * cs + off, yaw: jitter * 0.4 + ((h >> 4) & 1) * Math.PI });
        }
      }
      // Barriers left across a few side streets.
      if (h % 173 === 1) {
        const horizontal = g(x - 1, y) === Ground.Street && g(x + 1, y) === Ground.Street;
        out.Barrier_Large.push({ x: (x + 0.5) * cs, y: (y + 0.5) * cs, yaw: horizontal ? Math.PI / 2 : 0 });
      }
    }
  }

  const onLot = (pl: Placement) => g(Math.floor(pl.x / cs), Math.floor(pl.y / cs)) === Ground.Lot;
  const siteStart = { SackTrench: out.SackTrench.length, Container_Long: out.Container_Long.length, Tank: out.Tank.length };
  for (const s of map.sites) {
    const x0 = s.x0 * cs;
    const y0 = s.y0 * cs;
    const x1 = (s.x1 + 1) * cs;
    const y1 = (s.y1 + 1) * cs;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    if (s.kind === 'base') {
      // Sandbag fighting positions around the command post, open toward each street.
      const r = 9;
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2 + Math.PI / 4;
        out.SackTrench.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, yaw: -a + Math.PI / 2 });
      }
      out.Container_Long.push({ x: x0 + 5, y: y0 + 7, yaw: Math.PI / 2 }, { x: x0 + 9, y: y0 + 7, yaw: Math.PI / 2 });
      out.Container_Long.push({ x: x1 - 7, y: y1 - 4, yaw: 0 });
      out.Tank.push({ x: x1 - 8, y: y0 + 7, yaw: Math.PI * 0.8 });
    } else {
      // Depot: a container yard.
      for (let i = 0; i < 3; i++) out.Container_Long.push({ x: x0 + 6, y: y0 + 5 + i * 3.2, yaw: 0 });
      for (let i = 0; i < 2; i++) out.Container_Long.push({ x: x1 - 6, y: y1 - 5 - i * 3.2, yaw: 0 });
      out.SackTrench.push({ x: cx, y: y0 + 3, yaw: 0 }, { x: cx, y: y1 - 3, yaw: Math.PI });
    }
  }
  // Site dressing goes on the gravel lots only, never across a street.
  out.Container_Long = [...out.Container_Long.slice(0, siteStart.Container_Long), ...out.Container_Long.slice(siteStart.Container_Long).filter(onLot)];
  out.Tank = out.Tank.filter(onLot);
  return out;
}

/** Lot blocks inside the base big enough for a tent (2 x 3 cells), at most `max`. */
function tentSpots(map: MapInfo, max: number): Placement[] {
  const out: Placement[] = [];
  const cs = map.cellSize;
  const base = map.sites.find((s) => s.kind === 'base');
  if (!base) return out;
  const lot = (x: number, y: number) => map.ground[y * map.width + x] === Ground.Lot;
  const cx = (base.x0 + base.x1 + 1) / 2;
  const cy = (base.y0 + base.y1 + 1) / 2;
  for (let y = base.y0 + 1; y <= base.y1 - 2 && out.length < max; y += 3) {
    for (let x = base.x0 + 1; x <= base.x1 - 3 && out.length < max; x += 4) {
      // Leave the middle free around the command post.
      if (Math.abs(x + 1.5 - cx) < 5 && Math.abs(y + 1 - cy) < 5) continue;
      let ok = true;
      for (let j = 0; j < 2 && ok; j++) for (let i = 0; i < 3 && ok; i++) ok = lot(x + i, y + j);
      if (ok) out.push({ x: (x + 1.5) * cs, y: (y + 1) * cs, yaw: 0 });
    }
  }
  return out;
}

/** A ridge tent: triangular prism with a darker roof line, length along x. */
function tentGeometry(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(2.4, 2.4, 7, 3, 1).toNonIndexed();
  g.rotateZ(Math.PI / 2);
  g.rotateX(Math.PI / 6);
  g.computeBoundingBox();
  g.translate(0, -g.boundingBox!.min.y, 0);
  g.scale(1, 0.75, 1);
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
  const tents = tentSpots(map, 8);
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
