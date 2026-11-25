import { expect, test, vi } from 'vitest';
import { SimulationEngine } from '@vazante/simulation';
import type { GameRenderer } from '@vazante/view3d';
import type { GameClient } from '../src/client.ts';
import type { InputController } from '../src/input.ts';
import { Tutorial } from '../src/tutorial.ts';

function fixture(step: number) {
  const engine = SimulationEngine.create(1);
  const state = { frame: engine.frame(), selected: [engine.world.squads[0].id] };
  const input = { stanceChoice: null, inDirect: false, setBuild: vi.fn() } as unknown as InputController;
  const view = { rig: { focusX: 0, focusY: 0, span: 100 }, worldToScreen: () => ({ x: 0, y: 0 }) } as unknown as GameRenderer;
  const finish = vi.fn();
  const tutorial = new Tutorial({ state } as unknown as GameClient, view, input, finish);
  tutorial.begin();
  for (let i = 0; i < step; i++) tutorial.next();
  return { engine, state, input, tutorial, finish };
}

test('choosing the current posture completes the lesson, leaving it untouched does not', () => {
  const { state, input, tutorial } = fixture(3);
  tutorial.update(100);
  expect(tutorial.completed).toBe(false);
  const q = state.frame.squads[0];
  input.stanceChoice = { revision: 1, squads: [q.id], stance: q.stance };
  tutorial.update(200);
  expect(tutorial.completed).toBe(true);
});

test('a changed posture waits for the worker frame', () => {
  const { engine, state, input, tutorial } = fixture(3);
  const q = state.frame.squads[0];
  input.stanceChoice = { revision: 1, squads: [q.id], stance: 'defensive' };
  tutorial.update(100);
  expect(tutorial.completed).toBe(false);
  engine.enqueue({ type: 'stance', squads: [q.id], stance: 'defensive' });
  engine.tick();
  state.frame = engine.frame();
  tutorial.update(200);
  expect(tutorial.completed).toBe(true);
});

test('direct control must be entered and left before the morale lesson', () => {
  const { state, input, tutorial } = fixture(6);
  tutorial.update(100);
  expect(tutorial.completed).toBe(false);
  state.frame = { ...state.frame, directSoldier: state.frame.squads[0].members[0] };
  Object.assign(input, { inDirect: true });
  tutorial.update(200);
  tutorial.update(2000);
  tutorial.next();
  expect(tutorial.id).toBe('direct');
  expect(tutorial.returnToCommand).toBe(true);
  expect(tutorial.completed).toBe(false);
  expect(tutorial.focus(100, 100).ui).toEqual([]);
  // A local TAB exit is not enough until the worker also releases the soldier.
  Object.assign(input, { inDirect: false });
  tutorial.update(2100);
  expect(tutorial.completed).toBe(false);
  state.frame = { ...state.frame, directSoldier: null };
  tutorial.update(2200);
  expect(tutorial.completed).toBe(true);
  tutorial.update(3500);
  expect(tutorial.id).toBe('morale');
  expect(tutorial.manual).toBe(true);
});

test('leaving the building lesson clears the placement tool and direct guidance finds a squad', () => {
  const { state, input, tutorial } = fixture(4);
  tutorial.next();
  expect(input.setBuild).toHaveBeenCalledWith(null);
  tutorial.next();
  state.selected = [];
  expect(tutorial.focus(100, 100).ui).toEqual(['.squads.panel .squad:not(.vehicle)']);
});
