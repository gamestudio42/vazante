import { useEffect, useRef } from 'react';
import { PRESENTATION } from '@vazante/shared';
import { squadMarkerCss, type GameRenderer } from '@vazante/view3d';
import type { GameClient } from '../client.ts';
import { visibleSquadLabels, type SquadLabelBox } from './squad-labels.ts';

/** Read-only, non-interactive identities over friendly squads in tactical and strategic views. */
export function SquadLabels({ client, view, visible }: { client: GameClient; view: GameRenderer; visible: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = root.current!;
    if (!visible) return;
    const labels = new Map<number, { node: HTMLDivElement; name: HTMLElement; count: HTMLElement; text: string; width: number; height: number }>();
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const frame = client.state.frame;
      if (!frame) return;
      const alive = new Set(frame.squads.filter(q => q.alive > 0).map(q => q.id));
      for (const [id, entry] of labels) {
        if (!alive.has(id)) { entry.node.remove(); labels.delete(id); }
      }
      const boxes: SquadLabelBox[] = [];
      for (const q of frame.squads) {
        if (!q.alive) continue;
        let entry = labels.get(q.id);
        if (!entry) {
          const node = document.createElement('div');
          node.className = 'squad-label';
          node.dataset.squadId = String(q.id);
          node.style.setProperty('--sq', squadMarkerCss(q.id));
          const name = document.createElement('b'), count = document.createElement('span');
          node.append(name, count);
          el.appendChild(node);
          entry = { node, name, count, text: '', width: 0, height: 0 };
          labels.set(q.id, entry);
        }
        const count = `${q.alive}/${q.members.length}`;
        if (entry.text !== q.name + count) {
          entry.name.textContent = q.name;
          entry.count.textContent = count;
          entry.text = q.name + count;
        }
        // visibility:hidden keeps measurement available, including after web fonts finish loading.
        entry.width = entry.node.offsetWidth;
        entry.height = entry.node.offsetHeight;
        const selected = client.state.selected.includes(q.id);
        entry.node.classList.toggle('selected', selected);
        const p = PRESENTATION.squadMarkers;
        const height = p.labelHeightM + (p.strategicHeightM - p.labelHeightM) * view.rig.strategicBlend;
        const at = view.worldToScreen(q.anchorX, q.anchorY, innerWidth, innerHeight, height);
        const x = Math.round(at.x - entry.width / 2), y = Math.round(at.y - entry.height);
        entry.node.style.transform = `translate(${x}px, ${y}px)`;
        boxes.push({ id: q.id, x, y, width: entry.width, height: entry.height, front: at.front, selected });
      }
      const obstacles = Array.from(document.querySelectorAll<HTMLElement>('.map-label, .obj-arrow'))
        .filter(node => node.offsetWidth > 0).map(node => node.getBoundingClientRect());
      const shown = frame.directSoldier !== null || view.rig.direct ? [] : visibleSquadLabels(boxes, innerWidth, innerHeight, obstacles);
      for (const entry of labels.values()) entry.node.style.visibility = 'hidden';
      for (const b of shown) {
        const node = labels.get(b.id)!.node;
        const original = boxes.find(a => a.id === b.id)!;
        node.style.visibility = 'visible';
        node.style.transform = `translate(${b.x}px, ${b.y}px)`;
        node.style.setProperty('--leader', `${original.y - b.y}px`);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); el.replaceChildren(); };
  }, [client, view, visible]);
  return <div className="squad-labels" ref={root} aria-hidden="true" />;
}
