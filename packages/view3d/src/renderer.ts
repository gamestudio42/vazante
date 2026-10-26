import * as THREE from 'three';
import {
  SOLDIER_STRIDE,
  SoldierActivity,
  SoldierCondition,
  SoldierField,
  ZOMBIE_POOL_CAPACITY,
  ZOMBIE_STRIDE,
  ZombieField,
  ZombieState,
  type Frame,
  type MapInfo,
} from '@vazante/shared';
import { CameraRig } from './camera.ts';
import { CharacterBatch, IDLE_POSE, walkPose, type CharacterColors, type Pose } from './characters.ts';
import { buildCity, buildDistrictOverlay, hash } from './city.ts';
import { DecalLayer, OrderMarkers, Particles } from './fx.ts';
import { toon } from './materials.ts';
import { PALETTE } from './palette.ts';
import { PixelPost } from './post.ts';
import { StructureLayer } from './structures.ts';
import { VehicleLayer } from './vehicles.ts';

const INTERNAL_HEIGHT = 270;
const MAX_SOLDIER_ID = 1024;
const MAX_SOLDIERS = 256;
const MAX_TRACERS = 512;
const TRACER_LIFE_S = 0.08;
const MAX_CORPSES = 1500;
const CORPSE_FALL_S = 0.35;
const PATH_VERTS = 4096;
/** Metres of travel per full walk cycle (two steps). */
const STRIDE_M = 1.6;

interface Tracer {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  age: number;
}

interface Corpse {
  x: number;
  y: number;
  yaw: number;
  scale: number;
  born: number;
  colors: CharacterColors;
}

/**
 * Three.js view of the world. Reads frames, interpolates between the last two, animates, draws.
 * It never writes to the simulation; everything here is cosmetic and may use wall-clock time and Math.random.
 */
export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly rig: CameraRig;
  readonly map: MapInfo;
  private readonly post = new PixelPost();
  private readonly sun: THREE.DirectionalLight;
  private readonly fog: THREE.Fog;
  private readonly soldiers: CharacterBatch;
  private readonly zombies: CharacterBatch;
  private readonly corpseBatch: CharacterBatch;
  private readonly ringMesh: THREE.InstancedMesh;
  private readonly markerMesh: THREE.InstancedMesh;
  private readonly tracerGeo: THREE.BufferGeometry;
  private readonly pathGeo: THREE.BufferGeometry;
  private readonly districts: THREE.Group;
  private readonly tracers: Tracer[] = [];
  private readonly blood: DecalLayer;
  private readonly particles = new Particles(1200);
  private readonly orders = new OrderMarkers(PALETTE.orderMarker);
  readonly structures: StructureLayer;
  readonly vehicles = new VehicleLayer();
  private readonly corpses: Corpse[] = [];
  private corpseNext = 0;
  private corpsesDirty = false;
  private corpseScale = 0;

  // Interpolation state.
  private prev: Frame | null = null;
  private curr: Frame | null = null;
  private currAt = 0;
  private interval = 100;
  private readonly zPrevX = new Float32Array(ZOMBIE_POOL_CAPACITY);
  private readonly zPrevY = new Float32Array(ZOMBIE_POOL_CAPACITY);
  private readonly zSeenTick = new Int32Array(ZOMBIE_POOL_CAPACITY).fill(-1);
  private readonly zPrevSlotX = new Float32Array(ZOMBIE_POOL_CAPACITY);
  private readonly zPrevSlotY = new Float32Array(ZOMBIE_POOL_CAPACITY);

  // Animation state (per zombie slot and per soldier id).
  private readonly zFresh = new Uint8Array(ZOMBIE_POOL_CAPACITY);
  private readonly zDrawX = new Float32Array(ZOMBIE_POOL_CAPACITY);
  private readonly zDrawY = new Float32Array(ZOMBIE_POOL_CAPACITY);
  private readonly zPhase = new Float32Array(ZOMBIE_POOL_CAPACITY);
  private readonly zSpeed = new Float32Array(ZOMBIE_POOL_CAPACITY);
  private readonly zYaw = new Float32Array(ZOMBIE_POOL_CAPACITY);
  private readonly zColors: (CharacterColors | undefined)[] = [];
  private readonly sDrawX = new Float32Array(MAX_SOLDIER_ID);
  private readonly sDrawY = new Float32Array(MAX_SOLDIER_ID);
  private readonly sPhase = new Float32Array(MAX_SOLDIER_ID);
  private readonly sSpeed = new Float32Array(MAX_SOLDIER_ID);
  private readonly sRecoil = new Float32Array(MAX_SOLDIER_ID);
  private readonly sSeen = new Uint8Array(MAX_SOLDIER_ID);
  private readonly sColors: (CharacterColors | undefined)[] = [];

  selectedSquads = new Set<number>();
  private readonly tmpM = new THREE.Matrix4();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpS = new THREE.Vector3();
  private readonly tmpP = new THREE.Vector3();
  private readonly tmpC = new THREE.Color();
  private readonly pose: Pose = { ...IDLE_POSE };

  constructor(canvas: HTMLCanvasElement, map: MapInfo) {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene.background = new THREE.Color(PALETTE.sky);
    this.fog = new THREE.Fog(PALETTE.fog, 5000, 6000);
    this.scene.fog = this.fog;
    const wM = map.width * map.cellSize;
    const hM = map.height * map.cellSize;
    this.rig = new CameraRig(wM, hM);

    this.scene.add(new THREE.HemisphereLight(PALETTE.skyLight, PALETTE.groundLight, 1.6));
    this.sun = new THREE.DirectionalLight(PALETTE.sun, 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.3;
    this.scene.add(this.sun, this.sun.target);

    this.scene.add(buildCity(map));
    this.structures = new StructureLayer(map.cellSize, map.width, map.height);
    this.scene.add(this.structures.group, this.vehicles.group);
    this.districts = buildDistrictOverlay(map);
    this.scene.add(this.districts);

    const bodyMat = toon({ vertexColors: false });
    this.soldiers = new CharacterBatch(MAX_SOLDIERS, bodyMat, true);
    this.zombies = new CharacterBatch(ZOMBIE_POOL_CAPACITY, bodyMat, false);
    this.corpseBatch = new CharacterBatch(MAX_CORPSES, bodyMat, false);
    this.corpseBatch.group.traverse((o) => (o.castShadow = false));
    this.scene.add(this.soldiers.group, this.zombies.group, this.corpseBatch.group);

    this.blood = new DecalLayer(2000, PALETTE.blood, 0.55);
    this.scene.add(this.blood.mesh, this.particles.mesh, this.orders.group);

    const ring = new THREE.RingGeometry(0.55, 0.7, 12);
    ring.rotateX(-Math.PI / 2);
    this.ringMesh = new THREE.InstancedMesh(ring, new THREE.MeshBasicMaterial({ color: PALETTE.selection, side: THREE.DoubleSide, fog: false, transparent: true, opacity: 0.75, depthWrite: false }), MAX_SOLDIERS);
    this.ringMesh.count = 0;
    this.ringMesh.frustumCulled = false;
    this.scene.add(this.ringMesh);

    const marker = new THREE.CircleGeometry(1, 16);
    marker.rotateX(-Math.PI / 2);
    this.markerMesh = new THREE.InstancedMesh(marker, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85 }), 64);
    this.markerMesh.count = 0;
    this.markerMesh.frustumCulled = false;
    this.scene.add(this.markerMesh);

    this.tracerGeo = new THREE.BufferGeometry();
    this.tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_TRACERS * 6), 3));
    const tracerLines = new THREE.LineSegments(this.tracerGeo, new THREE.LineBasicMaterial({ color: PALETTE.tracer, fog: false }));
    tracerLines.frustumCulled = false;
    this.scene.add(tracerLines);

    this.pathGeo = new THREE.BufferGeometry();
    this.pathGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PATH_VERTS * 3), 3));
    const pathLines = new THREE.LineSegments(this.pathGeo, new THREE.LineBasicMaterial({ color: PALETTE.path, transparent: true, opacity: 0.7, depthWrite: false }));
    pathLines.frustumCulled = false;
    this.scene.add(pathLines);
  }

  resize(cssW: number, cssH: number): void {
    const scale = Math.max(1, Math.round(cssH / INTERNAL_HEIGHT));
    const w = Math.max(1, Math.floor(cssW / scale));
    const h = Math.max(1, Math.floor(cssH / scale));
    this.renderer.setSize(w, h, false);
    this.post.setSize(w, h);
    this.rig.setAspect(w / h);
  }

  /** Visual acknowledgement of a move order. */
  markOrder(x: number, y: number): void {
    this.orders.add(x, y);
  }

  pushFrame(f: Frame, nowMs: number): void {
    // Remember where each zombie slot was so we can interpolate.
    if (this.curr) {
      const z = this.curr.zombies;
      for (let i = 0; i < z.length; i += ZOMBIE_STRIDE) {
        const slot = z[i + ZombieField.Slot];
        this.zPrevSlotX[slot] = z[i + ZombieField.X];
        this.zPrevSlotY[slot] = z[i + ZombieField.Y];
      }
      this.interval = Math.min(250, Math.max(16, nowMs - this.currAt));
    }
    const prevTick = this.curr ? this.curr.tick : -1;
    const z = f.zombies;
    for (let i = 0; i < z.length; i += ZOMBIE_STRIDE) {
      const slot = z[i + ZombieField.Slot];
      if (this.zSeenTick[slot] !== prevTick) {
        // New (or reused) slot: no interpolation from a stale position.
        this.zPrevSlotX[slot] = z[i + ZombieField.X];
        this.zPrevSlotY[slot] = z[i + ZombieField.Y];
        this.zFresh[slot] = 1;
      }
      this.zPrevX[slot] = this.zPrevSlotX[slot];
      this.zPrevY[slot] = this.zPrevSlotY[slot];
      this.zSeenTick[slot] = f.tick;
    }
    this.structures.update(f.structures);
    this.vehicles.push(f.vehicles);
    this.prev = this.curr;
    this.curr = f;
    this.currAt = nowMs;
    for (const e of f.events) this.onEvent(e, nowMs);
  }

  private onEvent(e: Frame['events'][number], nowMs: number): void {
    const boost = this.unitScale();
    switch (e.type) {
      case 'shot': {
        if (e.x === undefined || e.x2 === undefined) return;
        if (this.tracers.length >= MAX_TRACERS) this.tracers.shift();
        this.tracers.push({ x0: e.x, y0: e.y!, x1: e.x2, y1: e.y2!, age: 0 });
        const dx = e.x2 - e.x;
        const dy = e.y2! - e.y!;
        const d = Math.hypot(dx, dy) || 1;
        const mx = e.x + (dx / d) * 0.9 * boost;
        const my = e.y! + (dy / d) * 0.9 * boost;
        this.particles.emit(mx, my, 1.3 * boost, 2, { speed: 1, up: 0.2, life: 0.05, size: 0.35 * boost, color: PALETTE.muzzle, gravity: 0, spread: 0.3 });
        if (e.source !== undefined && e.source < MAX_SOLDIER_ID) this.sRecoil[e.source] = 1;
        if ((e.value ?? 0) === 0) {
          // Miss: dust where the round lands.
          this.particles.emit(e.x2, e.y2!, 0.1, 3, { speed: 1.5, up: 1.5, life: 0.4, size: 0.18, color: PALETTE.dust });
        } else {
          this.particles.emit(e.x2, e.y2!, 1.1, 4, { speed: 2.5, up: 1.2, life: 0.35, size: 0.16, color: PALETTE.bloodFresh, dirX: dx / d, dirY: dy / d, spread: 0.6 });
        }
        return;
      }
      case 'zombie_killed': {
        if (e.x === undefined) return;
        this.blood.add(e.x, e.y!, 0.7 + Math.random() * 0.8, Math.random() * Math.PI, 1 + Math.random() * 0.8);
        this.particles.emit(e.x, e.y!, 1.2, 8, { speed: 3, up: 2, life: 0.5, size: 0.2, color: PALETTE.bloodFresh });
        const slot = e.target ?? 0;
        this.addCorpse(e.x, e.y!, this.zYaw[slot] + Math.PI, this.zombieScale(slot), this.zombieColors(slot), nowMs);
        return;
      }
      case 'soldier_hit':
      case 'soldier_bitten':
        if (e.x === undefined) return;
        this.blood.add(e.x, e.y!, 0.6 + Math.random() * 0.5, Math.random() * Math.PI);
        this.particles.emit(e.x, e.y!, 1.3, 5, { speed: 2, up: 1.5, life: 0.4, size: 0.16, color: PALETTE.bloodFresh });
        return;
      case 'structure_destroyed':
        if (e.x === undefined) return;
        this.particles.emit(e.x, e.y!, 1.5, 30, { speed: 4, up: 4, life: 1.2, size: 0.45, color: PALETTE.dust });
        this.particles.emit(e.x, e.y!, 1.5, 12, { speed: 3, up: 5, life: 1.0, size: 0.3, color: PALETTE.concrete });
        return;
      case 'vehicle_hit':
        if (e.x === undefined) return;
        this.particles.emit(e.x, e.y!, 1.2, 2, { speed: 2, up: 1.5, life: 0.3, size: 0.15, color: PALETTE.spark, gravity: 6 });
        return;
      case 'vehicle_destroyed':
        if (e.x === undefined) return;
        this.particles.emit(e.x, e.y!, 1.5, 40, { speed: 6, up: 6, life: 1.0, size: 0.5, color: PALETTE.muzzle, gravity: 4 });
        this.particles.emit(e.x, e.y!, 2, 30, { speed: 2, up: 3, life: 2.5, size: 0.9, color: PALETTE.wreck, gravity: -0.5 });
        this.blood.add(e.x, e.y!, 6, Math.random() * Math.PI, 1.3);
        return;
      case 'structure_built':
        if (e.x === undefined) return;
        this.particles.emit(e.x, e.y!, 0.3, 14, { speed: 2, up: 1, life: 0.6, size: 0.3, color: PALETTE.dust });
        return;
      case 'soldier_died':
        if (e.x === undefined) return;
        this.blood.add(e.x, e.y!, 1.6, Math.random() * Math.PI, 1.5);
        return;
      default:
    }
  }

  private addCorpse(x: number, y: number, yaw: number, scale: number, colors: CharacterColors, nowMs: number): void {
    const c: Corpse = { x, y, yaw, scale, born: nowMs, colors };
    if (this.corpses.length < MAX_CORPSES) this.corpses.push(c);
    else this.corpses[this.corpseNext] = c;
    this.corpseNext = (this.corpseNext + 1) % MAX_CORPSES;
    this.corpsesDirty = true;
  }

  /** Interpolated soldier position by frame index. */
  soldierPos(i: number, alpha: number): [number, number] {
    const c = this.curr!.soldiers;
    const o = i * SOLDIER_STRIDE;
    const x = c[o + SoldierField.X];
    const y = c[o + SoldierField.Y];
    const p = this.prev?.soldiers;
    if (!p || p.length <= o || p[o + SoldierField.Id] !== c[o + SoldierField.Id]) return [x, y];
    return [p[o + SoldierField.X] + (x - p[o + SoldierField.X]) * alpha, p[o + SoldierField.Y] + (y - p[o + SoldierField.Y]) * alpha];
  }

  alpha(nowMs: number): number {
    return Math.min(1, Math.max(0, (nowMs - this.currAt) / this.interval));
  }

  render(nowMs: number, dtS: number): void {
    this.rig.update(dtS);
    const f = this.curr;
    const t = nowMs / 1000;
    if (f) {
      const a = this.alpha(nowMs);
      this.drawSoldiers(f, a, dtS, t);
      this.drawZombies(f, a, dtS, t);
      this.drawMarkers(f);
      this.drawPaths(f);
    }
    this.vehicles.draw(this.alpha(nowMs), Math.min(3, this.unitScale()), t);
    this.drawCorpses(nowMs);
    this.drawTracers(dtS);
    this.particles.update(dtS);
    this.orders.update(dtS, this.unitScale());
    this.updateLighting();
    this.districts.visible = this.rig.band !== 'tactical' && !this.rig.direct;
    this.post.render(this.renderer, this.scene, this.rig.active);
  }

  /** Shadow frustum follows what the camera looks at; fog only in the third-person view. */
  private updateLighting(): void {
    const d = this.rig.direct;
    const fx = d ? d.x : this.rig.focusX;
    const fy = d ? d.y : this.rig.focusY;
    const half = d ? 70 : Math.min(this.rig.span * 0.75 + 20, 450);
    this.sun.position.set(fx - 220, 400, fy - 300);
    this.sun.target.position.set(fx, 0, fy);
    const cam = this.sun.shadow.camera;
    if (cam.right !== half) {
      cam.left = -half;
      cam.right = half;
      cam.top = half;
      cam.bottom = -half;
      cam.near = 10;
      cam.far = 1000;
      cam.updateProjectionMatrix();
    }
    if (d) {
      this.fog.near = 60;
      this.fog.far = 220;
    } else {
      this.fog.near = 5000;
      this.fog.far = 6000;
    }
  }

  private soldierColors(id: number, squad: number): CharacterColors {
    let c = this.sColors[id];
    if (!c) {
      const h = hash(id * 131);
      c = {
        torso: new THREE.Color(PALETTE.squads[(squad - 1) % PALETTE.squads.length]).lerp(new THREE.Color(PALETTE.fatigues), 0.35),
        arms: new THREE.Color(PALETTE.fatigues),
        legs: new THREE.Color(PALETTE.fatigues).multiplyScalar(0.8),
        skin: new THREE.Color(PALETTE.skinTones[h % PALETTE.skinTones.length]),
        weapon: new THREE.Color(PALETTE.weapon),
      };
      this.sColors[id] = c;
    }
    return c;
  }

  private zombieColors(slot: number): CharacterColors {
    let c = this.zColors[slot];
    if (!c) {
      const h = hash(slot * 977 + 13);
      const shirt = new THREE.Color(PALETTE.zombieClothes[h % PALETTE.zombieClothes.length]);
      c = {
        torso: shirt,
        arms: (h >> 5) % 3 === 0 ? shirt : new THREE.Color(PALETTE.zombieSkin[(h >> 9) % PALETTE.zombieSkin.length]),
        legs: new THREE.Color(PALETTE.zombieClothes[(h >> 3) % PALETTE.zombieClothes.length]).multiplyScalar(0.7),
        skin: new THREE.Color(PALETTE.zombieSkin[(h >> 7) % PALETTE.zombieSkin.length]),
      };
      this.zColors[slot] = c;
    }
    return c;
  }

  private zombieScale(slot: number): number {
    const z = this.curr?.zombies;
    let kind = 0;
    if (z) {
      for (let i = 0; i < z.length; i += ZOMBIE_STRIDE) {
        if (z[i + ZombieField.Slot] === slot) {
          kind = Math.floor(z[i + ZombieField.KindState] / 16);
          break;
        }
      }
    }
    return kindScale(kind);
  }

  private drawSoldiers(f: Frame, a: number, dt: number, t: number): void {
    const s = f.soldiers;
    const n = Math.min(MAX_SOLDIERS, s.length / SOLDIER_STRIDE);
    const boost = this.unitScale();
    const p = this.pose;
    let rings = 0;
    this.soldiers.begin();
    for (let i = 0; i < n; i++) {
      const o = i * SOLDIER_STRIDE;
      const cond = s[o + SoldierField.Condition];
      if (cond === SoldierCondition.Turned) continue;
      const id = s[o + SoldierField.Id];
      const squad = s[o + SoldierField.Squad];
      const act = s[o + SoldierField.Activity];
      const [x, y] = this.soldierPos(i, a);
      const fx = s[o + SoldierField.FacingX];
      const fy = s[o + SoldierField.FacingY];
      const sid = id % MAX_SOLDIER_ID;
      if (!this.sSeen[sid]) {
        this.sSeen[sid] = 1;
        this.sDrawX[sid] = x;
        this.sDrawY[sid] = y;
      }
      const moved = Math.hypot(x - this.sDrawX[sid], y - this.sDrawY[sid]);
      this.sDrawX[sid] = x;
      this.sDrawY[sid] = y;
      const speed = dt > 0 ? moved / dt : 0;
      this.sSpeed[sid] += (speed - this.sSpeed[sid]) * Math.min(1, dt * 8);
      this.sPhase[sid] += (moved / STRIDE_M) * Math.PI * 2;
      this.sRecoil[sid] = Math.max(0, this.sRecoil[sid] - dt * 10);

      const amount = Math.min(1, this.sSpeed[sid] / 2.5);
      Object.assign(p, IDLE_POSE);
      if (cond === SoldierCondition.Dead) {
        p.lie = 1;
        p.armL = 0.4;
        p.armR = 2.2;
      } else {
        const aiming = act === SoldierActivity.Engaging || act === SoldierActivity.Direct;
        if (aiming) {
          p.armR = Math.PI / 2 - this.sRecoil[sid] * 0.25;
          p.armL = 1.25 - this.sRecoil[sid] * 0.15;
          p.lean = 0.08;
        } else if (act === SoldierActivity.Reloading) {
          p.armR = 0.9;
          p.armL = 0.9 + Math.sin(t * 9) * 0.35;
          p.lean = 0.12;
        } else {
          // Low ready: weapon carried across the chest.
          p.armR = 0.55;
          p.armL = 0.75;
        }
        const w = walkPose(this.sPhase[sid], amount, p);
        if (aiming) {
          w.armL = p.armL;
          w.armR = p.armR;
        }
        if (cond === SoldierCondition.Bitten) w.lean += 0.15 + Math.sin(t * 3 + id) * 0.05;
        Object.assign(p, w);
        if (amount < 0.05) p.bob = Math.sin(t * 1.7 + id) * 0.008; // breathing
      }
      const colors = this.soldierColors(sid, squad);
      if (cond === SoldierCondition.Bitten) colors.skin.setHex(PALETTE.soldierBitten);
      this.soldiers.add(x, y, Math.atan2(-fx, -fy), boost, p, colors);

      const isDirect = f.directSoldier === id;
      if ((this.selectedSquads.has(squad) || isDirect) && cond !== SoldierCondition.Dead) {
        this.tmpS.set(boost, 1, boost);
        this.tmpQ.identity();
        this.tmpP.set(x, 0.05, y);
        this.tmpM.compose(this.tmpP, this.tmpQ, this.tmpS);
        this.ringMesh.setMatrixAt(rings, this.tmpM);
        this.ringMesh.setColorAt(rings, this.tmpC.set(isDirect ? PALETTE.directRing : PALETTE.selection));
        rings++;
      }
    }
    this.soldiers.end();
    this.ringMesh.count = rings;
    this.ringMesh.instanceMatrix.needsUpdate = true;
    if (this.ringMesh.instanceColor) this.ringMesh.instanceColor.needsUpdate = true;
  }

  private drawZombies(f: Frame, a: number, dt: number, t: number): void {
    const z = f.zombies;
    const n = z.length / ZOMBIE_STRIDE;
    const boost = this.unitScale();
    const p = this.pose;
    const turn = Math.min(1, dt * 6);
    this.zombies.begin();
    for (let i = 0; i < n; i++) {
      const o = i * ZOMBIE_STRIDE;
      const slot = z[o + ZombieField.Slot];
      const x = this.zPrevX[slot] + (z[o + ZombieField.X] - this.zPrevX[slot]) * a;
      const y = this.zPrevY[slot] + (z[o + ZombieField.Y] - this.zPrevY[slot]) * a;
      const vx = z[o + ZombieField.HeadingX];
      const vy = z[o + ZombieField.HeadingY];
      const ks = z[o + ZombieField.KindState];
      const kind = Math.floor(ks / 16);
      const state = ks % 16;
      if (this.zFresh[slot]) {
        this.zFresh[slot] = 0;
        this.zDrawX[slot] = x;
        this.zDrawY[slot] = y;
        this.zSpeed[slot] = 0;
        this.zPhase[slot] = slot;
        this.zYaw[slot] = vx !== 0 || vy !== 0 ? Math.atan2(-vx, -vy) : slot;
      }
      const moved = Math.hypot(x - this.zDrawX[slot], y - this.zDrawY[slot]);
      this.zDrawX[slot] = x;
      this.zDrawY[slot] = y;
      const speed = dt > 0 ? moved / dt : 0;
      this.zSpeed[slot] += (speed - this.zSpeed[slot]) * Math.min(1, dt * 6);
      this.zPhase[slot] += (moved / STRIDE_M) * Math.PI * 2;
      if (vx !== 0 || vy !== 0) {
        const target = Math.atan2(-vx, -vy);
        let d = target - this.zYaw[slot];
        d = Math.atan2(Math.sin(d), Math.cos(d));
        this.zYaw[slot] += d * turn;
      }

      const amount = Math.min(1, this.zSpeed[slot] / 2);
      Object.assign(p, IDLE_POSE);
      const shamble = Math.sin(t * 2.3 + slot * 0.7);
      if (state === ZombieState.Attacking) {
        const swing = Math.sin(t * 9 + slot);
        p.armL = 1.3 + swing * 0.6;
        p.armR = 1.3 - swing * 0.6;
        p.lean = 0.35 + Math.max(0, swing) * 0.15;
      } else if (state === ZombieState.Chasing || state === ZombieState.Stacked || state === ZombieState.Clinging) {
        p.armL = 1.35 + shamble * 0.12;
        p.armR = 1.25 - shamble * 0.12;
        p.lean = 0.25;
      } else {
        p.armL = 0.25 + shamble * 0.1;
        p.armR = 0.45 - shamble * 0.1;
        p.lean = 0.12 + shamble * 0.04;
      }
      const w = walkPose(this.zPhase[slot], amount, p);
      // Keep the reaching arms mostly steady: zombies do not swing them like soldiers.
      w.armL = p.armL + (w.armL - p.armL) * 0.3;
      w.armR = p.armR + (w.armR - p.armR) * 0.3;
      // A limp: one leg drags.
      w.legSwing *= 0.75 + ((slot & 1) === 0 ? 0.25 : 0);
      const cell = Math.floor(y / this.map.cellSize) * this.map.width + Math.floor(x / this.map.cellSize);
      const climb = this.structures.heightAt[cell] ?? 0;
      if (state === ZombieState.Stacked) w.lean = 0.5; // pressed against the wall, clawing upward
      this.zombies.add(x, y, this.zYaw[slot] + shamble * 0.08, boost * kindScale(kind), w, this.zombieColors(slot), climb);
    }
    this.zombies.end();
  }

  private drawCorpses(nowMs: number): void {
    const boost = this.unitScale();
    let falling = false;
    for (const c of this.corpses) if (nowMs - c.born < CORPSE_FALL_S * 1000) falling = true;
    if (!this.corpsesDirty && !falling && Math.abs(boost - this.corpseScale) < 0.05) return;
    this.corpsesDirty = false;
    this.corpseScale = boost;
    const p = this.pose;
    this.corpseBatch.begin();
    for (const c of this.corpses) {
      const k = Math.min(1, (nowMs - c.born) / (CORPSE_FALL_S * 1000));
      Object.assign(p, IDLE_POSE);
      p.lie = k * k;
      p.armL = 2.6 * k;
      p.armR = 2.2 * k;
      p.legSwing = 0.2 * k;
      this.corpseBatch.add(c.x, c.y, c.yaw, boost * c.scale, p, c.colors);
    }
    this.corpseBatch.end();
  }

  /** Squad markers that grow with the strategic blend so units stay readable on the map. */
  private drawMarkers(f: Frame): void {
    const blend = this.rig.direct ? 0 : this.rig.strategicBlend;
    let k = 0;
    if (blend > 0.05) {
      const r = (this.rig.span / 60) * blend;
      for (const q of f.squads) {
        if (q.alive === 0 || k >= 64) continue;
        this.tmpS.set(r, 1, r);
        this.tmpQ.identity();
        this.tmpP.set(q.anchorX, 30, q.anchorY);
        this.tmpM.compose(this.tmpP, this.tmpQ, this.tmpS);
        this.markerMesh.setMatrixAt(k, this.tmpM);
        const col = PALETTE.squads[(q.id - 1) % PALETTE.squads.length];
        this.markerMesh.setColorAt(k, this.tmpC.set(this.selectedSquads.has(q.id) ? PALETTE.selection : col));
        k++;
      }
    }
    this.markerMesh.count = k;
    this.markerMesh.instanceMatrix.needsUpdate = true;
    if (this.markerMesh.instanceColor) this.markerMesh.instanceColor.needsUpdate = true;
  }

  /** Dashed preview of the remaining route of each selected squad. */
  private drawPaths(f: Frame): void {
    const pos = this.pathGeo.attributes.position as THREE.BufferAttribute;
    const dash = Math.max(1.5, this.rig.span / 80);
    let v = 0;
    for (const q of f.squads) {
      if (!this.selectedSquads.has(q.id) || q.alive === 0 || q.path.length < 2) continue;
      let px = q.anchorX;
      let py = q.anchorY;
      for (let i = 0; i < q.path.length; i += 2) {
        const nx = q.path[i];
        const ny = q.path[i + 1];
        const len = Math.hypot(nx - px, ny - py);
        for (let d = 0; d < len && v + 2 <= PATH_VERTS; d += dash * 2) {
          const e = Math.min(len, d + dash);
          pos.setXYZ(v++, px + ((nx - px) * d) / len, 0.15, py + ((ny - py) * d) / len);
          pos.setXYZ(v++, px + ((nx - px) * e) / len, 0.15, py + ((ny - py) * e) / len);
        }
        px = nx;
        py = ny;
      }
    }
    pos.needsUpdate = true;
    this.pathGeo.setDrawRange(0, v);
  }

  private drawTracers(dtS: number): void {
    const pos = this.tracerGeo.attributes.position as THREE.BufferAttribute;
    const h = this.unitScale();
    let n = 0;
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.age += dtS;
      if (t.age > TRACER_LIFE_S) {
        this.tracers.splice(i, 1);
        continue;
      }
      pos.setXYZ(n * 2, t.x0, 1.3 * h, t.y0);
      pos.setXYZ(n * 2 + 1, t.x1, 1.0, t.y1);
      n++;
    }
    pos.needsUpdate = true;
    this.tracerGeo.setDrawRange(0, n * 2);
  }

  /** Units are drawn larger when zoomed out so they remain visible at low resolution. */
  private unitScale(): number {
    if (this.rig.direct) return 1;
    return Math.max(1, this.rig.span / 60);
  }

  // ----- Picking (CSS pixel coordinates) -----

  private readonly raycaster = new THREE.Raycaster();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  screenToGround(cssX: number, cssY: number, cssW: number, cssH: number): { x: number; y: number } | null {
    const ndc = new THREE.Vector2((cssX / cssW) * 2 - 1, -(cssY / cssH) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.rig.active);
    const hit = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.plane, hit) ? { x: hit.x, y: hit.z } : null;
  }

  worldToScreen(x: number, y: number, cssW: number, cssH: number, height = 1): { x: number; y: number } {
    const v = new THREE.Vector3(x, height, y).project(this.rig.active);
    return { x: ((v.x + 1) / 2) * cssW, y: ((1 - v.y) / 2) * cssH };
  }

  /** Squad of the living soldier nearest to a screen point within `radiusPx`, or null. */
  pickSquad(cssX: number, cssY: number, cssW: number, cssH: number, radiusPx = 14): number | null {
    const f = this.curr;
    if (!f) return null;
    let best: number | null = null;
    let bd = radiusPx * radiusPx;
    for (let i = 0; i < f.soldiers.length / SOLDIER_STRIDE; i++) {
      const o = i * SOLDIER_STRIDE;
      const c = f.soldiers[o + SoldierField.Condition];
      if (c !== SoldierCondition.Ok && c !== SoldierCondition.Bitten) continue;
      const p = this.worldToScreen(f.soldiers[o + SoldierField.X], f.soldiers[o + SoldierField.Y], cssW, cssH);
      const d = (p.x - cssX) ** 2 + (p.y - cssY) ** 2;
      if (d < bd) {
        bd = d;
        best = f.soldiers[o + SoldierField.Squad];
      }
    }
    if (best === null && this.rig.strategicBlend > 0.05) {
      for (const q of f.squads) {
        if (q.alive === 0) continue;
        const p = this.worldToScreen(q.anchorX, q.anchorY, cssW, cssH, 30);
        const d = (p.x - cssX) ** 2 + (p.y - cssY) ** 2;
        if (d < bd * 4) {
          bd = d / 4;
          best = q.id;
        }
      }
    }
    return best;
  }

  /** Vehicle nearest to a screen point within `radiusPx`, or null. */
  pickVehicle(cssX: number, cssY: number, cssW: number, cssH: number, radiusPx = 22): number | null {
    let best: number | null = null;
    let bd = radiusPx * radiusPx;
    for (const v of this.vehicles.list) {
      if (v.state === 'destroyed') continue;
      const p = this.worldToScreen(v.x, v.y, cssW, cssH, 1.5);
      const d = (p.x - cssX) ** 2 + (p.y - cssY) ** 2;
      if (d < bd) {
        bd = d;
        best = v.id;
      }
    }
    return best;
  }

  /** Squads with any living soldier inside a screen rectangle. */
  pickSquadsInRect(x0: number, y0: number, x1: number, y1: number, cssW: number, cssH: number): number[] {
    const f = this.curr;
    if (!f) return [];
    const out = new Set<number>();
    const [ax, bx] = x0 < x1 ? [x0, x1] : [x1, x0];
    const [ay, by] = y0 < y1 ? [y0, y1] : [y1, y0];
    for (let i = 0; i < f.soldiers.length / SOLDIER_STRIDE; i++) {
      const o = i * SOLDIER_STRIDE;
      const c = f.soldiers[o + SoldierField.Condition];
      if (c !== SoldierCondition.Ok && c !== SoldierCondition.Bitten) continue;
      const p = this.worldToScreen(f.soldiers[o + SoldierField.X], f.soldiers[o + SoldierField.Y], cssW, cssH);
      if (p.x >= ax && p.x <= bx && p.y >= ay && p.y <= by) out.add(f.soldiers[o + SoldierField.Squad]);
    }
    return [...out];
  }

  get latest(): Frame | null {
    return this.curr;
  }
}

function kindScale(kind: number): number {
  return kind === 2 ? 1.3 : kind === 1 ? 0.95 : 1;
}
