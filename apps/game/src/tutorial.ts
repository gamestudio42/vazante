import { CELL_SIZE as CELL, type Frame } from '@vazante/shared';
import type { GameRenderer } from '@vazante/view3d';
import type { GameClient } from './client.ts';
import type { InputController } from './input.ts';

/** What a step waits for. Steps without a check advance with the "Got it" button. */
interface Step {
  id: string;
  done?: (ctx: StepContext) => boolean;
  /** Interface the step talks about: CSS selectors, first match each. */
  ui?: readonly string[];
  /** Places in the world the step talks about. */
  world?: (f: Frame) => [number, number][];
}


function baseAt(f: Frame): [number, number][] {
  const b = f.bases.find((x) => x.kind === 'base');
  return b ? [[((b.x0 + b.x1 + 1) / 2) * CELL, ((b.y0 + b.y1 + 1) / 2) * CELL]] : [];
}

function firstSquad(f: Frame): [number, number][] {
  const q = f.squads.find((x) => x.alive > 0);
  return q ? [[q.anchorX, q.anchorY]] : [];
}

interface StepContext {
  frame: Frame;
  client: GameClient;
  view: GameRenderer;
  start: StepStart;
  input: InputController;
  enteredDirect: boolean;
}

/** What the world looked like when the step began, to tell an action from the starting state. */
interface StepStart {
  focusX: number;
  focusY: number;
  span: number;
  stanceRevision: number;
  structures: number;
}

const STEPS: readonly Step[] = [
  { id: 'camera', ui: ['.minimap'], done: ({ view, start }) => Math.hypot(view.rig.focusX - start.focusX, view.rig.focusY - start.focusY) > 25 || Math.abs(view.rig.span / start.span - 1) > 0.2 },
  { id: 'select', ui: ['.squads.panel .squad:not(.vehicle)'], world: firstSquad, done: ({ client }) => client.state.selected.length > 0 },
  { id: 'move', world: firstSquad, done: ({ frame }) => frame.squads.some((q) => q.order.kind === 'move') },
  { id: 'stance', ui: ['.selection .cmds'], done: ({ frame, input, start }) => {
    const choice = input.stanceChoice;
    return !!choice && choice.revision > start.stanceRevision && choice.squads.every(id =>
      frame.squads.some(q => q.id === id && q.alive > 0 && q.stance === choice.stance));
  } },
  { id: 'build', ui: ['.build.panel'], world: baseAt, done: ({ frame, start }) => frame.structures.length > start.structures },
  {
    id: 'truck',
    ui: ['.squad.vehicle'],
    world: (f) => [...f.vehicles.filter((v) => v.state !== 'destroyed').slice(0, 1).map((v): [number, number] => [v.x, v.y]), ...baseAt(f)],
    done: ({ frame }) => frame.vehicles.some((v) => v.state === 'moving'),
  },
  { id: 'direct', ui: ['.selection .cmd.primary'], done: ({ frame, enteredDirect, input }) => enteredDirect && frame.directSoldier === null && !input.inDirect },
  { id: 'morale', ui: ['.squads.panel .bars.morale'] },
  { id: 'end', ui: ['.mission.panel'] },
];

/**
 * The guided first game: one hint at a time over the real mission, each advancing when the player
 * does what it asks. Reads worker frames and local input receipts; it never sends simulation commands.
 */
export class Tutorial {
  step = 0;
  active = false;
  version = 0;
  enteredDirect = false;
  /** Wall time (ms) the current step was completed, 0 while open; a short pause lets the player see it worked. */
  private doneAt = 0;
  private start: StepStart | null = null;
  private listeners = new Set<() => void>();

  constructor(
    private readonly client: GameClient,
    private readonly view: GameRenderer,
    private readonly input: InputController,
    private readonly onFinish: () => void,
  ) {}

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  get total(): number {
    return STEPS.length;
  }

  get id(): string {
    return STEPS[this.step].id;
  }

  /** The current step is a message to acknowledge rather than an action to perform. */
  get manual(): boolean {
    return !STEPS[this.step].done && !this.input.inDirect;
  }

  get returnToCommand(): boolean {
    return this.input.inDirect;
  }

  get completed(): boolean {
    return this.doneAt > 0;
  }

  /** What to highlight for the current step: interface selectors and screen points of world places. */
  focus(cssW: number, cssH: number): { ui: readonly string[]; points: { x: number; y: number }[] } {
    const s = STEPS[this.step];
    const f = this.client.state.frame;
    const points = f && s.world ? s.world(f).map(([x, y]) => this.view.worldToScreen(x, y, cssW, cssH, 0)) : [];
    const ui = this.input.inDirect ? [] :
      this.id === 'direct' && !this.client.state.selected.length ? ['.squads.panel .squad:not(.vehicle)'] : s.ui ?? [];
    return { ui: this.active && !this.completed ? ui : [], points: this.active && !this.completed ? points : [] };
  }

  begin(): void {
    this.active = true;
    this.step = 0;
    this.enter();
  }

  next(): void {
    if (!this.active || this.input.inDirect) return;
    if (this.id === 'build') this.input.setBuild(null);
    if (this.step >= STEPS.length - 1) {
      this.stop();
      return;
    }
    this.step++;
    this.enter();
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    this.onFinish();
    this.changed();
  }

  update(nowMs: number): void {
    const frame = this.client.state.frame;
    if (!this.active || !frame || !this.start) return;
    const s = STEPS[this.step];
    if (this.id === 'direct' && frame.directSoldier !== null && !this.enteredDirect) {
      this.enteredDirect = true;
      this.changed();
    }
    if (this.doneAt > 0) {
      if (nowMs - this.doneAt > 1200) this.next();
    } else if (s.done?.({ frame, client: this.client, view: this.view, input: this.input, enteredDirect: this.enteredDirect, start: this.start })) {
      this.doneAt = nowMs;
      this.changed();
    }
  }

  private enter(): void {
    const f = this.client.state.frame;
    const rig = this.view.rig;
    this.enteredDirect = false;
    this.start = { focusX: rig.focusX, focusY: rig.focusY, span: rig.span, stanceRevision: this.input.stanceChoice?.revision ?? 0, structures: f?.structures.length ?? 0 };
    this.doneAt = 0;
    this.changed();
  }

  private changed(): void {
    this.version++;
    for (const fn of this.listeners) fn();
  }
}
