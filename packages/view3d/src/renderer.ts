import * as THREE from 'three';
import {
  SOLDIER_STRIDE,
  SoldierActivity,
  SoldierCondition,
  SoldierField,
  ZOMBIE_POOL_CAPACITY,
  ZOMBIE_STRIDE,
  ZombieField,
  ZombieKind,
  ZombieState,
  clockHours,
  siteZone,
  type DayClock,
  daylight,
  type Frame,
  type MapInfo,
} from '@vazante/shared';
import { CameraRig } from './camera.ts';
import { Crowd, clipRow, loadBakedModel } from './crowd.ts';
import { CharacterBatch, IDLE_POSE, walkPose, type CharacterColors, type Pose } from './characters.ts';
import { buildCity, buildDistrictOverlay, hash } from './city.ts';
import { LightPools } from './lights.ts';
import { FireAndSmoke } from './smoke.ts';
import { buildProps } from './props.ts';
import { DecalLayer, OrderMarkers, Particles, Pulses, SiteZones, ZoneMarker } from './fx.ts';
import { cityUniforms, toon } from './materials.ts';
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
/** Characters this far outside the view are skipped (covers their size and a short shadow). */
const CULL_RADIUS_M = 6;
const STRIDE_M = 1.6;
/** Skinned models drawn at most (the nearest to the camera); the rest use the cheap block figures. */
const MAX_SKINNED_ZOMBIES = 320;
const MAX_SKINNED_CORPSES = 240;
/** Metres covered by one loop of each walk or run clip, so feet don't slide. */
const SOLDIER_WALK_M = 1.5;
const SOLDIER_RUN_M = 2.6;
const ZOMBIE_WALK_M = 1.2;
const ZOMBIE_RUN_M = 2.2;

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
const WHITE = new THREE.Color(1, 1, 1);

export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly rig: CameraRig;
  readonly map: MapInfo;
  private readonly post = new PixelPost();
  private readonly sun: THREE.DirectionalLight;
  private readonly hemi: THREE.HemisphereLight;
  private readonly lights: LightPools;
  /** Current hour (0..24) and darkness (0 day .. 1 night), for the HUD and audio. */
  hours = 16;
  night = 0;
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
  private readonly fire = new FireAndSmoke();
  private readonly orders = new OrderMarkers(PALETTE.orderMarker);
  private readonly zone = new ZoneMarker(PALETTE.zone);
  private readonly siteZones = new SiteZones();
  /** Strategic points replace districts as the goal: the district wash stays hidden. */
  private economy = false;
  private readonly pulses = new Pulses(PALETTE.scream);
  /** Until when (seconds) each zombie slot holds the scream pose. */
  private readonly zScream = new Float32Array(ZOMBIE_POOL_CAPACITY);
  readonly structures: StructureLayer;
  readonly vehicles = new VehicleLayer();
  private readonly corpses: Corpse[] = [];
  private soldierCrowd: Crowd | null = null;
  private zombieCrowd: Crowd | null = null;
  private corpseCrowd: Crowd | null = null;
  private readonly zDist = new Float32Array(ZOMBIE_POOL_CAPACITY);
  private readonly zHist = new Uint32Array(256);
  private readonly sDeadAt = new Float32Array(MAX_SOLDIER_ID).fill(-1);
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
  private readonly zColorKind = new Uint8Array(ZOMBIE_POOL_CAPACITY);
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

    this.hemi = new THREE.HemisphereLight(PALETTE.skyLight, PALETTE.groundLight, 1.6);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(PALETTE.sun, 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.3;
    this.scene.add(this.sun, this.sun.target);

    const city = buildCity(map);
    this.scene.add(city);
    // Every street lamp, the site floodlights, then room for beams, fires and flashes.
    this.lights = new LightPools((city.userData.lamps as unknown[]).length + 32 * map.sites.length + 1024);
    for (const [x, y] of city.userData.lamps as [number, number][]) this.lights.addStatic(x, y, 8, PALETTE.lampLight, 0.3);
    for (const site of map.sites) {
      const cs = map.cellSize;
      const x0 = site.x0 * cs;
      const y0 = site.y0 * cs;
      const x1 = (site.x1 + 1) * cs;
      const y1 = (site.y1 + 1) * cs;
      for (const [x, y] of [
        [x0, y0],
        [x1, y0],
        [x0, y1],
        [x1, y1],
      ])
        this.lights.addStatic(x + (x < (x0 + x1) / 2 ? 8 : -8), y + (y < (y0 + y1) / 2 ? 8 : -8), 20, PALETTE.floodLight, 0.28);
    }
    this.scene.add(this.lights.mesh, this.fire.group);
    this.addAmbientFires(map);
    this.structures = new StructureLayer(map.cellSize, map.width, map.height);
    this.scene.add(this.structures.group, this.vehicles.group);
    this.districts = buildDistrictOverlay(map);
    this.scene.add(this.districts, this.siteZones.group, this.zone.group, this.pulses.group);

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
    this.rig.pixelsHigh = h;
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
    const zone = f.mission?.zones.find((x) => x.active);
    const cs = this.map.cellSize;
    this.zone.set(zone ? { x0: zone.x0 * cs, y0: zone.y0 * cs, x1: (zone.x1 + 1) * cs, y1: (zone.y1 + 1) * cs } : null);
    this.economy = !!f.economy;
    this.siteZones.set(
      f.economy
        ? f.bases.map((b) => ({ id: b.id, ...siteZone(b, cs), color: b.held ? PALETTE.siteHeld : b.control > 0 ? PALETTE.siteContested : PALETTE.siteLost }))
        : null,
    );
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
        const kind = e.value ?? 0;
        this.addCorpse(e.x, e.y!, this.zYaw[slot] + Math.PI, kindScale(kind), this.zombieColors(slot, kind), nowMs);
        return;
      }
      case 'zombie_burst':
        if (e.x === undefined) return;
        this.particles.emit(e.x, e.y!, 1.0, 36, { speed: 6, up: 4, life: 0.9, size: 0.3, color: PALETTE.bile, gravity: 9 });
        this.particles.emit(e.x, e.y!, 1.0, 14, { speed: 4, up: 3, life: 0.7, size: 0.22, color: PALETTE.bloodFresh, gravity: 9 });
        this.fire.explode(e.x, e.y!, 0.6);
        this.flashes.push({ x: e.x, y: e.y!, t: 0.25, life: 0.25 });
        this.blood.add(e.x, e.y!, 3.2, Math.random() * Math.PI, 1.2);
        this.shakeAt(e.x, e.y!, 0.35);
        return;
      case 'zombie_scream':
        if (e.x === undefined) return;
        this.pulses.add(e.x, e.y!, 18);
        if (e.source !== undefined) this.zScream[e.source] = nowMs / 1000 + 1.4;
        return;
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
        this.particles.emit(e.x, e.y!, 1.5, 40, { speed: 6, up: 6, life: 1.0, size: 0.35, color: PALETTE.wreck, gravity: 9 });
        this.fire.explode(e.x, e.y!, 1.2);
        // Short enough to be out before engineers can have it running again (WRECK.repairS).
        this.fire.addFire(e.x, e.y!, 1, 35);
        this.flashes.push({ x: e.x, y: e.y!, t: 0.6, life: 0.6 });
        this.shakeAt(e.x, e.y!, 0.8);
        this.blood.add(e.x, e.y!, 6, Math.random() * Math.PI, 1.3);
        return;
      case 'vehicle_repaired':
        if (e.x === undefined) return;
        this.particles.emit(e.x, e.y!, 1.2, 14, { speed: 3, up: 4, life: 0.6, size: 0.15, color: PALETTE.spark, gravity: 8 });
        this.particles.emit(e.x, e.y!, 0.8, 16, { speed: 2, up: 2, life: 1.2, size: 0.45, color: PALETTE.dust });
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

  /**
   * Swap the block figures for the animated CC0 models (see docs/assets.md). The game runs fine
   * without them: if loading fails it keeps the block figures.
   */
  async loadModels(baseUrl: string): Promise<void> {
    const [soldier, infected, props] = await Promise.all([
      loadBakedModel(`${baseUrl}soldier.glb`, {
        height: 1.8,
        clips: ['Idle', 'Walk', 'Run_Gun', 'Idle_Shoot', 'Walk_Shoot', 'Run_Shoot', 'Death'],
        once: ['Death'],
        colors: { Pants: PALETTE.fatigues, Skin: 0xc8916b, Grey: 0x4a4f44 },
        tint: { Character_Main: 0.45 },
      }),
      loadBakedModel(`${baseUrl}infected.glb`, {
        height: 1.75,
        clips: ['Idle', 'Walk', 'Run', 'Punch', 'Death'],
        once: ['Death'],
        reach: ['Idle', 'Walk', 'Run'],
        colors: { Skin: PALETTE.zombieSkin[0], 'Character_Enemy_Head/Enemy_Red': 0x2b2119, Grey: 0x45464c },
        tint: { Enemy_Red: 1 },
      }),
      buildProps(this.map, baseUrl),
    ]);
    this.scene.add(props);
    this.soldierCrowd = new Crowd(soldier, MAX_SOLDIERS);
    this.zombieCrowd = new Crowd(infected, MAX_SKINNED_ZOMBIES);
    this.corpseCrowd = new Crowd(infected, MAX_SKINNED_CORPSES);
    this.corpseCrowd.mesh.castShadow = false;
    this.scene.add(this.soldierCrowd.mesh, this.zombieCrowd.mesh, this.corpseCrowd.mesh);
    this.corpsesDirty = true;
  }

  /**
   * Compile every shader up front, including layers that start hidden or empty (blood, corpses,
   * flashes, ghosts). Otherwise each compiles on first use and the frame where combat starts stalls.
   */
  warmUp(): void {
    // compile() alone misses the shadow-map depth programs and skips empty instanced batches, so
    // draw one real frame, shadow pass and post included, with everything visible and non-empty.
    const hidden: THREE.Object3D[] = [];
    const empty: (THREE.InstancedMesh | THREE.InstancedBufferGeometry)[] = [];
    this.scene.traverse((o) => {
      if (!o.visible) {
        hidden.push(o);
        o.visible = true;
      }
      if (o instanceof THREE.InstancedMesh) {
        // setColorAt creates the colour buffer on first use, which switches the mesh to another
        // shader variant mid-game (that was the 124 ms stall). Allocate it now; white is neutral.
        if (!o.instanceColor) for (let i = 0; i < o.instanceMatrix.count; i++) o.setColorAt(i, WHITE);
        if (o.count === 0) {
          empty.push(o);
          o.count = 1;
        }
      }
      const g = (o as THREE.Mesh).geometry;
      if (g instanceof THREE.InstancedBufferGeometry && g.instanceCount === 0) {
        empty.push(g);
        g.instanceCount = 1;
      }
    });
    this.renderer.compile(this.scene, this.rig.active);
    this.renderer.shadowMap.needsUpdate = true;
    this.post.render(this.renderer, this.scene, this.rig.active);
    for (const o of hidden) o.visible = false;
    for (const e of empty) {
      if (e instanceof THREE.InstancedMesh) e.count = 0;
      else e.instanceCount = 0;
    }
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
    this.fire.smokeShade = 1 - 0.6 * this.night;
    this.fire.update(dtS);
    this.orders.update(dtS, this.unitScale());
    this.zone.update(t);
    this.pulses.update(dtS);
    this.updateTimeOfDay(f ? f.tick + this.alpha(nowMs) : 0, f?.day);
    this.lights.beginDynamic();
    if (f) this.drawFlashlights(f, this.alpha(nowMs));
    this.drawFireLights(t, dtS);
    this.lights.end(this.night);
    this.updateLighting();
    this.districts.visible = !this.economy && this.rig.band !== 'tactical' && !this.rig.direct;
    this.post.render(this.renderer, this.scene, this.rig.active);
  }

  private readonly cDay = new THREE.Color();
  private readonly cNight = new THREE.Color();

  /** Sun or moon, sky, fog and ambient follow the game clock. */
  private updateTimeOfDay(tick: number, clock?: DayClock): void {
    const h = clockHours(tick, clock);
    const day = daylight(h);
    this.hours = h;
    this.night = 1 - day;
    const bg = this.scene.background as THREE.Color;
    bg.copy(this.cDay.set(PALETTE.sky)).lerp(this.cNight.set(PALETTE.skyNight), this.night);
    this.fog.color.copy(this.cDay.set(PALETTE.fog)).lerp(this.cNight.set(PALETTE.fogNight), this.night);
    this.hemi.color.copy(this.cDay.set(PALETTE.skyLight)).lerp(this.cNight.set(PALETTE.skyLightNight), this.night);
    this.hemi.groundColor.copy(this.cDay.set(PALETTE.groundLight)).lerp(this.cNight.set(PALETTE.groundLightNight), this.night);
    this.hemi.intensity = 1.9 - 0.3 * day;
    cityUniforms.uNight.value = Math.max(0, (this.night - 0.3) / 0.7);
    // Low warm sun around dawn and dusk, cold moonlight at night.
    const low = Math.min(1, Math.abs(h - 12) / 6);
    this.sun.color.copy(this.cDay.set(PALETTE.sun)).lerp(this.cNight.set(PALETTE.sunDusk), Math.max(0, low - 0.5) * 2 * day);
    this.sun.color.lerp(this.cNight.set(PALETTE.moon), this.night);
    this.sun.intensity = 1.5 + 0.7 * day;
    this.sunHeight = day > 0.5 ? Math.max(0.25, 1 - low * 0.75) : 0.9;
  }

  private sunHeight = 1;

  /** Soldiers carry weapon lights at night. */
  private drawFlashlights(f: Frame, a: number): void {
    if (this.night < 0.05) return;
    const s = f.soldiers;
    const n = Math.min(MAX_SOLDIERS, s.length / SOLDIER_STRIDE);
    for (let i = 0; i < n; i++) {
      const o = i * SOLDIER_STRIDE;
      if (s[o + SoldierField.Condition] > SoldierCondition.Bitten) continue;
      const [x, y] = this.soldierPos(i, a);
      const fx = s[o + SoldierField.FacingX];
      const fy = s[o + SoldierField.FacingY];
      this.lights.addBeam(x + fx * 0.6, y + fy * 0.6, fx, fy, 16, 5, PALETTE.flashlight, 0.32);
      this.lights.addPool(x, y, 2.5, PALETTE.flashlight, 0.15);
    }
    for (const v of f.vehicles) {
      if (v.state === 'destroyed') continue;
      const p = this.vehicles.position(v.id, a);
      if (p) this.lights.addBeam(p.x + v.hx * 3, p.y + v.hy * 3, v.hx, v.hy, 24, 8, PALETTE.flashlight, 0.4);
    }
  }

  private readonly flashes: { x: number; y: number; t: number; life: number }[] = [];

  /** Fires glow and explosions flash at night (in daylight the sprites carry them). */
  private drawFireLights(t: number, dtS: number): void {
    for (const fs of this.fire.fires) this.lights.addPool(fs.x, fs.y, 7 + 5 * fs.strength, PALETTE.fireLight, 0.35 * FireAndSmoke.flicker(fs, t) * Math.min(1, fs.ttl / 10));
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const fl = this.flashes[i];
      fl.t -= dtS;
      if (fl.t <= 0) {
        this.flashes.splice(i, 1);
        continue;
      }
      this.lights.addPool(fl.x, fl.y, 18, PALETTE.fireLight, (fl.t / fl.life) * 1.2);
    }
  }

  /** Shake scaled by how close the event is to what the camera is looking at. */
  private shakeAt(x: number, y: number, amount: number): void {
    const d = this.rig.direct;
    const fx = d ? d.x : this.rig.focusX;
    const fy = d ? d.y : this.rig.focusY;
    const reach = d ? 60 : Math.max(60, this.rig.span);
    const k = 1 - Math.min(1, Math.hypot(x - fx, y - fy) / reach);
    if (k > 0) this.rig.shake(amount * k);
  }

  /** A few buildings burn forever: the city fell recently. Placed by hash, away from bases. */
  private addAmbientFires(map: MapInfo): void {
    const cs = map.cellSize;
    let placed = 0;
    for (const b of map.buildings) {
      if (placed >= 9) break;
      if (hash(b.id * 2654435761 + map.seed) % 23 !== 0) continue;
      const x = ((b.x0 + b.x1 + 1) / 2) * cs;
      const y = ((b.y0 + b.y1 + 1) / 2) * cs;
      const nearSite = map.sites.some((s) => x > (s.x0 - 8) * cs && x < (s.x1 + 9) * cs && y > (s.y0 - 8) * cs && y < (s.y1 + 9) * cs);
      if (nearSite) continue;
      this.fire.addFire(x, y, 1.6, Infinity, b.height);
      placed++;
    }
  }

  /** Shadow frustum follows what the camera looks at; fog only in the third-person view. */
  private updateLighting(): void {
    const d = this.rig.direct;
    const fx = d ? d.x : this.rig.focusX;
    const fy = d ? d.y : this.rig.focusY;
    const half = d ? 70 : Math.min(this.rig.span * 0.95 + 20, 520);
    this.sun.position.set(fx - 220, 400 * this.sunHeight, fy - 300);
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

  /** Colours per slot, rebuilt when the slot is reused by another kind. */
  private zombieColors(slot: number, kind: number): CharacterColors {
    let c = this.zColors[slot];
    if (!c || this.zColorKind[slot] !== kind) {
      const h = hash(slot * 977 + 13);
      const shirt = new THREE.Color(PALETTE.zombieClothes[h % PALETTE.zombieClothes.length]);
      c = {
        torso: shirt,
        arms: (h >> 5) % 3 === 0 ? shirt : new THREE.Color(PALETTE.zombieSkin[(h >> 9) % PALETTE.zombieSkin.length]),
        legs: new THREE.Color(PALETTE.zombieClothes[(h >> 3) % PALETTE.zombieClothes.length]).multiplyScalar(0.7),
        skin: new THREE.Color(PALETTE.zombieSkin[(h >> 7) % PALETTE.zombieSkin.length]),
      };
      if (kind === ZombieKind.Bloater) {
        // Swollen and bare: the skin is the whole silhouette.
        c.skin.setHex(PALETTE.bloaterSkin);
        c.torso = c.skin.clone();
        c.arms = c.skin.clone();
      } else if (kind === ZombieKind.Screamer) {
        c.skin.setHex(PALETTE.screamerSkin);
        c.arms = c.skin.clone();
        c.torso.multiplyScalar(0.45);
      }
      this.zColors[slot] = c;
      this.zColorKind[slot] = kind;
    }
    return c;
  }

  private drawSoldiers(f: Frame, a: number, dt: number, t: number): void {
    const s = f.soldiers;
    const n = Math.min(MAX_SOLDIERS, s.length / SOLDIER_STRIDE);
    const boost = this.unitScale();
    const p = this.pose;
    let rings = 0;
    this.soldiers.begin();
    this.soldierCrowd?.begin();
    for (let i = 0; i < n; i++) {
      const o = i * SOLDIER_STRIDE;
      const cond = s[o + SoldierField.Condition];
      if (cond === SoldierCondition.Turned) continue;
      const id = s[o + SoldierField.Id];
      const squad = s[o + SoldierField.Squad];
      const act = s[o + SoldierField.Activity];
      const [x, y] = this.soldierPos(i, a);
      // The controlled soldier faces where the mouse points now, not where the last frame said.
      const local = f.directSoldier === id ? this.rig.direct : null;
      const fx = local ? Math.cos(local.yaw) : s[o + SoldierField.FacingX];
      const fy = local ? Math.sin(local.yaw) : s[o + SoldierField.FacingY];
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
      if (cond !== SoldierCondition.Dead) this.sDeadAt[sid] = -1;
      else if (this.sDeadAt[sid] < 0) this.sDeadAt[sid] = t;
      const crowd = this.soldierCrowd;
      if (crowd) {
        const dist = (this.sPhase[sid] * STRIDE_M) / (Math.PI * 2);
        const aiming = act === SoldierActivity.Engaging || act === SoldierActivity.Direct;
        const run = this.sSpeed[sid] > 2.6;
        const moving = amount > 0.08;
        let row: number;
        if (cond === SoldierCondition.Dead) row = clipRow(crowd.clip('Death'), t - this.sDeadAt[sid]);
        else if (moving) {
          const c = crowd.clip(aiming ? (run ? 'Run_Shoot' : 'Walk_Shoot') : run ? 'Run_Gun' : 'Walk');
          row = clipRow(c, (dist / (run ? SOLDIER_RUN_M : SOLDIER_WALK_M)) * c.duration);
        } else row = clipRow(crowd.clip(aiming ? 'Idle_Shoot' : 'Idle'), t + id * 0.37);
        crowd.add(x, y, 0, Math.atan2(-fx, -fy), boost, row, colors.torso);
      } else this.soldiers.add(x, y, Math.atan2(-fx, -fy), boost, p, colors);

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
    this.soldierCrowd?.end();
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
    this.updateViewFrustum();
    const crowd = this.zombieCrowd;
    // Animated models for the nearest zombies, block figures for the rest.
    let cutoff = Infinity;
    if (crowd) {
      crowd.begin();
      cutoff = this.skinnedCutoff(z, n, crowd.capacity);
    }
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
      if (!this.inView(x, y)) {
        // Off screen: keep the position so the walk does not jump when it comes into view.
        this.zDrawX[slot] = x;
        this.zDrawY[slot] = y;
        continue;
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
      if (this.zScream[slot] > t) {
        // Gritador: arms thrown up, head back.
        p.armL = 2.7;
        p.armR = 2.6;
        p.lean = -0.25;
      } else if (state === ZombieState.Attacking) {
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
      const yaw = this.zYaw[slot] + shamble * 0.08;
      if (crowd && this.zDist[i] < cutoff) {
        let row: number;
        const sp = this.zSpeed[slot];
        if (state === ZombieState.Attacking || state === ZombieState.Stacked || state === ZombieState.Clinging) row = clipRow(crowd.clip('Punch'), t * (0.9 + (slot % 5) * 0.05) + slot * 0.13);
        else if (sp > 0.15) {
          const run = sp > 2.2;
          const c = crowd.clip(run ? 'Run' : 'Walk');
          row = clipRow(c, ((this.zPhase[slot] * STRIDE_M) / (Math.PI * 2) / (run ? ZOMBIE_RUN_M : ZOMBIE_WALK_M)) * c.duration);
        } else row = clipRow(crowd.clip('Idle'), t * 0.7 + slot * 0.29);
        if (crowd.add(x, y, climb, yaw, boost * kindScale(kind), row, this.zombieColors(slot, kind).torso)) continue;
      }
      this.zombies.add(x, y, yaw, boost * kindScale(kind), w, this.zombieColors(slot, kind), climb);
    }
    this.zombies.end();
    crowd?.end();
  }

  private readonly frustum = new THREE.Frustum();
  private readonly frustumMatrix = new THREE.Matrix4();
  private readonly cullSphere = new THREE.Sphere(new THREE.Vector3(), CULL_RADIUS_M);

  private updateViewFrustum(): void {
    const cam = this.rig.active;
    cam.updateMatrixWorld();
    this.frustumMatrix.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.frustumMatrix);
  }

  /** A character at (x, y) could show on screen (its shadow included, roughly). */
  private inView(x: number, y: number): boolean {
    this.cullSphere.center.set(x, 1, y);
    return this.frustum.intersectsSphere(this.cullSphere);
  }

  /** Distance from the camera focus under which at most `cap` zombies fall (fills zDist). */
  private skinnedCutoff(z: Float32Array, n: number, cap: number): number {
    const d = this.rig.direct;
    const fx = d ? d.x : this.rig.focusX;
    const fy = d ? d.y : this.rig.focusY;
    let max = 0;
    for (let i = 0; i < n; i++) {
      const o = i * ZOMBIE_STRIDE;
      const dist = Math.hypot(z[o + ZombieField.X] - fx, z[o + ZombieField.Y] - fy);
      this.zDist[i] = dist;
      if (dist > max) max = dist;
    }
    if (n <= cap) return Infinity;
    const h = this.zHist;
    h.fill(0);
    const k = (h.length - 1) / Math.max(1, max);
    for (let i = 0; i < n; i++) h[Math.floor(this.zDist[i] * k)]++;
    let sum = 0;
    for (let b = 0; b < h.length; b++) {
      if (sum + h[b] > cap) return b / k;
      sum += h[b];
    }
    return Infinity;
  }

  private drawCorpses(nowMs: number): void {
    const boost = this.unitScale();
    let falling = false;
    const fallMs = (this.corpseCrowd ? 1.2 : CORPSE_FALL_S) * 1000;
    for (const c of this.corpses) if (nowMs - c.born < fallMs) falling = true;
    if (!this.corpsesDirty && !falling && Math.abs(boost - this.corpseScale) < 0.05) return;
    this.corpsesDirty = false;
    this.corpseScale = boost;
    const p = this.pose;
    this.corpseBatch.begin();
    const crowd = this.corpseCrowd;
    let newest = 0;
    if (crowd) {
      crowd.begin();
      // The most recent deaths get the animated model; older ones stay as block figures.
      if (this.corpses.length > crowd.capacity) {
        const born = this.corpses.map((c) => c.born).sort((a, b) => b - a);
        newest = born[crowd.capacity - 1];
      }
      const death = crowd.clip('Death');
      for (const c of this.corpses) {
        if (c.born < newest) continue;
        crowd.add(c.x, c.y, 0, c.yaw + Math.PI, boost * c.scale, clipRow(death, (nowMs - c.born) / 1000), c.colors.torso);
      }
      crowd.end();
    }
    for (const c of this.corpses) {
      if (crowd && c.born >= newest) continue;
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
      // The rest of a route runs straight from point to point, each point marked with a cross.
      const pts = q.via.length > 0 ? q.path.concat(q.via) : q.path;
      for (let i = q.path.length; i < pts.length && v + 4 <= PATH_VERTS; i += 2) {
        const r = dash;
        pos.setXYZ(v++, pts[i] - r, 0.15, pts[i + 1] - r);
        pos.setXYZ(v++, pts[i] + r, 0.15, pts[i + 1] + r);
        pos.setXYZ(v++, pts[i] - r, 0.15, pts[i + 1] + r);
        pos.setXYZ(v++, pts[i] + r, 0.15, pts[i + 1] - r);
      }
      for (let i = 0; i < pts.length; i += 2) {
        const nx = pts[i];
        const ny = pts[i + 1];
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

  /** `front` is false for a point behind the camera (only possible in direct control's perspective view). */
  worldToScreen(x: number, y: number, cssW: number, cssH: number, height = 1): { x: number; y: number; front: boolean } {
    const v = new THREE.Vector3(x, height, y).project(this.rig.active);
    return { x: ((v.x + 1) / 2) * cssW, y: ((1 - v.y) / 2) * cssH, front: v.z < 1 };
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
  return kind === ZombieKind.Brute ? 1.3 : kind === ZombieKind.Bloater ? 1.22 : kind === ZombieKind.Runner ? 0.95 : kind === ZombieKind.Screamer ? 0.92 : 1;
}
