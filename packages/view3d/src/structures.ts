import * as THREE from 'three';
import { STRUCTURES, STRUCTURE_KINDS, type StructureKind, type StructureView } from '@vazante/shared';
import { toon } from './materials.ts';
import { PALETTE } from './palette.ts';

const CAP = 1024;

/** Geometry for each finished structure type; origin at the cell centre on the ground. */
function geometryFor(kind: StructureKind, cs: number): THREE.BufferGeometry {
  const h = STRUCTURES[kind].height;
  const w = cs - 0.2;
  switch (kind) {
    case 'hesco': {
      // A 2 x 2 block of filled baskets with a slight gap between them.
      const parts: THREE.BufferGeometry[] = [];
      const b = w / 2 - 0.1;
      for (const ox of [-1, 1]) {
        for (const oz of [-1, 1]) {
          const g = new THREE.BoxGeometry(b, h, b);
          g.translate((ox * w) / 4, h / 2, (oz * w) / 4);
          parts.push(g);
        }
      }
      return merge(parts);
    }
    case 'wall': {
      const g = new THREE.BoxGeometry(w, h, w);
      g.translate(0, h / 2, 0);
      return g;
    }
    case 'gate': {
      const posts = [-1, 1].map((s) => {
        const g = new THREE.BoxGeometry(0.6, h + 0.4, w);
        g.translate((s * (w - 0.6)) / 2, (h + 0.4) / 2, 0);
        return g;
      });
      const leaf = new THREE.BoxGeometry(w - 1.2, h, w * 0.5);
      leaf.translate(0, h / 2, 0);
      return merge([...posts, leaf]);
    }
    case 'mg_nest': {
      const parts: THREE.BufferGeometry[] = [];
      // Ring of sandbags around a pit, with the gun on top.
      for (const [sx, sz, lx, lz] of [
        [0, -1, w, 0.8],
        [0, 1, w, 0.8],
        [-1, 0, 0.8, w - 1.6],
        [1, 0, 0.8, w - 1.6],
      ]) {
        const g = new THREE.BoxGeometry(lx, h, lz);
        g.translate((sx * (w - 0.8)) / 2, h / 2, (sz * (w - 0.8)) / 2);
        parts.push(g);
      }
      const gun = new THREE.BoxGeometry(0.15, 0.15, 1.6);
      gun.translate(0, h + 0.2, -0.6);
      parts.push(gun);
      return merge(parts);
    }
  }
}

/** Gate leaf lowered into the ground when open: just the posts. */
function openGateGeometry(cs: number): THREE.BufferGeometry {
  const h = STRUCTURES.gate.height;
  const w = cs - 0.2;
  return merge(
    [-1, 1].map((s) => {
      const g = new THREE.BoxGeometry(0.6, h + 0.4, w);
      g.translate((s * (w - 0.6)) / 2, (h + 0.4) / 2, 0);
      return g;
    }),
  );
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  for (const p of parts) {
    const g = p.index ? p.toNonIndexed() : p;
    pos.push(...(g.attributes.position.array as Float32Array));
    nor.push(...(g.attributes.normal.array as Float32Array));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
}

const KIND_COLOUR: Record<StructureKind, number> = {
  hesco: PALETTE.hesco,
  wall: PALETTE.concrete,
  gate: PALETTE.gate,
  mg_nest: PALETTE.sandbag,
};

/**
 * Structures, blueprints and the placement ghost. Rebuilt from each frame's structure list
 * (a few hundred at most), so it never holds state the simulation does not.
 */
export class StructureLayer {
  readonly group = new THREE.Group();
  private readonly built = new Map<StructureKind | 'gate_open', THREE.InstancedMesh>();
  private readonly blueprint: THREE.InstancedMesh;
  private readonly ghosts = new Map<StructureKind, THREE.InstancedMesh>();
  private readonly m = new THREE.Matrix4();
  private readonly col = new THREE.Color();
  private readonly dark = new THREE.Color(0x201a16);
  /** Height (m) of the finished, closed structure per cell; zombies inside are drawn on top of it. */
  readonly heightAt: Float32Array;

  constructor(
    private readonly cs: number,
    private readonly width: number,
    height: number,
  ) {
    this.heightAt = new Float32Array(width * height);
    const mat = toon();
    for (const k of STRUCTURE_KINDS) this.built.set(k, this.instanced(geometryFor(k, cs), mat));
    this.built.set('gate_open', this.instanced(openGateGeometry(cs), mat));
    const box = new THREE.BoxGeometry(cs - 0.2, 1, cs - 0.2);
    box.translate(0, 0.5, 0);
    this.blueprint = new THREE.InstancedMesh(box, new THREE.MeshBasicMaterial({ color: PALETTE.blueprint, transparent: true, opacity: 0.35, depthWrite: false }), CAP);
    this.blueprint.count = 0;
    this.blueprint.frustumCulled = false;
    this.group.add(this.blueprint);
    const ghostMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55, depthWrite: false });
    for (const k of STRUCTURE_KINDS) {
      const g = new THREE.InstancedMesh(geometryFor(k, cs), ghostMat, 128);
      g.count = 0;
      g.frustumCulled = false;
      g.renderOrder = 2;
      this.ghosts.set(k, g);
      this.group.add(g);
    }
  }

  private instanced(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.InstancedMesh {
    const m = new THREE.InstancedMesh(geo, mat, CAP);
    m.count = 0;
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false;
    this.group.add(m);
    return m;
  }

  update(list: readonly StructureView[]): void {
    const counts = new Map<string, number>();
    for (const mesh of this.built.values()) mesh.count = 0;
    this.heightAt.fill(0);
    let bp = 0;
    for (const s of list) {
      const x = (s.cx + 0.5) * this.cs;
      const y = (s.cy + 0.5) * this.cs;
      if (!s.built) {
        if (bp >= CAP) continue;
        const h = Math.max(0.15, STRUCTURES[s.kind].height * s.progress);
        this.m.makeScale(1, h, 1).setPosition(x, 0, y);
        this.blueprint.setMatrixAt(bp++, this.m);
        continue;
      }
      const key = s.kind === 'gate' && s.open ? 'gate_open' : s.kind;
      const mesh = this.built.get(key)!;
      const i = counts.get(key) ?? 0;
      if (i >= CAP) continue;
      counts.set(key, i + 1);
      this.m.makeTranslation(x, 0, y);
      mesh.setMatrixAt(i, this.m);
      const wear = 1 - s.hp / s.maxHp;
      this.col.set(KIND_COLOUR[s.kind]).lerp(this.dark, wear * 0.6);
      mesh.setColorAt(i, this.col);
      mesh.count = i + 1;
      if (key !== 'gate_open') this.heightAt[s.cy * this.width + s.cx] = STRUCTURES[s.kind].height;
    }
    for (const mesh of this.built.values()) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    this.blueprint.count = bp;
    this.blueprint.instanceMatrix.needsUpdate = true;
  }

  /** Placement preview: one ghost per cell, green when valid and red otherwise. Empty hides it. */
  setGhosts(kind: StructureKind | null, cells: readonly { cx: number; cy: number; ok: boolean }[]): void {
    for (const [k, mesh] of this.ghosts) {
      if (k !== kind) {
        mesh.count = 0;
        continue;
      }
      const n = Math.min(cells.length, 128);
      for (let i = 0; i < n; i++) {
        const c = cells[i];
        this.m.makeTranslation((c.cx + 0.5) * this.cs, 0.02, (c.cy + 0.5) * this.cs);
        mesh.setMatrixAt(i, this.m);
        mesh.setColorAt(i, this.col.set(c.ok ? PALETTE.ghostOk : PALETTE.ghostBad));
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
}
