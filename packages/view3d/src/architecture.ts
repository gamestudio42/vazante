import * as THREE from 'three';
import { PRESENTATION, type BuildingRect, type MapInfo } from '@vazante/shared';
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

export interface BuildingAppearance {
  family: BuildingFamily;
  familyIndex: number;
  variation: number;
  wear: number;
  body: FacadePart;
  details: FacadePart[];
}

/** All details stay inside the engine's occupied rectangle and below its sight-blocking height. */
export function planBuilding(b: BuildingRect, cellSize: number, seed: number): BuildingAppearance {
  const tuning = PRESENTATION.architecture;
  const district = hash(Math.floor(b.x0 / tuning.neighborhoodCells) * 73856093 ^ Math.floor(b.y0 / tuning.neighborhoodCells) * 19349663 ^ seed);
  const variation = hash(b.id * 92821 ^ district);
  const width = (b.x1 - b.x0 + 1) * cellSize - tuning.inset * 2;
  const depth = (b.y1 - b.y0 + 1) * cellSize - tuning.inset * 2;
  const familyIndex = b.height <= tuning.industrialMaxHeight && Math.min(width, depth) >= tuning.industrialMinWidth && variation % 3 === 0
    ? 2 : variation % 7 === 0 ? 3 : variation % 3 === 1 ? 1 : 0;
  const family = BUILDING_FAMILIES[familyIndex];
  const colors = PALETTE.architecture[family];
  const x = (b.x0 + b.x1 + 1) * cellSize / 2;
  const z = (b.y0 + b.y1 + 1) * cellSize / 2;
  const body: FacadePart = { x, y: 0, z, width, height: b.height, depth, color: colors.walls[variation % colors.walls.length] };
  const details: FacadePart[] = [];
  const add = (px: number, py: number, pz: number, w: number, h: number, d: number, color: number) => {
    details.push({ x: px, y: py, z: pz, width: w, height: h, depth: d, color });
  };
  const lip = tuning.trimProjection;
  const band = tuning.corniceHeight;
  const edge = tuning.corniceWidth;
  // A shallow roof rim changes the profile without introducing fake walkable terraces.
  for (const side of [-1, 1]) {
    add(x, b.height - band, z + side * (depth / 2 - edge / 2 + lip), width + 2 * lip, band, edge, colors.trim);
    add(x + side * (width / 2 - edge / 2 + lip), b.height - band, z, edge, band, depth, colors.trim);
  }
  const faceDepth = tuning.inset + lip;
  if (family === 'residential') {
    // Shallow sill/balcony bands give the plaster blocks a domestic scale.
    const rows = Math.min(tuning.balconyRows, Math.floor((b.height - band) / tuning.floorHeight));
    for (let row = 1; row <= rows; row++) for (const side of [-1, 1]) {
      const y = row * tuning.floorHeight;
      add(x, y, z + side * depth / 2, width * 0.82, band, faceDepth, colors.trim);
    }
  } else if (family === 'commercial' || family === 'civic') {
    const columns = family === 'civic' ? tuning.civicColumns : 2;
    for (let i = 0; i < columns; i++) for (const side of [-1, 1]) {
      const px = x + (i / (columns - 1) - 0.5) * (width - edge * 2);
      add(px, 0, z + side * depth / 2, edge, b.height - band, faceDepth, colors.trim);
    }
    for (const side of [-1, 1]) {
      add(x, Math.min(tuning.shopHeight, b.height - band), z + side * depth / 2, width, band, faceDepth, colors.accent);
    }
  } else {
    for (const side of [-1, 1]) {
      add(x, Math.min(tuning.shopHeight, b.height - band), z + side * depth / 2, width * 0.75, band, faceDepth, colors.accent);
    }
  }
  return { family, familyIndex, variation: variation % 251, wear: tuning.wearMin + ((variation >>> 8) % 100) / 100 * tuning.wearRange, body, details };
}

/** One body batch and one detail batch, subsequently culled in the city's existing chunks. */
export function buildArchitecture(map: MapInfo): THREE.Group {
  const group = new THREE.Group();
  const appearances = map.buildings.map(b => planBuilding(b, map.cellSize, map.seed));
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
  return group;
}
