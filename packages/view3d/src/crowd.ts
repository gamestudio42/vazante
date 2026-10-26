import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { toon } from './materials.ts';

/**
 * Animated characters for crowds. A skinned glTF model is baked once at load: every animation
 * frame's bone matrices go into a float texture, and all mesh parts are merged into one
 * geometry. Each instance then only carries a transform, a colour and a frame number, so
 * hundreds of animated characters cost one draw call (plus one for shadows).
 */

const BAKE_FPS = 30;

export interface BakedClip {
  name: string;
  /** First texture row. */
  start: number;
  /** Rows after the first; the clip has frames + 1 rows. */
  frames: number;
  duration: number;
  loop: boolean;
}

export interface BakedModel {
  geometry: THREE.BufferGeometry;
  texture: THREE.DataTexture;
  clips: Map<string, BakedClip>;
}

export interface BakeOptions {
  /** Clips to bake; those not listed in `once` loop. */
  clips: string[];
  once?: string[];
  /** Colour overrides (sRGB hex) by material name, or by `node/material`. */
  colors?: Record<string, number>;
  /** How much each material follows the per-instance colour (0..1), by material name or `node/material`. */
  tint?: Record<string, number>;
  /** Standing height in metres. */
  height: number;
  /** Clips during which both arms reach forward (the infected). */
  reach?: string[];
}

/** Texture row for a clip at time t (seconds). Looping clips wrap; others hold their last frame. */
export function clipRow(c: BakedClip, t: number): number {
  let k = t / c.duration;
  k = c.loop ? k - Math.floor(k) : Math.min(1, Math.max(0, k));
  return c.start + k * c.frames;
}

export async function loadBakedModel(url: string, opts: BakeOptions): Promise<BakedModel> {
  const gltf = await new GLTFLoader().loadAsync(url);
  return bakeModel(gltf.scene, gltf.animations, opts);
}

interface Slot {
  /** Matrix that maps this part's geometry into model space for the current pose. */
  matrix: (out: THREE.Matrix4) => void;
}

export function bakeModel(root: THREE.Object3D, animations: THREE.AnimationClip[], opts: BakeOptions): BakedModel {
  root.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
  });

  // Model fix: face -z like the rest of the game and stand `height` metres tall.
  const box = new THREE.Box3().setFromObject(root, true);
  const scale = opts.height / Math.max(0.01, box.max.y - box.min.y);
  const fix = new THREE.Matrix4().makeRotationY(Math.PI).multiply(new THREE.Matrix4().makeScale(scale, scale, scale));
  fix.multiply(new THREE.Matrix4().makeTranslation(0, -box.min.y, 0));
  const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();

  // One slot per bone of each skinned part, one per rigid part (heads, pads, weapons).
  const slots: Slot[] = [];
  const parts: { mesh: THREE.Mesh; slotBase: number }[] = [];
  const tmp = new THREE.Matrix4();
  for (const mesh of meshes) {
    const base = slots.length;
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) {
      const sm = mesh as THREE.SkinnedMesh;
      sm.skeleton.bones.forEach((bone, b) => {
        slots.push({
          matrix: (out) => {
            tmp.multiplyMatrices(bone.matrixWorld, sm.skeleton.boneInverses[b]);
            out.copy(fix).multiply(rootInv).multiply(sm.matrixWorld).multiply(sm.bindMatrixInverse).multiply(tmp).multiply(sm.bindMatrix);
          },
        });
      });
    } else {
      slots.push({ matrix: (out) => out.copy(fix).multiply(rootInv).multiply(mesh.matrixWorld) });
    }
    parts.push({ mesh, slotBase: base });
  }

  const geometry = mergeParts(parts, opts);

  // Bake the clips.
  const mixer = new THREE.AnimationMixer(root);
  const clips = new Map<string, BakedClip>();
  const rows: Float32Array[] = [];
  const width = slots.length * 4;
  const m = new THREE.Matrix4();
  const arms = opts.reach ? findArms(root) : null;
  for (const name of opts.clips) {
    const clip = animations.find((a) => a.name === name);
    if (!clip) continue;
    const loop = !(opts.once ?? []).includes(name);
    const frames = Math.max(1, Math.round(clip.duration * BAKE_FPS));
    clips.set(name, { name, start: rows.length, frames, duration: clip.duration, loop });
    mixer.stopAllAction();
    const action = mixer.clipAction(clip);
    action.reset();
    if (!loop) {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    }
    action.play();
    for (let f = 0; f <= frames; f++) {
      // A looping clip wraps back to its first pose on the last row, so playback can wrap seamlessly.
      mixer.setTime((f / frames) * clip.duration);
      root.updateMatrixWorld(true);
      if (arms && opts.reach!.includes(name)) reachForward(arms, root, f / frames);
      const row = new Float32Array(width * 4);
      slots.forEach((s, i) => {
        s.matrix(m);
        row.set(m.elements, i * 16);
      });
      rows.push(row);
    }
  }
  const data = new Float32Array(width * 4 * rows.length);
  rows.forEach((r, i) => data.set(r, i * width * 4));
  const texture = new THREE.DataTexture(data, width, rows.length, THREE.RGBAFormat, THREE.FloatType);
  texture.minFilter = texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return { geometry, texture, clips };
}

function mergeParts(parts: { mesh: THREE.Mesh; slotBase: number }[], opts: BakeOptions): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const tint: number[] = [];
  const skin: number[] = [];
  const weight: number[] = [];
  const index: number[] = [];
  const c = new THREE.Color();
  for (const { mesh, slotBase } of parts) {
    const g = mesh.geometry;
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    const si = g.getAttribute('skinIndex');
    const sw = g.getAttribute('skinWeight');
    const skinned = (mesh as THREE.SkinnedMesh).isSkinnedMesh;
    const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
    const node = nodeName(mesh);
    const key = `${node}/${mat.name}`;
    const override = opts.colors?.[key] ?? opts.colors?.[mat.name];
    if (override !== undefined) c.setHex(override);
    else c.copy(mat.color);
    const tw = opts.tint?.[key] ?? opts.tint?.[mat.name] ?? 0;
    const base = pos.length / 3;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      if (n) nor.push(n.getX(i), n.getY(i), n.getZ(i));
      else nor.push(0, 1, 0);
      col.push(c.r, c.g, c.b);
      tint.push(tw);
      if (skinned) {
        skin.push(slotBase + si.getX(i), slotBase + si.getY(i), slotBase + si.getZ(i), slotBase + si.getW(i));
        weight.push(sw.getX(i), sw.getY(i), sw.getZ(i), sw.getW(i));
      } else {
        skin.push(slotBase, 0, 0, 0);
        weight.push(1, 0, 0, 0);
      }
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) index.push(base + g.index.getX(i));
    else for (let i = 0; i < p.count; i++) index.push(base + i);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('aTint', new THREE.Float32BufferAttribute(tint, 1));
  geo.setAttribute('aSkin', new THREE.Float32BufferAttribute(skin, 4));
  geo.setAttribute('aWeight', new THREE.Float32BufferAttribute(weight, 4));
  geo.setIndex(index);
  return geo;
}

/** glTF primitives become child meshes of a group named after the node. */
function nodeName(mesh: THREE.Object3D): string {
  const parent = mesh.parent;
  if (parent && parent.type === 'Group' && /_\d+$/.test(mesh.name)) return parent.name;
  return mesh.name;
}

interface Arm {
  upper: THREE.Object3D;
  lower: THREE.Object3D;
  hand: THREE.Object3D;
  side: number;
}

function findArms(root: THREE.Object3D): Arm[] {
  const arms: Arm[] = [];
  for (const [s, side] of [
    ['L', 1],
    ['R', -1],
  ] as const) {
    const upper = root.getObjectByName(`UpperArm${s}`) ?? root.getObjectByName(`UpperArm.${s}`);
    const lower = root.getObjectByName(`LowerArm${s}`) ?? root.getObjectByName(`LowerArm.${s}`);
    const hand = root.getObjectByName(`Middle1${s}`) ?? root.getObjectByName(`Middle1.${s}`);
    if (upper && lower && hand) arms.push({ upper, lower, hand, side });
  }
  return arms;
}

const va = new THREE.Vector3();
const vb = new THREE.Vector3();
const vt = new THREE.Vector3();
const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();
const qp = new THREE.Quaternion();

/** Turn a bone so the segment to `end` points along `dir` (model space), keeping the rest. */
function aim(bone: THREE.Object3D, end: THREE.Object3D, dir: THREE.Vector3, root: THREE.Object3D): void {
  bone.getWorldPosition(va);
  end.getWorldPosition(vb);
  const cur = vb.sub(va).normalize();
  qa.setFromUnitVectors(cur, vt.copy(dir).transformDirection(root.matrixWorld).normalize());
  bone.getWorldQuaternion(qb);
  bone.parent!.getWorldQuaternion(qp).invert();
  bone.quaternion.copy(qp.multiply(qa.multiply(qb)));
  bone.updateMatrixWorld(true);
}

/** The infected walk with both arms out in front, swaying a little out of step. */
function reachForward(arms: Arm[], root: THREE.Object3D, k: number): void {
  const d = new THREE.Vector3();
  for (const arm of arms) {
    const sway = Math.sin((k + (arm.side > 0 ? 0 : 0.5)) * Math.PI * 2) * 0.08;
    d.set(arm.side * 0.12, -0.12 + sway, 1).normalize();
    aim(arm.upper, arm.lower, d, root);
    d.set(arm.side * 0.04, -0.05 - sway, 1).normalize();
    aim(arm.lower, arm.hand, d, root);
  }
}

const VERT_HEAD = /* glsl */ `
uniform sampler2D uBake;
attribute vec4 aSkin;
attribute vec4 aWeight;
attribute float aTint;
attribute float aFrame;
mat4 bakeBone(int slot, int row) {
  int x = slot * 4;
  return mat4(texelFetch(uBake, ivec2(x, row), 0), texelFetch(uBake, ivec2(x + 1, row), 0),
              texelFetch(uBake, ivec2(x + 2, row), 0), texelFetch(uBake, ivec2(x + 3, row), 0));
}
mat4 bakeSkin() {
  int r0 = int(aFrame);
  float fr = fract(aFrame);
  mat4 m = mat4(0.0);
  for (int i = 0; i < 4; i++) {
    float w = aWeight[i];
    if (w > 0.0) {
      int s = int(aSkin[i] + 0.5);
      m += w * ((1.0 - fr) * bakeBone(s, r0) + fr * bakeBone(s, r0 + 1));
    }
  }
  return m;
}
`;

function patch(material: THREE.Material, texture: THREE.Texture, withNormals: boolean): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBake = { value: texture };
    let v = shader.vertexShader.replace('#include <common>', `#include <common>\n${VERT_HEAD}`);
    if (withNormals) {
      v = v.replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nmat4 bakeM = bakeSkin();\nobjectNormal = normalize(mat3(bakeM) * objectNormal);');
      v = v.replace(
        '#include <color_vertex>',
        `#if defined( USE_COLOR )
          vColor = color.rgb;
          #ifdef USE_INSTANCING_COLOR
            vColor = mix(vColor, instanceColor.rgb, aTint);
          #endif
        #endif`,
      );
    }
    const decl = withNormals ? '' : 'mat4 bakeM = bakeSkin();\n';
    v = v.replace('#include <begin_vertex>', `#include <begin_vertex>\n${decl}transformed = (bakeM * vec4(transformed, 1.0)).xyz;`);
    shader.vertexShader = v;
  };
}

/** Instanced crowd of one baked model. */
export class Crowd {
  readonly mesh: THREE.InstancedMesh;
  private readonly frame: THREE.InstancedBufferAttribute;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  count = 0;

  constructor(
    readonly model: BakedModel,
    capacity: number,
  ) {
    const geo = model.geometry.clone();
    this.frame = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    this.frame.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aFrame', this.frame);
    const mat = toon({ vertexColors: true });
    patch(mat, model.texture, true);
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.mesh.count = 0;
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    patch(depth, model.texture, false);
    this.mesh.customDepthMaterial = depth;
  }

  get capacity(): number {
    return this.frame.count;
  }

  clip(name: string): BakedClip {
    const c = this.model.clips.get(name);
    if (!c) throw new Error(`clip ${name} not baked`);
    return c;
  }

  begin(): void {
    this.count = 0;
  }

  /** Add one character at (x, y) on the simulation plane, facing yaw (around +y, front is -z). */
  add(x: number, y: number, elevation: number, yaw: number, scale: number, row: number, color: THREE.Color): boolean {
    if (this.count >= this.capacity) return false;
    const i = this.count++;
    this.q.setFromAxisAngle(Y_AXIS, yaw);
    this.p.set(x, elevation, y);
    this.s.set(scale, scale, scale);
    this.m.compose(this.p, this.q, this.s);
    this.mesh.setMatrixAt(i, this.m);
    this.mesh.setColorAt(i, color);
    this.frame.array[i] = row;
    return true;
  }

  end(): void {
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
    this.frame.needsUpdate = true;
  }
}

const Y_AXIS = new THREE.Vector3(0, 1, 0);
