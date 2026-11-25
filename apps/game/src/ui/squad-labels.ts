import { PRESENTATION } from '@vazante/shared';

export interface SquadLabelBox {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  front: boolean;
  selected: boolean;
}

type Obstacle = Pick<SquadLabelBox, 'x' | 'y' | 'width' | 'height'>;

/** Keep squad overlaps bounded; lift above site text with a leader rather than obscuring objectives. */
export function visibleSquadLabels(boxes: readonly SquadLabelBox[], width: number, height: number, obstacles: readonly Obstacle[] = []): SquadLabelBox[] {
  const p = PRESENTATION.squadMarkers;
  const kept: SquadLabelBox[] = [];
  const ordered = [...boxes].sort((a, b) => Number(b.selected) - Number(a.selected) || a.id - b.id);
  const overlaps = (a: Obstacle, b: Obstacle) => b.x < a.x + a.width + p.labelGapPx && b.x + b.width + p.labelGapPx > a.x &&
    b.y < a.y + a.height + p.labelGapPx && b.y + b.height + p.labelGapPx > a.y;
  for (const original of ordered) {
    const b = { ...original };
    if (kept.length >= p.maxLabels) break;
    for (let i = 0; i < obstacles.length; i++) {
      const hit = obstacles.find(a => overlaps(a, b));
      if (!hit) break;
      b.y = hit.y - b.height - p.labelGapPx;
    }
    if (original.y - b.y > p.maxLiftPx || obstacles.some(a => overlaps(a, b))) continue;
    if (!b.front || b.x < p.edgePx || b.y < p.topPx || b.x + b.width > width - p.edgePx || b.y + b.height > height - p.edgePx) continue;
    if (kept.some(a => overlaps(a, b))) continue;
    kept.push(b);
  }
  return kept;
}
