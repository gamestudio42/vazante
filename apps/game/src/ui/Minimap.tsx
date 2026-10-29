import { useEffect, useRef } from 'react';
import { FOG, type Frame, Ground, siteZone, SOLDIER_STRIDE, SoldierField, ZOMBIE_STRIDE, ZombieField } from '@vazante/shared';
import type { GameRenderer } from '@vazante/view3d';
import type { GameClient } from '../client.ts';
import { t } from '../i18n.ts';
import { objectiveTarget } from './objective.ts';

const SIZE = 192;
/** Metres across the minimap while controlling a soldier. */
const DIRECT_SPAN_M = 320;
/** How long a zombie that left sight stays on the minimap, faded. */
const GHOST_MS = 4000;
const GROUND_RGB: Record<number, [number, number, number]> = {
  [Ground.Street]: [52, 56, 60],
  [Ground.Sidewalk]: [70, 72, 72],
  [Ground.Lot]: [58, 62, 44],
  [Ground.Building]: [112, 104, 92],
  [Ground.Water]: [32, 58, 84],
  [Ground.Park]: [44, 78, 40],
};

/**
 * Overview of the whole city: terrain, districts, sites, the horde, squads, the truck and the
 * camera footprint. Click or drag to move the camera.
 */
export function Minimap({ client, view, direct = false }: { client: GameClient; view: GameRenderer; direct?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const map = view.map;
    const cs = map.cellSize;
    const worldW = map.width * cs;
    const worldH = map.height * cs;
    // Static terrain, drawn once at one pixel per cell.
    const terrain = document.createElement('canvas');
    terrain.width = map.width;
    terrain.height = map.height;
    const tctx = terrain.getContext('2d')!;
    const img = tctx.createImageData(map.width, map.height);
    for (let c = 0; c < map.width * map.height; c++) {
      const [r, g, b] = GROUND_RGB[map.ground[c]] ?? [40, 40, 40];
      img.data.set([r, g, b, 255], c * 4);
    }
    tctx.putImageData(img, 0, 0);

    const cv = canvas.current!;
    const ctx = cv.getContext('2d')!;
    const kAll = SIZE / Math.max(worldW, worldH);
    let raf = 0;
    let last = 0;
    // Zombies go through a pixel buffer: thousands of fillRect calls cost milliseconds per redraw.
    const dots = new ImageData(SIZE, SIZE);
    const dotPixels = new Uint32Array(dots.data.buffer);
    const dotLayer = document.createElement('canvas');
    dotLayer.width = dotLayer.height = SIZE;
    const dotCtx = dotLayer.getContext('2d')!;
    // #d84a3a as one RGBA pixel in the platform's byte order.
    const RED = new Uint32Array(new Uint8Array([0xd8, 0x4a, 0x3a, 0xff]).buffer)[0];
    const GHOST = new Uint32Array(new Uint8Array([0xd8, 0x4a, 0x3a, 0x70]).buffer)[0];
    /** Under fog: where each zombie was last seen (by slot), and when. */
    const seen = new Map<number, { x: number; y: number; t: number; frame: number }>();
    // Fog: a dark layer with the sight of soldiers, vehicles, structures and the base cut out.
    const fogLayer = document.createElement('canvas');
    fogLayer.width = fogLayer.height = SIZE;
    const fogCtx = fogLayer.getContext('2d')!;
    const drawFog = (f: Frame, X: (m: number) => number, Y: (m: number) => number, k: number) => {
      fogCtx.globalCompositeOperation = 'source-over';
      fogCtx.clearRect(0, 0, SIZE, SIZE);
      fogCtx.fillStyle = 'rgba(8,10,12,0.5)';
      fogCtx.fillRect(0, 0, SIZE, SIZE);
      fogCtx.globalCompositeOperation = 'destination-out';
      fogCtx.fillStyle = '#000';
      const disc = (x: number, y: number, r: number) => {
        fogCtx.beginPath();
        fogCtx.arc(X(x), Y(y), r * k, 0, Math.PI * 2);
        fogCtx.fill();
      };
      const ss = f.soldiers;
      for (let i = 0; i < ss.length; i += SOLDIER_STRIDE) {
        if (ss[i + SoldierField.Condition] > 1) continue;
        disc(ss[i + SoldierField.X], ss[i + SoldierField.Y], ss[i + SoldierField.Flags] & 16 ? FOG.marksmanM : FOG.soldierM);
      }
      for (const v of f.vehicles) if (v.state !== 'destroyed') disc(v.x, v.y, FOG.vehicleM);
      for (const st of f.structures) if (st.built) disc((st.cx + 0.5) * cs, (st.cy + 0.5) * cs, FOG.structureM);
      for (const b of f.bases) {
        if (b.kind !== 'base') continue;
        const m = FOG.baseMarginM;
        fogCtx.fillRect(X(b.x0 * cs - m), Y(b.y0 * cs - m), ((b.x1 - b.x0 + 1) * cs + 2 * m) * k, ((b.y1 - b.y0 + 1) * cs + 2 * m) * k);
      }
      ctx.drawImage(fogLayer, 0, 0);
    };
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - last < 100) return;
      last = now;
      const f = client.state.frame;
      // In direct control the map is a window around the soldier; otherwise the whole city.
      const me = f ? directSoldier(f) : null;
      const k = me ? SIZE / DIRECT_SPAN_M : kAll;
      const ox = me ? me.x - DIRECT_SPAN_M / 2 : 0;
      const oy = me ? me.y - DIRECT_SPAN_M / 2 : 0;
      const X = (m: number) => (m - ox) * k;
      const Y = (m: number) => (m - oy) * k;
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#1a1d20';
      ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.drawImage(terrain, X(0), Y(0), worldW * k, worldH * k);
      if (!f) return;
      // Strategic points: their capture circles, blue when secured, amber contested, red overrun.
      if (f.economy) {
        for (const b of f.bases) {
          const z = siteZone(b, cs);
          ctx.beginPath();
          ctx.arc(X(z.x), Y(z.y), z.r * k, 0, Math.PI * 2);
          const rgb = b.held ? '79,163,255' : b.control > 0 ? '224,176,64' : '208,80,60';
          ctx.fillStyle = `rgba(${rgb},0.14)`;
          ctx.fill();
          ctx.strokeStyle = `rgba(${rgb},0.8)`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
      // Held districts get a blue wash, contested ones amber; lost ones stay as they are.
      // Where strategic points are the goal, districts are only names.
      for (const d of f.economy ? [] : f.districts) {
        const info = map.districts.find((x) => x.id === d.id);
        if (!info || d.state === 'lost') continue;
        ctx.fillStyle = d.state === 'held' ? 'rgba(79,163,255,0.16)' : 'rgba(220,150,40,0.16)';
        ctx.fillRect(X(info.x0 * cs), Y(info.y0 * cs), (info.x1 - info.x0 + 1) * cs * k, (info.y1 - info.y0 + 1) * cs * k);
      }
      for (const s of map.sites) {
        ctx.strokeStyle = s.kind === 'base' ? '#4fa3ff' : '#e0b040';
        ctx.lineWidth = 1;
        ctx.strokeRect(Math.round(X(s.x0 * cs)) + 0.5, Math.round(Y(s.y0 * cs)) + 0.5, (s.x1 - s.x0 + 1) * cs * k, (s.y1 - s.y0 + 1) * cs * k);
      }
      // The mission area the current objective is about, blinking so it reads at a glance.
      for (const z of f.mission?.zones ?? []) {
        if (!z.active) continue;
        ctx.strokeStyle = `rgba(240,176,63,${0.55 + 0.45 * Math.sin(now / 160)})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(X(z.x0 * cs) - 2, Y(z.y0 * cs) - 2, (z.x1 - z.x0 + 1) * cs * k + 4, (z.y1 - z.y0 + 1) * cs * k + 4);
      }
      if (f.fog) drawFog(f, X, Y, k);
      dotPixels.fill(0);
      const zs = f.zombies;
      for (let i = 0; i < zs.length; i += ZOMBIE_STRIDE) {
        const px = Math.floor(X(zs[i + ZombieField.X]));
        const py = Math.floor(Y(zs[i + ZombieField.Y]));
        if (px < 0 || py < 0 || px >= SIZE - 1 || py >= SIZE - 1) continue;
        const o = py * SIZE + px;
        dotPixels[o] = dotPixels[o + 1] = dotPixels[o + SIZE] = dotPixels[o + SIZE + 1] = RED;
        if (f.fog) seen.set(zs[i + ZombieField.Slot], { x: zs[i + ZombieField.X], y: zs[i + ZombieField.Y], t: now, frame: f.tick });
      }
      // Zombies that left sight stay a few seconds, faded, where they were last seen.
      if (f.fog) {
        for (const [slot, g] of seen) {
          if (g.frame === f.tick) continue;
          if (now - g.t > GHOST_MS) {
            seen.delete(slot);
            continue;
          }
          const px = Math.floor(X(g.x));
          const py = Math.floor(Y(g.y));
          if (px < 0 || py < 0 || px >= SIZE - 1 || py >= SIZE - 1) continue;
          dotPixels[py * SIZE + px] = GHOST;
        }
      }
      dotCtx.putImageData(dots, 0, 0);
      ctx.drawImage(dotLayer, 0, 0);
      ctx.fillStyle = '#7fc8ff';
      const ss = f.soldiers;
      for (let i = 0; i < ss.length; i += SOLDIER_STRIDE) {
        if (ss[i + SoldierField.Condition] > 1) continue;
        ctx.fillRect(X(ss[i + SoldierField.X]) - 1, Y(ss[i + SoldierField.Y]) - 1, 2.5, 2.5);
      }
      for (const v of f.vehicles) {
        ctx.fillStyle = v.state === 'destroyed' ? '#555' : '#ffd24a';
        ctx.fillRect(X(v.x) - 2, Y(v.y) - 2, 4, 4);
      }
      // Names of the sites and of the objective, so a base can be told apart from a depot.
      ctx.font = '600 9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      const label = (text: string, x: number, y: number, color: string) => {
        const px = Math.min(SIZE - 4 - ctx.measureText(text).width / 2, Math.max(4 + ctx.measureText(text).width / 2, x));
        if (y < 10 || y > SIZE + 10) return;
        ctx.strokeText(text, px, y);
        ctx.fillStyle = color;
        ctx.fillText(text, px, y);
      };
      const target = objectiveTarget(f, map);
      for (const s of map.sites) {
        if (target && target.name === s.name) continue;
        label(s.name, X(((s.x0 + s.x1 + 1) / 2) * cs), Y(s.y0 * cs) - 2, s.kind === 'base' ? '#9fd0ff' : '#f0d79a');
      }
      if (target) label(target.name, X(target.x), Y(target.y) - 8, '#ffc04d');
      if (me) {
        // The soldier in the middle, pointing where he looks.
        ctx.save();
        ctx.translate(SIZE / 2, SIZE / 2);
        ctx.rotate(Math.atan2(me.fy, me.fx));
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(6, 0);
        ctx.lineTo(-4, -4);
        ctx.lineTo(-2, 0);
        ctx.lineTo(-4, 4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        return;
      }
      // Camera footprint (approximate: the tilt makes it a trapezoid).
      const rig = view.rig;
      const aspect = innerWidth / Math.max(1, innerHeight);
      const hw = (rig.span * aspect) / 2;
      const hh = rig.span / 2;
      const cos = Math.cos(rig.yaw);
      const sin = Math.sin(rig.yaw);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      [
        [-hw, -hh],
        [hw, -hh],
        [hw, hh],
        [-hw, hh],
      ].forEach(([x, y], i) => {
        const px = X(rig.focusX + x * cos - y * sin);
        const py = Y(rig.focusY + x * sin + y * cos);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.stroke();
    };
    raf = requestAnimationFrame(draw);

    let dragging = false;
    const jump = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      const scale = r.width / SIZE;
      if (client.state.frame?.directSoldier != null) return;
      view.rig.centerOn((e.clientX - r.left) / scale / kAll, (e.clientY - r.top) / scale / kAll);
    };
    const down = (e: PointerEvent) => {
      dragging = true;
      cv.setPointerCapture(e.pointerId);
      jump(e);
    };
    const move = (e: PointerEvent) => dragging && jump(e);
    const up = () => (dragging = false);
    cv.addEventListener('pointerdown', down);
    cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerup', up);
    return () => {
      cancelAnimationFrame(raf);
      cv.removeEventListener('pointerdown', down);
      cv.removeEventListener('pointermove', move);
      cv.removeEventListener('pointerup', up);
    };
  }, [client, view]);

  return (
    <div className={`minimap panel ${direct ? 'direct-map' : ''}`} title={direct ? undefined : t('minimap.hint')}>
      <canvas ref={canvas} width={SIZE} height={SIZE} />
    </div>
  );
}

/** Position and facing of the directly controlled soldier, if any. */
function directSoldier(f: Frame): { x: number; y: number; fx: number; fy: number } | null {
  if (f.directSoldier == null) return null;
  const ss = f.soldiers;
  for (let i = 0; i < ss.length; i += SOLDIER_STRIDE) {
    if (ss[i + SoldierField.Id] !== f.directSoldier) continue;
    return { x: ss[i + SoldierField.X], y: ss[i + SoldierField.Y], fx: ss[i + SoldierField.FacingX], fy: ss[i + SoldierField.FacingY] };
  }
  return null;
}
