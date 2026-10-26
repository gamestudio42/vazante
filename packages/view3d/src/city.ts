import * as THREE from 'three';
import { Ground, type MapInfo } from '@vazante/shared';
import { PALETTE } from './palette.ts';

/** Ground texture (one texel per cell), buildings as one instanced mesh, site and district outlines. */
export function buildCity(map: MapInfo): THREE.Group {
  const group = new THREE.Group();
  const cs = map.cellSize;
  const wM = map.width * cs;
  const hM = map.height * cs;

  const data = new Uint8Array(map.width * map.height * 4);
  const colorOf: Record<number, number> = {
    [Ground.Street]: PALETTE.street,
    [Ground.Sidewalk]: PALETTE.sidewalk,
    [Ground.Lot]: PALETTE.lot,
    [Ground.Building]: PALETTE.roof,
    [Ground.Water]: PALETTE.water,
    [Ground.Park]: PALETTE.park,
  };
  for (let i = 0; i < map.width * map.height; i++) {
    const c = colorOf[map.ground[i]] ?? PALETTE.lot;
    data[i * 4] = (c >> 16) & 255;
    data[i * 4 + 1] = (c >> 8) & 255;
    data[i * 4 + 2] = c & 255;
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, map.width, map.height, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  tex.needsUpdate = true;
  const groundGeo = new THREE.PlaneGeometry(wM, hM);
  groundGeo.rotateX(-Math.PI / 2);
  // PlaneGeometry UV v=1 is at -z after rotation; flip so row 0 is at z = 0.
  const uv = groundGeo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  const groundMesh = new THREE.Mesh(groundGeo, new THREE.MeshLambertMaterial({ map: tex }));
  groundMesh.position.set(wM / 2, 0, hM / 2);
  groundMesh.name = 'ground';
  group.add(groundMesh);

  const box = new THREE.BoxGeometry(1, 1, 1);
  box.translate(0, 0.5, 0);
  const mat = new THREE.MeshLambertMaterial({ flatShading: true });
  const inst = new THREE.InstancedMesh(box, mat, Math.max(1, map.buildings.length));
  const m = new THREE.Matrix4();
  const col = new THREE.Color();
  const lo = new THREE.Color(PALETTE.buildingLow);
  const hi = new THREE.Color(PALETTE.buildingHigh);
  map.buildings.forEach((b, i) => {
    const w = (b.x1 - b.x0 + 1) * cs;
    const d = (b.y1 - b.y0 + 1) * cs;
    m.makeScale(w, b.height, d);
    m.setPosition(b.x0 * cs + w / 2, 0, b.y0 * cs + d / 2);
    inst.setMatrixAt(i, m);
    col.copy(lo).lerp(hi, Math.min(1, b.height / 30));
    inst.setColorAt(i, col);
  });
  inst.count = map.buildings.length;
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  inst.name = 'buildings';
  group.add(inst);

  for (const s of map.sites) {
    group.add(rectOutline(s.x0 * cs, s.y0 * cs, (s.x1 + 1) * cs, (s.y1 + 1) * cs, s.kind === 'base' ? PALETTE.base : PALETTE.depot, 0.15));
  }
  return group;
}

export function buildDistrictOverlay(map: MapInfo): THREE.Group {
  const g = new THREE.Group();
  const cs = map.cellSize;
  for (const d of map.districts) g.add(rectOutline(d.x0 * cs + 1, d.y0 * cs + 1, (d.x1 + 1) * cs - 1, (d.y1 + 1) * cs - 1, PALETTE.district, 40));
  return g;
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
