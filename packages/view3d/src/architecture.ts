import * as THREE from 'three';
import { Ground, PRESENTATION, type BuildingRect, type MapInfo } from '@vazante/shared';
import { hash } from './cosmetic.ts';
import { buildingMaterial, toon } from './materials.ts';
import { PALETTE } from './palette.ts';

export type ArchitectureMesh = THREE.InstancedMesh;

export const BUILDING_FAMILIES = ['residential', 'commercial', 'industrial', 'civic'] as const;
export type BuildingFamily = typeof BUILDING_FAMILIES[number];

export interface FacadePart {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  color: number;
}

export type Landmark = 'hospital' | 'station' | 'port';

export interface BuildingAppearance {
  family: BuildingFamily;
  familyIndex: number;
  variation: number;
  wear: number;
  body: FacadePart;
  details: FacadePart[];
  roof: FacadePart | null;
  roofShape: 'flat' | 'gable' | 'setback';
}

/** A bounded reference cluster next to the starting base; the rest of the city keeps its style. */
export function referenceBuildings(map: MapInfo): Set<number> {
  const base = map.sites.find(s => s.kind === 'base');
  if (!base || map.buildings.length === 0) return new Set();
  const x = (base.x0 + base.x1 + 1) * map.cellSize / 2;
  const z = (base.y0 + base.y1 + 1) * map.cellSize / 2;
  const center = (b: BuildingRect) => ({ x: (b.x0 + b.x1 + 1) * map.cellSize / 2, z: (b.y0 + b.y1 + 1) * map.cellSize / 2 });
  let nearest = map.buildings[0];
  let distance = Infinity;
  for (const b of map.buildings) {
    const c = center(b);
    const d = (c.x - x) ** 2 + (c.z - z) ** 2;
    if (d < distance) { nearest = b; distance = d; }
  }
  const anchor = center(nearest);
  return new Set(map.buildings.filter(b => {
    const c = center(b);
    return Math.abs(c.x - anchor.x) <= PRESENTATION.architecture.referenceRadiusM && Math.abs(c.z - anchor.z) <= PRESENTATION.architecture.referenceRadiusM;
  }).map(b => b.id));
}

/** All details stay inside the engine's occupied rectangle and below its sight-blocking height. */
export function planBuilding(b: BuildingRect, cellSize: number, seed: number, reference = false, landmark?: Landmark): BuildingAppearance {
  const tuning = PRESENTATION.architecture;
  const district = hash(Math.floor(b.x0 / tuning.neighborhoodCells) * 73856093 ^ Math.floor(b.y0 / tuning.neighborhoodCells) * 19349663 ^ seed);
  const variation = hash(b.id * 92821 ^ district);
  const width = (b.x1 - b.x0 + 1) * cellSize - tuning.inset * 2;
  const depth = (b.y1 - b.y0 + 1) * cellSize - tuning.inset * 2;
  const familyIndex = landmark === 'hospital' ? 3 : landmark === 'station' || landmark === 'port' ? 2 : b.height <= tuning.industrialMaxHeight && Math.min(width, depth) >= tuning.industrialMinWidth && variation % 3 === 0
    ? 2 : variation % 7 === 0 ? 3 : variation % 3 === 1 ? 1 : 0;
  const family = BUILDING_FAMILIES[familyIndex];
  const colors = PALETTE.architecture[family];
  const x = (b.x0 + b.x1 + 1) * cellSize / 2;
  const z = (b.y0 + b.y1 + 1) * cellSize / 2;
  const body: FacadePart = { x, y: 0, z, width, height: b.height, depth, color: colors.walls[variation % colors.walls.length] };
  const roofShape = landmark === 'station' || landmark === 'port' ? 'gable' : !reference ? 'flat' : (family === 'industrial' || family === 'residential') && b.height <= tuning.pitchedMaxHeight ? 'gable' : 'setback';
  const rise = Math.min(tuning.roofRise, b.height * tuning.roofMaxFraction);
  const setback = Math.min(tuning.roofSetback, Math.min(width, depth) * tuning.roofMaxFraction);
  const roof: FacadePart | null = roofShape === 'flat' ? null : {
    x, z, y: b.height - rise, height: rise,
    width: width - (roofShape === 'setback' ? setback * 2 : 0),
    depth: depth - (roofShape === 'setback' ? setback * 2 : 0),
    color: roofShape === 'gable' ? colors.accent : colors.trim,
  };
  if (roof) body.height -= rise;
  const wallHeight = body.height;
  const details: FacadePart[] = [];
  const add = (px: number, py: number, pz: number, w: number, h: number, d: number, color: number) => {
    details.push({ x: px, y: py, z: pz, width: w, height: h, depth: d, color });
  };
  const lip = tuning.trimProjection;
  const band = tuning.corniceHeight;
  const edge = tuning.corniceWidth;
  // A shallow roof rim changes the profile without introducing fake walkable terraces.
  for (const side of [-1, 1]) {
    add(x, wallHeight - band, z + side * (depth / 2 - edge / 2 + lip), width + 2 * lip, band, edge, colors.trim);
    add(x + side * (width / 2 - edge / 2 + lip), wallHeight - band, z, edge, band, depth, colors.trim);
  }
  const faceDepth = tuning.inset + lip;
  if (family === 'residential') {
    // Shallow sill/balcony bands give the plaster blocks a domestic scale.
    const rows = Math.min(tuning.balconyRows, Math.floor((wallHeight - band) / tuning.floorHeight));
    for (let row = 1; row <= rows; row++) for (const side of [-1, 1]) {
      const y = row * tuning.floorHeight;
      add(x, y, z + side * depth / 2, width * 0.82, band, faceDepth, colors.trim);
    }
  } else if (family === 'commercial' || family === 'civic') {
    const columns = family === 'civic' ? tuning.civicColumns : 2;
    for (let i = 0; i < columns; i++) for (const side of [-1, 1]) {
      const px = x + (i / (columns - 1) - 0.5) * (width - edge * 2);
      add(px, 0, z + side * depth / 2, edge, wallHeight - band, faceDepth, colors.trim);
    }
    for (const side of [-1, 1]) {
      add(x, Math.min(tuning.shopHeight, wallHeight - band), z + side * depth / 2, width, band, faceDepth, colors.accent);
    }
  } else {
    for (const side of [-1, 1]) {
      add(x, Math.min(tuning.shopHeight, wallHeight - band), z + side * depth / 2, width * 0.75, band, faceDepth, colors.accent);
    }
  }
  if (reference) {
    for (const side of [-1, 1]) {
      add(x, 0, z + side * depth / 2, width, tuning.podiumHeight, faceDepth, colors.trim);
      add(x, Math.min(tuning.shopHeight - band * 2, wallHeight - band), z + side * depth / 2,
        width * tuning.canopyWidthFraction, band, tuning.canopyDepth, colors.accent);
    }
  }
  if (landmark) {
    const accent = landmark === 'hospital' ? PALETTE.base : landmark === 'station' ? PALETTE.depot : PALETTE.architecture.industrial.accent;
    for (const side of [-1, 1]) add(x, Math.max(0, wallHeight - band * 3), z + side * depth / 2, width, band * 2, faceDepth, accent);
  }
  return { roof, roofShape, family, familyIndex, variation: variation % 251, wear: tuning.wearMin + ((variation >>> 8) % 100) / 100 * tuning.wearRange, body, details };
}


/** City-wide silhouettes; strategic sites get a distinct existing building, never a new obstacle. */
export function planCityBuildings(map: MapInfo): Map<number, BuildingAppearance> {
  const landmarks = new Map<number, Landmark>();
  for (const site of map.sites) {
    let role: Landmark | undefined = site.role === 'hospital' || site.role === 'station' ? site.role : undefined;
    if (!role && site.kind === 'base') {
      const reach = PRESENTATION.architecture.waterfrontCells;
      for (let y = Math.max(0, site.y0 - reach); y <= Math.min(map.height - 1, site.y1 + reach); y++) {
        for (let x = Math.max(0, site.x0 - reach); x <= Math.min(map.width - 1, site.x1 + reach); x++) {
          if (map.ground[y * map.width + x] === Ground.Water) role = 'port';
        }
      }
    }
    if (!role) continue;
    let nearest: BuildingRect | undefined;
    let distance = Infinity;
    for (const b of map.buildings) {
      if (landmarks.has(b.id)) continue;
      const d = ((b.x0 + b.x1 - site.x0 - site.x1) ** 2 + (b.y0 + b.y1 - site.y0 - site.y1) ** 2);
      if (d < distance) { distance = d; nearest = b; }
    }
    if (nearest) landmarks.set(nearest.id, role);
  }
  return new Map(map.buildings.map(b => [b.id, planBuilding(b, map.cellSize, map.seed, true, landmarks.get(b.id))]));
}

/** One body batch and one detail batch, subsequently culled in the city's existing chunks. */
export function buildArchitecture(map: MapInfo): THREE.Group {
  const group = new THREE.Group();
  const appearances = [...planCityBuildings(map).values()];
  const box = new THREE.BoxGeometry(1, 1, 1);
  box.translate(0, 0.5, 0);
  const attributes = new Float32Array(Math.max(1, appearances.length) * 4);
  box.setAttribute('aFacade', new THREE.InstancedBufferAttribute(attributes, 4));
  const bodies = new THREE.InstancedMesh(box, buildingMaterial(), Math.max(1, appearances.length));
  bodies.name = 'buildings';
  const parts = appearances.flatMap(a => a.details);
  const detailBox = new THREE.BoxGeometry(1, 1, 1);
  detailBox.translate(0, 0.5, 0);
  const details = new THREE.InstancedMesh(detailBox, toon(), Math.max(1, parts.length));
  details.name = 'facade-details';
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  const put = (mesh: THREE.InstancedMesh, p: FacadePart, i: number) => {
    mesh.setMatrixAt(i, matrix.makeScale(p.width, p.height, p.depth).setPosition(p.x, p.y, p.z));
    mesh.setColorAt(i, color.setHex(p.color));
  };
  appearances.forEach((a, i) => {
    put(bodies, a.body, i);
    attributes.set([a.familyIndex, a.variation, a.wear, a.body.height], i * 4);
  });
  parts.forEach((p, i) => put(details, p, i));
  bodies.count = appearances.length;
  details.count = parts.length;
  for (const mesh of [bodies, details]) {
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
  }
  for (const shape of ['gable', 'setback'] as const) {
    const roofs = appearances.filter(a => a.roofShape === shape).map(a => a.roof!);
    if (roofs.length === 0) continue;
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.translate(0, 0.5, 0);
    if (shape === 'gable') {
      const positions = geometry.getAttribute('position');
      // Collapse the upper box edge into a ridge running along local Z.
      for (let i = 0; i < positions.count; i++) if (positions.getY(i) > 0.5) positions.setX(i, 0);
      positions.needsUpdate = true;
      geometry.computeVertexNormals();
    }
    const mesh = new THREE.InstancedMesh(geometry, toon(), roofs.length);
    mesh.name = `reference-roof-${shape}`;
    roofs.forEach((p, i) => put(mesh, p, i));
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}
