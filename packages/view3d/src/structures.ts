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
      const parts: THREE.BufferGeometry[] = [];
      const b = w / 2 - 0.08;
      for (const ox of [-1, 1]) for (const oz of [-1, 1]) {
        const x = ox * w / 4, z = oz * w / 4;
        parts.push(box(b, h - 0.12, b, x, (h - 0.12) / 2, z, 0xb5a17b));
        parts.push(box(b - 0.16, 0.12, b - 0.16, x, h - 0.06, z, 0xc8b88e));
        // Coarse welded cage: deliberately readable at the pixel render resolution.
        for (const side of [-1, 1]) {
          for (let row = 0; row <= 4; row++) {
            const y = 0.06 + row * (h - 0.12) / 4;
            parts.push(box(b, 0.045, 0.045, x, y, z + side * b / 2, 0x686a59));
            parts.push(box(0.045, 0.045, b, x + side * b / 2, y, z, 0x686a59));
          }
          for (let col = 0; col <= 3; col++) {
            const offset = (col / 3 - 0.5) * b;
            parts.push(box(0.045, h, 0.045, x + offset, h / 2, z + side * b / 2, 0x7b7c68));
            parts.push(box(0.045, h, 0.045, x + side * b / 2, h / 2, z + offset, 0x7b7c68));
          }
        }
      }
      return merge(parts);
    }
    case 'wall': {
      const parts = [box(w - 0.18, h - 0.18, w - 0.18, 0, (h - 0.18) / 2, 0, 0x92958f),
        box(w, 0.18, w, 0, h - 0.09, 0, 0xb9b9aa),
        box(w, 0.28, w, 0, 0.14, 0, 0x74796f)];
      for (const side of [-1, 1]) {
        for (const offset of [-w / 3, w / 3]) {
          parts.push(box(0.16, h - 0.3, 0.12, offset, (h - 0.3) / 2, side * (w / 2 - 0.06), 0xa7aaa0));
          parts.push(box(0.12, h - 0.3, 0.16, side * (w / 2 - 0.06), (h - 0.3) / 2, offset, 0xa7aaa0));
        }
        for (const y of [h / 3, h * 2 / 3]) {
          parts.push(box(w - 0.3, 0.045, 0.02, 0, y, side * (w / 2 - 0.085), 0x656b66));
          parts.push(box(0.02, 0.045, w - 0.3, side * (w / 2 - 0.085), y, 0, 0x656b66));
        }
      }
      return merge(parts);
    }
    case 'gate': return gateGeometry(cs, false);
    case 'command_post': {
      // Watchtower: a sandbagged bunker at the foot, legs up to a parapet platform, a roof on
      // posts and a radio mast. Height h (8 m) is the roof.
      const box = (sx: number, sy: number, sz: number, x: number, y: number, z: number) => new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z);
      const parts: THREE.BufferGeometry[] = [];
      const deck = h * 0.55;
      const i = w / 2 - 0.25;
      parts.push(box(w, 1.6, w, 0, 0.8, 0));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(box(0.35, deck, 0.35, sx * i, deck / 2, sz * i));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(box(0.15, h - deck, 0.15, sx * i, deck + (h - deck) / 2, sz * i));
      parts.push(box(w, 0.3, w, 0, deck, 0));
      parts.push(box(w, 1.0, 0.45, 0, deck + 0.65, -i), box(w, 1.0, 0.45, 0, deck + 0.65, i));
      parts.push(box(0.45, 1.0, w - 0.9, -i, deck + 0.65, 0), box(0.45, 1.0, w - 0.9, i, deck + 0.65, 0));
      parts.push(box(w + 0.5, 0.25, w + 0.5, 0, h, 0));
      parts.push(box(0.1, 3.2, 0.1, i * 0.6, h + 1.6, i * 0.6));
      return merge(parts);
    }
    case 'mg_nest': {
      const parts = [box(w, 0.12, w, 0, 0.06, 0, 0x595c49)];
      const bag = w / 4;
      for (let row = 0; row < 3; row++) {
        for (let i = 0; i < 4; i++) for (const side of [-1, 1]) {
          const offset = -w / 2 + bag * (i + 0.5);
          const color = (i + row) % 2 ? 0xa29465 : 0xb9aa79;
          parts.push(box(bag - 0.055, (h - 0.12) / 3 - 0.035, 0.65,
            offset, 0.12 + (row + 0.5) * (h - 0.12) / 3, side * (w - 0.65) / 2, color));
          if (i === 1 || i === 2) parts.push(box(0.65, (h - 0.12) / 3 - 0.035, bag - 0.055,
            side * (w - 0.65) / 2, 0.12 + (row + 0.5) * (h - 0.12) / 3, offset, color));
        }
      }
      parts.push(box(0.18, h, 0.18, 0, h / 2, 0, 0x454f4b));
      parts.push(box(0.36, 0.28, 0.78, 0, h + 0.14, -0.22, 0x303c3e));
      parts.push(box(0.13, 0.13, 1.1, 0, h + 0.16, -1.08, 0x232e32));
      parts.push(box(0.22, 0.21, 0.14, 0, h + 0.16, -1.69, 0x424c4c));
      parts.push(box(0.28, 0.18, 0.45, 0, h + 0.06, 0.38, 0x5d6552));
      parts.push(box(0.5, 0.42, 0.6, -0.58, 0.33, -0.2, 0x677451));
      parts.push(box(0.55, 0.08, 0.64, -0.58, 0.58, -0.2, 0x909572));
      return merge(parts);
    }
  }
}

function box(sx: number, sy: number, sz: number, x: number, y: number, z: number, color: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z);
  const c = new THREE.Color(color);
  const colors = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) c.toArray(colors, i);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

/** The open gate retains its posts and ground rail, with no leaf across the passage. */
function gateGeometry(cs: number, open: boolean): THREE.BufferGeometry {
  const h = STRUCTURES.gate.height, w = cs - 0.2;
  const parts = [box(w, 0.08, 0.32, 0, 0.04, 0, 0x626b65)];
  for (const side of [-1, 1]) {
    parts.push(box(0.6, h, w, side * (w - 0.6) / 2, h / 2, 0, 0x747d74));
    parts.push(box(0.64, 0.18, w, side * (w - 0.64) / 2, h - 0.09, 0, 0xb2b6a5));
    if (open) continue;
    const leafWidth = (w - 1.25) / 2;
    const x = side * (leafWidth / 2 + 0.025);
    parts.push(box(leafWidth, h - 0.2, 0.28, x, h / 2, 0, 0x4b6266));
    for (let i = 0; i < 5; i++) parts.push(box(0.065, h - 0.3, 0.36,
      x + (i / 4 - 0.5) * (leafWidth - 0.15), h / 2, 0, 0x849491));
    for (const y of [0.25, h - 0.25]) parts.push(box(leafWidth, 0.15, 0.4, x, y, 0, 0x9ba69a));
    for (let i = 0; i < 4; i++) parts.push(box(leafWidth / 4 - 0.015, 0.28, 0.42,
      x + (i - 1.5) * leafWidth / 4, 0.65, 0, i % 2 ? 0x343e3e : 0xc5aa62));
  }
  return merge(parts);
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const colors: number[] = [];
  for (const p of parts) {
    const g = p.index ? p.toNonIndexed() : p;
    pos.push(...(g.attributes.position.array as Float32Array));
    nor.push(...(g.attributes.normal.array as Float32Array));
    if (g.attributes.color) colors.push(...(g.attributes.color.array as Float32Array));
    else colors.push(...new Float32Array(g.attributes.position.count * 3).fill(1));
    if (g !== p) g.dispose();
    p.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return out;
}

const KIND_COLOUR: Record<StructureKind, number> = {
  hesco: PALETTE.hesco,
  wall: PALETTE.concrete,
  gate: PALETTE.gate,
  mg_nest: PALETTE.sandbag,
  command_post: PALETTE.commandPost,
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
    const mat = toon({ vertexColors: true });
    for (const k of Object.keys(STRUCTURES) as StructureKind[]) this.built.set(k, this.instanced(geometryFor(k, cs), mat));
    this.built.set('gate_open', this.instanced(gateGeometry(cs, true), mat));
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
      this.col.set(s.kind === 'command_post' ? KIND_COLOUR[s.kind] : 0xffffff).lerp(this.dark, wear * 0.6);
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
