import * as THREE from 'three';
import { Ground, type MapInfo } from '@vazante/shared';
import { buildingMaterial, toon } from './materials.ts';
import { PALETTE } from './palette.ts';

/** Texels per cell in the ground texture (lane markings, curbs, grain). */
const TPC = 8;

/** Ground texture, buildings (one instanced mesh), cosmetic props, and base/depot outlines. */
export function buildCity(map: MapInfo): THREE.Group {
  const group = new THREE.Group();
  const cs = map.cellSize;
  const wM = map.width * cs;
  const hM = map.height * cs;

  const groundMesh = new THREE.Mesh(groundGeometry(wM, hM), toon({ map: groundTexture(map) }));
  groundMesh.position.set(wM / 2, 0, hM / 2);
  groundMesh.receiveShadow = true;
  groundMesh.name = 'ground';
  group.add(groundMesh);

  const box = new THREE.BoxGeometry(1, 1, 1);
  box.translate(0, 0.5, 0);
  const inst = new THREE.InstancedMesh(box, buildingMaterial(), Math.max(1, map.buildings.length));
  const m = new THREE.Matrix4();
  const col = new THREE.Color();
  const tones = PALETTE.buildingTones.map((c) => new THREE.Color(c));
  map.buildings.forEach((b, i) => {
    // Inset a little so alleys and sidewalks read between buildings.
    const w = (b.x1 - b.x0 + 1) * cs - 0.6;
    const d = (b.y1 - b.y0 + 1) * cs - 0.6;
    m.makeScale(w, b.height, d);
    m.setPosition(b.x0 * cs + (w + 0.6) / 2, 0, b.y0 * cs + (d + 0.6) / 2);
    inst.setMatrixAt(i, m);
    col.copy(tones[hash(b.id) % tones.length]).multiplyScalar(0.9 + (hash(b.id * 7) % 20) / 100);
    inst.setColorAt(i, col);
  });
  inst.count = map.buildings.length;
  inst.castShadow = true;
  inst.receiveShadow = true;
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  inst.name = 'buildings';
  group.add(inst);

  const props = buildProps(map);
  group.add(props);
  group.userData.lamps = props.userData.lamps;

  for (const s of map.sites) {
    group.add(rectOutline(s.x0 * cs, s.y0 * cs, (s.x1 + 1) * cs, (s.y1 + 1) * cs, s.kind === 'base' ? PALETTE.base : PALETTE.depot, 0.12));
  }
  return group;
}

export function buildDistrictOverlay(map: MapInfo): THREE.Group {
  const g = new THREE.Group();
  const cs = map.cellSize;
  for (const d of map.districts) g.add(rectOutline(d.x0 * cs + 1, d.y0 * cs + 1, (d.x1 + 1) * cs - 1, (d.y1 + 1) * cs - 1, PALETTE.district, 40));
  return g;
}

function groundGeometry(wM: number, hM: number): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(wM, hM);
  g.rotateX(-Math.PI / 2);
  // After rotation, uv v=1 sits at -z (north). Flip so texture row 0 is the map's row 0.
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  return g;
}

function groundTexture(map: MapInfo): THREE.DataTexture {
  const W = map.width * TPC;
  const H = map.height * TPC;
  const data = new Uint8Array(W * H * 4);
  const base: Record<number, number> = {
    [Ground.Street]: PALETTE.street,
    [Ground.Sidewalk]: PALETTE.sidewalk,
    [Ground.Lot]: PALETTE.lot,
    [Ground.Building]: PALETTE.lot,
    [Ground.Water]: PALETTE.water,
    [Ground.Park]: PALETTE.park,
  };
  const g = (cx: number, cy: number) => (cx < 0 || cy < 0 || cx >= map.width || cy >= map.height ? -1 : map.ground[cy * map.width + cx]);
  for (let ty = 0; ty < H; ty++) {
    const cy = Math.floor(ty / TPC);
    const sy = ty % TPC;
    for (let tx = 0; tx < W; tx++) {
      const cx = Math.floor(tx / TPC);
      const sx = tx % TPC;
      const kind = g(cx, cy);
      let c = base[kind] ?? PALETTE.lot;
      let shade = 1 + ((hash(tx * 7919 + ty * 104729) % 9) - 4) / 100;
      if (kind === Ground.Street) {
        // Dashed centre lines where a street run is 2+ cells wide in one axis.
        const horiz = g(cx, cy - 1) !== Ground.Street || g(cx, cy + 1) !== Ground.Street;
        const vert = g(cx - 1, cy) !== Ground.Street || g(cx + 1, cy) !== Ground.Street;
        const nsStreet = g(cx, cy - 1) === Ground.Street && g(cx, cy + 1) === Ground.Street;
        const ewStreet = g(cx - 1, cy) === Ground.Street && g(cx + 1, cy) === Ground.Street;
        if (nsStreet && !ewStreet && vert && g(cx + 1, cy) === Ground.Street && sx === TPC - 1 && cy % 2 === 0) c = PALETTE.marking;
        if (ewStreet && !nsStreet && horiz && g(cx, cy + 1) === Ground.Street && sy === TPC - 1 && cx % 2 === 0) c = PALETTE.marking;
      } else if (kind === Ground.Sidewalk) {
        if (sx === 0 || sy === 0) shade *= 0.9; // paving slabs
        const curb = (g(cx - 1, cy) === Ground.Street && sx === 0) || (g(cx + 1, cy) === Ground.Street && sx === TPC - 1) || (g(cx, cy - 1) === Ground.Street && sy === 0) || (g(cx, cy + 1) === Ground.Street && sy === TPC - 1);
        if (curb) c = PALETTE.curb;
      } else if (kind === Ground.Park) {
        shade *= 1 + ((hash(cx * 31 + cy * 17 + sx * 3 + sy) % 13) - 6) / 60;
      }
      const o = (ty * W + tx) * 4;
      data[o] = Math.min(255, ((c >> 16) & 255) * shade);
      data[o + 1] = Math.min(255, ((c >> 8) & 255) * shade);
      data[o + 2] = Math.min(255, (c & 255) * shade);
      data[o + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Cosmetic props: trees in parks and lamp posts on sidewalk corners. They do not block movement. */
function buildProps(map: MapInfo): THREE.Group {
  const group = new THREE.Group();
  const cs = map.cellSize;
  const trees: [number, number, number][] = [];
  const lamps: [number, number][] = [];
  for (let cy = 0; cy < map.height; cy++) {
    for (let cx = 0; cx < map.width; cx++) {
      const k = map.ground[cy * map.width + cx];
      const h = hash(cx * 73856093 ^ cy * 19349663);
      if (k === Ground.Park && h % 3 === 0) trees.push([(cx + 0.2 + (h % 60) / 100) * cs, (cy + 0.2 + ((h >> 8) % 60) / 100) * cs, 0.8 + ((h >> 4) % 50) / 100]);
      if (k === Ground.Sidewalk && h % 11 === 0) lamps.push([(cx + 0.5) * cs, (cy + 0.5) * cs]);
    }
  }
  const m = new THREE.Matrix4();
  const trunkGeo = new THREE.CylinderGeometry(0.15, 0.2, 2, 5);
  trunkGeo.translate(0, 1, 0);
  const crownGeo = new THREE.IcosahedronGeometry(1.6, 0);
  crownGeo.translate(0, 3.2, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, toon({ color: PALETTE.trunk }), Math.max(1, trees.length));
  const crowns = new THREE.InstancedMesh(crownGeo, toon({ color: PALETTE.foliage }), Math.max(1, trees.length));
  trees.forEach(([x, y, s], i) => {
    m.makeScale(s, s, s).setPosition(x, 0, y);
    trunks.setMatrixAt(i, m);
    crowns.setMatrixAt(i, m);
  });
  trunks.count = crowns.count = trees.length;
  for (const mesh of [trunks, crowns]) {
    mesh.castShadow = true;
    group.add(mesh);
  }
  const poleGeo = new THREE.BoxGeometry(0.12, 5, 0.12);
  poleGeo.translate(0, 2.5, 0);
  const headGeo = new THREE.BoxGeometry(0.5, 0.15, 0.25);
  headGeo.translate(0, 5, 0);
  const poles = new THREE.InstancedMesh(poleGeo, toon({ color: PALETTE.pole }), Math.max(1, lamps.length));
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshBasicMaterial({ color: PALETTE.lampHead }), Math.max(1, lamps.length));
  lamps.forEach(([x, y], i) => {
    m.makeTranslation(x, 0, y);
    poles.setMatrixAt(i, m);
    heads.setMatrixAt(i, m);
  });
  poles.count = heads.count = lamps.length;
  poles.castShadow = true;
  group.add(poles, heads);
  group.userData.lamps = lamps;
  return group;
}

function rectOutline(x0: number, y0: number, x1: number, y1: number, color: number, y: number): THREE.LineLoop {
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(x0, y, y0),
    new THREE.Vector3(x1, y, y0),
    new THREE.Vector3(x1, y, y1),
    new THREE.Vector3(x0, y, y1),
  ]);
  return new THREE.LineLoop(geo, new THREE.LineBasicMaterial({ color }));
}

/** Small integer hash for stable cosmetic variation. */
export function hash(n: number): number {
  let x = n | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return (x ^ (x >>> 16)) >>> 0;
}
