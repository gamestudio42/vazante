import { useEffect, useRef } from 'react';
import { SOLDIER_STRIDE, SoldierField, type Frame } from '@vazante/shared';
import type { GameRenderer } from '@vazante/view3d';
import type { GameClient } from '../client.ts';
import { t } from '../i18n.ts';
import { objectiveTarget } from './objective.ts';

/** Labels float this high over the ground, in metres. */
const LABEL_HEIGHT_M = 8;
/** In direct control only sites this close are named, so the horizon does not fill with text. */
const DIRECT_LABEL_M = 450;
/** The off-screen objective arrow keeps this far from the window edges (clear of the top bar), in CSS pixels. */
const EDGE_PX = 64;
const EDGE_TOP_PX = 96;

/**
 * Names over the bases and depots, the objective named with its distance, and an arrow on the
 * window edge when the objective is off screen. Positions are written straight to the DOM every
 * animation frame; React only mounts the container.
 */
export function MapLabels({ client, view }: { client: GameClient; view: GameRenderer }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current!;
    const map = view.map;
    const cs = map.cellSize;
    const sites = map.sites.map((s) => {
      const d = document.createElement('div');
      d.className = `map-label site-${s.kind}`;
      const name = document.createElement('span');
      name.textContent = s.name;
      const sub = document.createElement('small');
      d.append(name, sub);
      el.appendChild(d);
      return { name: s.name, x: ((s.x0 + s.x1 + 1) / 2) * cs, y: ((s.y0 + s.y1 + 1) / 2) * cs, d, sub, text: '' };
    });
    const obj = document.createElement('div');
    obj.className = 'map-label objective';
    el.appendChild(obj);
    const arrow = document.createElement('div');
    arrow.className = 'obj-arrow';
    arrow.innerHTML = '<svg width="22" height="22" viewBox="0 0 22 22"><path d="M20 11 4 3l4 8-4 8z" fill="currentColor"/></svg><span></span>';
    el.appendChild(arrow);
    const arrowIcon = arrow.firstElementChild as SVGElement;
    const arrowText = arrow.lastElementChild as HTMLSpanElement;

    const place = (d: HTMLElement, x: number, y: number) => {
      d.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
    };
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const f = client.state.frame;
      const w = innerWidth;
      const h = innerHeight;
      const me = f ? reference(f, client.state.selected) : null;
      const direct = f?.directSoldier != null;
      const target = f ? objectiveTarget(f, map) : null;
      for (const s of sites) {
        const p = view.worldToScreen(s.x, s.y, w, h, LABEL_HEIGHT_M);
        const far = direct && me !== null && Math.hypot(s.x - me.x, s.y - me.y) > DIRECT_LABEL_M;
        const show = !far && p.front && target?.name !== s.name && p.x > -80 && p.x < w + 80 && p.y > -20 && p.y < h + 40;
        s.d.style.display = show ? '' : 'none';
        if (!show) continue;
        place(s.d, p.x, p.y);
        // Strategic points: what the site gives and how firmly it is held.
        const b = f?.economy ? f.bases.find((x) => x.name === s.name) : undefined;
        const text = b?.role ? `${t(`site.${b.role}`)} · ${b.held ? t('site.secured') : `${b.control}%`}` : '';
        if (text !== s.text) {
          s.text = text;
          s.sub.textContent = text;
          s.d.classList.toggle('secured', !!b?.held);
          s.d.classList.toggle('contested', !!b && !b.held);
        }
      }
      if (!target) {
        obj.style.display = arrow.style.display = 'none';
        return;
      }
      const dist = me ? ` · ${Math.round(Math.hypot(target.x - me.x, target.y - me.y))} m` : '';
      const p = view.worldToScreen(target.x, target.y, w, h, LABEL_HEIGHT_M);
      const onScreen = p.front && p.x > EDGE_PX && p.x < w - EDGE_PX && p.y > EDGE_TOP_PX && p.y < h - EDGE_PX;
      obj.style.display = onScreen ? '' : 'none';
      arrow.style.display = onScreen ? 'none' : '';
      if (onScreen) {
        obj.textContent = target.name + dist;
        place(obj, p.x, p.y);
        return;
      }
      // Off screen: point from the middle of the view towards it (mirrored when it is behind the camera).
      // The box the arrow rides on sits a little low, so the top margin is the larger one.
      const cx = w / 2;
      const cy = (EDGE_TOP_PX + h - EDGE_PX) / 2;
      let dx = p.x - cx;
      let dy = p.y - cy;
      if (!p.front) {
        dx = -dx;
        dy = -dy;
      }
      const len = Math.hypot(dx, dy) || 1;
      const s = Math.min((cx - EDGE_PX) / Math.abs(dx / len || 1e-6), (cy - EDGE_TOP_PX) / Math.abs(dy / len || 1e-6));
      const ax = cx + (dx / len) * s;
      const ay = cy + (dy / len) * s;
      arrow.style.transform = `translate(${Math.round(ax)}px, ${Math.round(ay)}px) translate(-50%, -50%)`;
      arrowIcon.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
      arrowText.textContent = target.name + dist;
      // Keep the text inside the window on the side the arrow sits.
      arrow.classList.toggle('left', ax > cx);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      el.replaceChildren();
    };
  }, [client, view]);

  return <div className="map-labels" ref={root} aria-hidden="true" />;
}

/** Where distances are measured from: the controlled soldier, else the selected squads, else nowhere. */
function reference(f: Frame, selected: readonly number[]): { x: number; y: number } | null {
  if (f.directSoldier != null) {
    const ss = f.soldiers;
    for (let i = 0; i < ss.length; i += SOLDIER_STRIDE) {
      if (ss[i + SoldierField.Id] === f.directSoldier) return { x: ss[i + SoldierField.X], y: ss[i + SoldierField.Y] };
    }
  }
  const qs = f.squads.filter((q) => selected.includes(q.id));
  if (qs.length === 0) return null;
  return { x: qs.reduce((a, q) => a + q.anchorX, 0) / qs.length, y: qs.reduce((a, q) => a + q.anchorY, 0) / qs.length };
}
