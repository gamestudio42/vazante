import * as THREE from 'three';
import { Ground, PRESENTATION, type MapInfo } from '@vazante/shared';
import { buildingMaterial, groundMaterial, toon } from './materials.ts';
import { buildArchitecture, planCityBuildings, referenceBuildings } from './architecture.ts';
import { hash } from './cosmetic.ts';
export { hash } from './cosmetic.ts';
import { PALETTE } from './palette.ts';
import { planCrossings, vegetationStyle } from './streets.ts';

/** Texels per cell in the ground texture (lane markings, curbs, grain). */
const TPC = 8;

/** Ground texture, buildings (one instanced mesh), cosmetic props, and base/depot outlines. */
export function buildCity(map: MapInfo): THREE.Group {
  const group = new THREE.Group();
  const cs = map.cellSize;
  const wM = map.width * cs;
  const hM = map.height * cs;

  // Planned once: the ground paints the zebra stripes and the props put signs beside them.
  const crossings = planCrossings(map);
  const groundMesh = new THREE.Mesh(groundGeometry(wM, hM), groundMaterial(map, groundTexture(map, crossings)));
  groundMesh.position.set(wM / 2, 0, hM / 2);
  groundMesh.receiveShadow = true;
  groundMesh.name = 'ground';
  group.add(groundMesh);

  group.add(buildArchitecture(map));

  const props = buildProps(map, crossings);
  group.add(props);
  group.userData.lamps = props.userData.lamps;

  group.add(buildRooftops(map));
  group.add(buildOutskirts(map));
  splitIntoChunks(group, CHUNK_M);
  return group;
}

/** Side of a culling chunk (metres): 32 cells. */
const CHUNK_M = 128;

/**
 * Split every large instanced mesh into square chunks with their own bounds, so the camera and the
 * shadow camera skip what they cannot see. On the 2 km city this cuts the drawn buildings, roofs and
 * trees to the few chunks around the view instead of all of them; the slice map has 16 chunks.
 */
function splitIntoChunks(root: THREE.Object3D, size: number): void {
  const meshes: THREE.InstancedMesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.InstancedMesh).isInstancedMesh && (o as THREE.InstancedMesh).count > 64) meshes.push(o as THREE.InstancedMesh);
  });
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  for (const mesh of meshes) {
    const buckets = new Map<string, number[]>();
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, m);
      const key = `${Math.floor(m.elements[12] / size)},${Math.floor(m.elements[14] / size)}`;
      let list = buckets.get(key);
      if (!list) buckets.set(key, (list = []));
      list.push(i);
    }
    if (buckets.size < 2) continue;
    const parent = mesh.parent!;
    for (const list of buckets.values()) {
      // Per-building styles must follow the reordered instances, not the original global index.
      const facade = mesh.geometry.getAttribute('aFacade');
      const geometry = facade ? mesh.geometry.clone() : mesh.geometry;
      if (facade) {
        const data = new Float32Array(list.length * 4);
        list.forEach((src, i) => data.set([facade.getX(src), facade.getY(src), facade.getZ(src), facade.getW(src)], i * 4));
        geometry.setAttribute('aFacade', new THREE.InstancedBufferAttribute(data, 4));
      }
      const chunk = new THREE.InstancedMesh(geometry, mesh.material, list.length);
      list.forEach((src, i) => {
        mesh.getMatrixAt(src, m);
        chunk.setMatrixAt(i, m);
        if (mesh.instanceColor) {
          mesh.getColorAt(src, c);
          chunk.setColorAt(i, c);
        }
      });
      chunk.castShadow = mesh.castShadow;
      chunk.receiveShadow = mesh.receiveShadow;
      chunk.name = mesh.name;
      chunk.computeBoundingSphere();
      parent.add(chunk);
    }
    parent.remove(mesh);
    mesh.dispose();
  }
}

/** Map-scale overlay (district bounds, base and depot frames), shown only above the tactical view. */
export function buildDistrictOverlay(map: MapInfo): THREE.Group {
  const g = new THREE.Group();
  const cs = map.cellSize;
  for (const d of map.districts) g.add(rectOutline(d.x0 * cs + 1, d.y0 * cs + 1, (d.x1 + 1) * cs - 1, (d.y1 + 1) * cs - 1, PALETTE.district, 40));
  for (const s of map.sites) g.add(rectOutline(s.x0 * cs, s.y0 * cs, (s.x1 + 1) * cs, (s.y1 + 1) * cs, s.kind === 'base' ? PALETTE.base : PALETTE.depot, 40));
  return g;
}

/**
 * Roof clutter seen from above: air-conditioning units, stair and lift housings, water tanks.
 * Placed by hash inside each roof so the skyline stops reading as plain boxes.
 */
export function buildRooftops(map: MapInfo): THREE.Group {
  const group = new THREE.Group();
  const ac: THREE.Matrix4[] = [];
  const stairs: THREE.Matrix4[] = [];
  const tanks: THREE.Matrix4[] = [];
  const appearances = planCityBuildings(map);
  for (const b of map.buildings) {
    const appearance = appearances.get(b.id)!;
    // Pitched roofs carry no flat-deck equipment. Setback crowns own a smaller support area.
    if (appearance.roofShape === 'gable') continue;
    const deck = appearance.roof ?? appearance.body;
    const w = deck.width;
    const d = deck.depth;
    const cx = deck.x - w / 2;
    const cy = deck.z - d / 2;
    const h = hash(b.id * 92821 + 7);
    const at = (k: number, sx: number, sy: number, sz: number, margin: number) => {
      const r = hash(h + k * 7919);
      // Hashes are unsigned: a signed shift makes half the Z offsets negative.
      // Centre narrow roofs instead of placing their fixtures beyond the edge.
      const mx = Math.min(margin, w / 2);
      const my = Math.min(margin, d / 2);
      const px = cx + mx + ((r % 1000) / 1000) * Math.max(0, w - 2 * mx);
      const py = cy + my + (((r >>> 10) % 1000) / 1000) * Math.max(0, d - 2 * my);
      return new THREE.Matrix4().makeScale(sx, sz, sy).setPosition(px, b.height, py);
    };
    const nAc = Math.min(w, d) >= 1.3 ? h % 4 : 0;
    for (let k = 0; k < nAc; k++) ac.push(at(k, 1.3, 1.0, 0.9, 1.2));
    if (w > 7 && d > 7 && h % 3 !== 0) stairs.push(at(10, 3.2, 2.6, 2.4, 2.4));
    if (b.height > 14 && Math.min(w, d) >= 2.2 && h % 5 < 2) tanks.push(at(20, 1.0, 1.0, 1.0, 2));
  }
  const box = new THREE.BoxGeometry(1, 1, 1);
  box.translate(0, 0.5, 0);
  const tank = new THREE.CylinderGeometry(1.1, 1.1, 1.8, 8);
  tank.translate(0, 2.1, 0);
  const legs = new THREE.BoxGeometry(1.6, 1.2, 1.6);
  legs.translate(0, 0.6, 0);
  const add = (geo: THREE.BufferGeometry, color: number, list: THREE.Matrix4[]) => {
    if (list.length === 0) return;
    const mesh = new THREE.InstancedMesh(geo, toon({ color }), list.length);
    list.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  add(box, 0x8e9192, ac);
  add(box, 0x7d776c, stairs);
  add(tank, 0x6a5a4a, tanks);
  add(legs, 0x3a3836, tanks);
  return group;
}

/**
 * Beyond the playable map the city carries on into the dark: a ground apron fading to black and
 * low ruined blocks, so the camera never shows the edge of the world as a void.
 */
function buildOutskirts(map: MapInfo): THREE.Group {
  const group = new THREE.Group();
  const cs = map.cellSize;
  const wM = map.width * cs;
  const hM = map.height * cs;
  const pad = 420;
  const seg = 48;
  const geo = new THREE.PlaneGeometry(wM + pad * 2, hM + pad * 2, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const near = new THREE.Color(PALETTE.street).multiplyScalar(0.8);
  const far = new THREE.Color(0x0c0e11);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + wM / 2;
    const z = pos.getZ(i) + hM / 2;
    const dx = Math.max(0, -x, x - wM);
    const dz = Math.max(0, -z, z - hM);
    const t = Math.min(1, Math.hypot(dx, dz) / 320);
    c.copy(near).lerp(far, t * t * (3 - 2 * t));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const apron = new THREE.Mesh(geo, toon({ vertexColors: true }));
  apron.position.set(wM / 2, -0.04, hM / 2);
  apron.receiveShadow = true;
  group.add(apron);

  // The street grid carries on: 48 m blocks split into one to four buildings, some collapsed to
  // rubble, lower and darker the further they stand from the playable city.
  const ruins: [THREE.Matrix4, THREE.Color][] = [];
  const step = 48;
  const street = 12;
  const tones = PALETTE.buildingTones.map((t) => new THREE.Color(t));
  for (let gy = -Math.ceil(pad / step) * step; gy < hM + pad; gy += step) {
    for (let gx = -Math.ceil(pad / step) * step; gx < wM + pad; gx += step) {
      if (gx + step > 0 && gx < wM && gy + step > 0 && gy < hM) continue;
      const dx = Math.max(0, -(gx + step), gx - wM);
      const dz = Math.max(0, -(gy + step), gy - hM);
      const fade = Math.min(1, Math.hypot(dx, dz) / 340);
      const h0 = hash((gx + 4096) * 7349 + (gy + 4096) * 3001);
      const split = 1 + (h0 % 4);
      const inner = step - street;
      for (let k = 0; k < split; k++) {
        const h = hash(h0 + k * 977);
        const vertical = split > 1 && h0 % 2 === 0;
        const part = inner / split;
        const w = vertical ? part - 1.5 : inner;
        const d = vertical ? inner : part - 1.5;
        const ox = gx + street / 2 + (vertical ? k * part : 0);
        const oy = gy + street / 2 + (vertical ? 0 : k * part);
        const collapsed = h % 4 === 0;
        const height = collapsed ? 1.5 + (h % 3) : (5 + ((h >>> 6) % 24)) * (1 - 0.7 * fade);
        const m = new THREE.Matrix4().makeScale(w, height, d).setPosition(ox + w / 2, 0, oy + d / 2);
        const col = tones[(h >>> 3) % tones.length].clone().lerp(new THREE.Color(0x55555a), 0.45);
        ruins.push([m, col.multiplyScalar((collapsed ? 0.55 : 0.75) * (1 - 0.85 * fade))]);
      }
    }
  }
  const box = new THREE.BoxGeometry(1, 1, 1);
  box.translate(0, 0.5, 0);
  // Outskirts retain their subdued residential treatment and have no interactive buildings.
  box.setAttribute('aFacade', new THREE.InstancedBufferAttribute(Float32Array.from({ length: ruins.length * 4 }, (_, i) => i % 4 === 0 ? -1 : 0), 4));
  const inst = new THREE.InstancedMesh(box, buildingMaterial(), ruins.length);
  ruins.forEach(([m, col], i) => {
    inst.setMatrixAt(i, m);
    inst.setColorAt(i, col);
  });
  inst.castShadow = true;
  inst.receiveShadow = true;
  group.add(inst);
  return group;
}

function groundGeometry(wM: number, hM: number): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(wM, hM);
  g.rotateX(-Math.PI / 2);
  // After rotation, uv v=1 sits at -z (north). Flip so texture row 0 is the map's row 0.
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  return g;
}

function groundTexture(map: MapInfo, crossings: Uint8Array): THREE.DataTexture {
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
  const reference = referenceBuildings(map);
  const paving = new Set<number>();
  for (const b of map.buildings) if (reference.has(b.id)) {
    for (let y = Math.max(0, b.y0 - 1); y <= Math.min(map.height - 1, b.y1 + 1); y++) {
      for (let x = Math.max(0, b.x0 - 1); x <= Math.min(map.width - 1, b.x1 + 1); x++) {
        if (g(x, y) === Ground.Sidewalk) paving.add(y * map.width + x);
      }
    }
  }
  const inSite = (cx: number, cy: number) => map.sites.some((st) => cx >= st.x0 && cx <= st.x1 && cy >= st.y0 && cy <= st.y1);
  for (let ty = 0; ty < H; ty++) {
    const cy = Math.floor(ty / TPC);
    const sy = ty % TPC;
    for (let tx = 0; tx < W; tx++) {
      const cx = Math.floor(tx / TPC);
      const sx = tx % TPC;
      const kind = g(cx, cy);
      let c = base[kind] ?? PALETTE.lot;
      let shade = 1 + ((hash(tx * 7919 + ty * 104729) % 9) - 4) / 100;
      const n1 = valueNoise(tx / 14, ty / 14, 1);
      const n2 = valueNoise(tx / 5, ty / 5, 2);
      let mix: number | null = null;
      let mixT = 0;
      if (kind === Ground.Street) {
        // Dashed centre lines where a street run is 2+ cells wide in one axis.
        const horiz = g(cx, cy - 1) !== Ground.Street || g(cx, cy + 1) !== Ground.Street;
        const vert = g(cx - 1, cy) !== Ground.Street || g(cx + 1, cy) !== Ground.Street;
        const nsStreet = g(cx, cy - 1) === Ground.Street && g(cx, cy + 1) === Ground.Street;
        const ewStreet = g(cx - 1, cy) === Ground.Street && g(cx + 1, cy) === Ground.Street;
        if (nsStreet && !ewStreet && vert && g(cx + 1, cy) === Ground.Street && sx === TPC - 1 && cy % 2 === 0) c = PALETTE.marking;
        if (ewStreet && !nsStreet && horiz && g(cx, cy + 1) === Ground.Street && sy === TPC - 1 && cx % 2 === 0) c = PALETTE.marking;
        if (c === PALETTE.marking) {
          // Worn paint: gaps where the asphalt shows through.
          if (n2 > 0.72) c = PALETTE.street;
        } else {
          // Patched asphalt, oil stains and cracks.
          shade *= 0.92 + 0.12 * n1;
          if (n2 < 0.12) shade *= 0.9;
          const crack = hash(Math.floor(tx / 6) * 31 + Math.floor(ty / 6) * 977) % 17 === 0 && Math.abs(((tx % 6) - (ty % 6))) < 1;
          if (crack) shade *= 0.82;
          const h = hash(cx * 5333 + cy * 9001);
          if (h % 37 === 0 && Math.hypot(sx - 3.5, sy - 3.5) < 1.6) shade *= 0.6; // manhole
        }
      } else if (kind === Ground.Sidewalk) {
        if (sx === 0 || sy === 0) shade *= 0.9; // paving slabs
        const curb = (g(cx - 1, cy) === Ground.Street && sx === 0) || (g(cx + 1, cy) === Ground.Street && sx === TPC - 1) || (g(cx, cy - 1) === Ground.Street && sy === 0) || (g(cx, cy + 1) === Ground.Street && sy === TPC - 1);
        if (paving.has(cy * map.width + cx)) {
          const tune = PRESENTATION.architecture;
          const slab = tune.pavingSlabTexels;
          const row = Math.floor(ty / slab);
          const staggeredX = tx + (row % 2) * slab / 2;
          const joint = staggeredX % slab === 0 || ty % slab === 0;
          shade *= joint ? tune.pavingJointShade : 1 + ((hash(Math.floor(staggeredX / slab) * 31 + row * 977) % 3) - 1) * tune.pavingVariation;
        }
        if (curb) c = PALETTE.curb;
      } else if (kind === Ground.Park) {
        // Uneven grass: lighter dry patches, darker clumps, tufts.
        shade *= 0.88 + 0.22 * n1 + ((hash(tx * 31 + ty * 17) % 13) - 6) / 50;
        if (n2 > 0.75) {
          mix = 0x6b6a3e;
          mixT = 0.5;
        }
      } else if ((kind === Ground.Lot || kind === Ground.Building) && !inSite(cx, cy)) {
        // Empty lots: dirt, weeds and broken concrete.
        mix = n1 > 0.55 ? 0x56513f : 0x4f5a39;
        mixT = 0.35 + 0.4 * Math.abs(n1 - 0.55);
        shade *= 0.9 + 0.2 * n2;
        if (hash(tx * 4241 + ty * 7577) % 23 === 0) shade *= 1.25; // rubble
      } else if (kind === Ground.Lot && inSite(cx, cy)) {
        // Bases and depots sit on a gravel pad with concrete slab joints and worn vehicle tracks.
        c = PALETTE.basePad;
        if ((sx === 0 && cx % 2 === 0) || (sy === 0 && cy % 2 === 0)) shade *= 0.86;
        if ((cx + cy) % 7 === 0 && (sx === 2 || sx === 5)) shade *= 0.9;
        shade *= 1 + ((hash(tx * 131 + ty * 977) % 7) - 3) / 40;
        // Hazard paint along the perimeter of the pad.
        const st = map.sites.find((q) => cx >= q.x0 && cx <= q.x1 && cy >= q.y0 && cy <= q.y1)!;
        const edge = (cx === st.x0 && sx < 2) || (cx === st.x1 && sx >= TPC - 2) || (cy === st.y0 && sy < 2) || (cy === st.y1 && sy >= TPC - 2);
        if (edge) {
          c = (Math.floor((tx + ty) / 3) % 2 === 0) ? 0xc9a23a : 0x2a2a28;
          shade = n2 > 0.8 ? 0.8 : 1;
        }
      }
      const crossing = crossings[cy * map.width + cx];
      const paint = PRESENTATION.street;
      if (((crossing & 1) && Math.abs(sy - TPC / 2) < paint.crossingHalfWidthTexels && Math.floor(tx / paint.stripeTexels) % 2 === 0)
        || ((crossing & 2) && Math.abs(sx - TPC / 2) < paint.crossingHalfWidthTexels && Math.floor(ty / paint.stripeTexels) % 2 === 0)) {
        c = PALETTE.marking;
        shade *= 0.9 + 0.1 * n1;
      }
      // Contact shadow at the foot of buildings (cheap ambient occlusion).
      if (kind !== Ground.Building) {
        const ao = Math.min(
          g(cx - 1, cy) === Ground.Building ? sx : 9,
          g(cx + 1, cy) === Ground.Building ? TPC - 1 - sx : 9,
          g(cx, cy - 1) === Ground.Building ? sy : 9,
          g(cx, cy + 1) === Ground.Building ? TPC - 1 - sy : 9,
        );
        if (ao < 3) shade *= 0.66 + ao * 0.11;
      }
      let r = (c >> 16) & 255;
      let gg = (c >> 8) & 255;
      let bb = c & 255;
      if (mix !== null) {
        r += (((mix >> 16) & 255) - r) * mixT;
        gg += (((mix >> 8) & 255) - gg) * mixT;
        bb += ((mix & 255) - bb) * mixT;
      }
      const o = (ty * W + tx) * 4;
      data[o] = Math.min(255, r * shade);
      data[o + 1] = Math.min(255, gg * shade);
      data[o + 2] = Math.min(255, bb * shade);
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
function buildProps(map: MapInfo, crossings: Uint8Array): THREE.Group {
  const group = new THREE.Group();
  const cs = map.cellSize;
  const trees: [number, number, number, number][] = [];
  const signs: [number, number, boolean][] = [];
  const lamps: [number, number][] = [];
  for (let cy = 0; cy < map.height; cy++) {
    for (let cx = 0; cx < map.width; cx++) {
      const k = map.ground[cy * map.width + cx];
      const h = hash(cx * 73856093 ^ cy * 19349663);
      const style = vegetationStyle(map, cx, cy);
      if (k === Ground.Park && h % PRESENTATION.street.treeDensityModulo[style] === 0) trees.push([(cx + 0.2 + (h % 60) / 100) * cs, (cy + 0.2 + ((h >>> 8) % 60) / 100) * cs, (0.8 + ((h >>> 4) % 50) / 100) * PRESENTATION.street.treeScale[style], style]);
      let sign = false;
      if (k === Ground.Sidewalk && h % 3 === 0) {
        // Bit tests, not equality: where two crossings meet a street cell carries both bits (3).
        const horizontal = (cx > 0 && (crossings[cy * map.width + cx - 1] & 1) !== 0) || (cx + 1 < map.width && (crossings[cy * map.width + cx + 1] & 1) !== 0);
        const vertical = (cy > 0 && (crossings[(cy - 1) * map.width + cx] & 2) !== 0) || (cy + 1 < map.height && (crossings[(cy + 1) * map.width + cx] & 2) !== 0);
        sign = horizontal || vertical;
        if (sign) signs.push([(cx + 0.5) * cs, (cy + 0.5) * cs, vertical]);
      }
      // A sign and a lamp never share a sidewalk cell.
      if (k === Ground.Sidewalk && !sign && h % 19 === 0) lamps.push([(cx + 0.5) * cs, (cy + 0.5) * cs]);
    }
  }
  const m = new THREE.Matrix4();
  const trunkGeo = new THREE.CylinderGeometry(0.15, 0.2, 2, 5);
  trunkGeo.translate(0, 1, 0);
  const crownGeo = new THREE.IcosahedronGeometry(1.6, 0);
  crownGeo.translate(0, 3.2, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, toon({ color: PALETTE.trunk }), Math.max(1, trees.length));
  const crowns = new THREE.InstancedMesh(crownGeo, toon({ color: 0xffffff }), Math.max(1, trees.length));
  trees.forEach(([x, y, s, style], i) => {
    m.makeScale(s, s, s).setPosition(x, 0, y);
    trunks.setMatrixAt(i, m);
    crowns.setMatrixAt(i, m);
    crowns.setColorAt(i, new THREE.Color(PRESENTATION.street.foliage[style]));
  });
  trunks.count = crowns.count = trees.length;
  for (const mesh of [trunks, crowns]) {
    mesh.castShadow = true;
    group.add(mesh);
  }
  const signTuning = PRESENTATION.street;
  const signPole = new THREE.BoxGeometry(0.1, signTuning.signHeight, 0.1);
  signPole.translate(0, signTuning.signHeight / 2, 0);
  const signBoard = new THREE.BoxGeometry(signTuning.signSize, signTuning.signSize, 0.1);
  signBoard.translate(0, signTuning.signHeight, 0);
  const signStripe = new THREE.BoxGeometry(signTuning.signSize * 0.65, signTuning.signSize * 0.15, 0.12);
  signStripe.translate(0, signTuning.signHeight, 0);
  for (const [geometry, color] of [[signPole, PALETTE.pole], [signBoard, PALETTE.base], [signStripe, PALETTE.marking]] as const) {
    const mesh = new THREE.InstancedMesh(geometry, toon({ color }), Math.max(1, signs.length));
    signs.forEach(([x, y, vertical], i) => {
      m.makeRotationY(vertical ? Math.PI / 2 : 0).setPosition(x, 0, y);
      mesh.setMatrixAt(i, m);
    });
    mesh.name = 'crossing-signs';
    mesh.count = signs.length;
    mesh.castShadow = true;
    group.add(mesh);
  }
  const poleGeo = new THREE.BoxGeometry(0.2, 5, 0.2);
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

/** Smooth 0..1 value noise on a unit lattice, for large-scale ground variation. */
function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const v = (i: number, j: number) => (hash((x0 + i) * 73856093 ^ (y0 + j) * 19349663 ^ seed * 83492791) % 1024) / 1023;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = v(0, 0) + (v(1, 0) - v(0, 0)) * sx;
  const b = v(0, 1) + (v(1, 1) - v(0, 1)) * sx;
  return a + (b - a) * sy;
}
