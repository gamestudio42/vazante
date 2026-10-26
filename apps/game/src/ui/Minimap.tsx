import { useEffect, useRef } from 'react';
import { Ground, SOLDIER_STRIDE, SoldierField, ZOMBIE_STRIDE, ZombieField } from '@vazante/shared';
import type { GameRenderer } from '@vazante/view3d';
import type { GameClient } from '../client.ts';
import { t } from '../i18n.ts';

const SIZE = 192;
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
export function Minimap({ client, view }: { client: GameClient; view: GameRenderer }) {
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
    const k = SIZE / Math.max(worldW, worldH);
    let raf = 0;
    let last = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - last < 100) return;
      last = now;
      const f = client.state.frame;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(terrain, 0, 0, map.width * cs * k, map.height * cs * k);
      if (!f) return;
      // Held districts get a blue wash, contested ones amber; lost ones stay as they are.
      for (const d of f.districts) {
        const info = map.districts.find((x) => x.id === d.id);
        if (!info || d.state === 'lost') continue;
        ctx.fillStyle = d.state === 'held' ? 'rgba(79,163,255,0.16)' : 'rgba(220,150,40,0.16)';
        ctx.fillRect(info.x0 * cs * k, info.y0 * cs * k, (info.x1 - info.x0 + 1) * cs * k, (info.y1 - info.y0 + 1) * cs * k);
      }
      for (const s of map.sites) {
        ctx.strokeStyle = s.kind === 'base' ? '#4fa3ff' : '#e0b040';
        ctx.lineWidth = 1;
        ctx.strokeRect(s.x0 * cs * k + 0.5, s.y0 * cs * k + 0.5, (s.x1 - s.x0 + 1) * cs * k, (s.y1 - s.y0 + 1) * cs * k);
      }
      ctx.fillStyle = '#d84a3a';
      const zs = f.zombies;
      for (let i = 0; i < zs.length; i += ZOMBIE_STRIDE) ctx.fillRect(zs[i + ZombieField.X] * k - 0.5, zs[i + ZombieField.Y] * k - 0.5, 1.5, 1.5);
      ctx.fillStyle = '#7fc8ff';
      const ss = f.soldiers;
      for (let i = 0; i < ss.length; i += SOLDIER_STRIDE) {
        if (ss[i + SoldierField.Condition] > 1) continue;
        ctx.fillRect(ss[i + SoldierField.X] * k - 1, ss[i + SoldierField.Y] * k - 1, 2.5, 2.5);
      }
      for (const v of f.vehicles) {
        ctx.fillStyle = v.state === 'destroyed' ? '#555' : '#ffd24a';
        ctx.fillRect(v.x * k - 2, v.y * k - 2, 4, 4);
      }
      // Camera footprint (approximate: the tilt makes it a trapezoid).
      const rig = view.rig;
      const aspect = innerWidth / Math.max(1, innerHeight);
      const hw = (rig.span * aspect) / 2;
      const hh = rig.span / 2;
      const cos = Math.cos(rig.yaw);
      const sin = Math.sin(rig.yaw);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      [
        [-hw, -hh],
        [hw, -hh],
        [hw, hh],
        [-hw, hh],
      ].forEach(([x, y], i) => {
        const px = (rig.focusX + x * cos - y * sin) * k;
        const py = (rig.focusY + x * sin + y * cos) * k;
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
      view.rig.centerOn((e.clientX - r.left) / scale / k, (e.clientY - r.top) / scale / k);
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
    <div className="minimap panel" title={t('minimap.hint')}>
      <canvas ref={canvas} width={SIZE} height={SIZE} />
    </div>
  );
}
