import { expect, test } from 'vitest';
import { Blocked, ZombieKind, ZombieState } from '@vazante/shared';
import { fieldEngine, addSquad, soldiersOf, disarm } from './helpers.ts';
import { stepCombat } from '../src/systems/combat.ts';
import { SimulationEngine } from '../src/engine.ts';

test('worker aim preview selects the same assisted target as firing and consumes no RNG', () => {
  const e = fieldEngine();
  const q = addSquad(e, 'guard', 128, 128);
  const people = soldiersOf(e, q.id);
  people.slice(1).forEach(disarm);
  const s = people[0];
  e.enqueue({ type: 'set_direct_control', soldier: s.id });
  e.enqueue({ type: 'direct_input', soldier: s.id, move: {x:0,y:0}, aim: {x:1,y:0}, fire:false,reload:false });
  e.tick();
  const z = e.world.zombies.spawn(s.x + 10, s.y + 0.5, ZombieKind.Common, ZombieState.Wandering);
  e.world.zombies.spawn(s.x + 5, s.y + 3, ZombieKind.Common, ZombieState.Wandering);
  e.world.rebuildZombieHash();
  const before = e.hashState();
  const aim = e.frame().directAim!;
  expect(aim.target).toBe(z);
  for (let i=0;i<20;i++) expect(e.frame().directAim).toEqual(aim);
  expect(e.hashState()).toBe(before);
  s.direct!.fire = true; s.fireAcc = 1;
  stepCombat(e.world);
  const shot = e.frame().events.find(ev => ev.type === 'shot' && ev.source === s.id)!;
  expect([shot.x2,shot.y2]).toEqual([aim.x,aim.y]);
});

test('preview reports obstruction, reload and clear lane without adding gameplay rules', () => {
  const e = fieldEngine(); const q=addSquad(e,'guard',128,128); const s=soldiersOf(e,q.id)[0];
  e.enqueue({type:'set_direct_control',soldier:s.id});
  e.enqueue({type:'direct_input',soldier:s.id,move:{x:0,y:0},aim:{x:1,y:0},fire:false,reload:false}); e.tick();
  expect(e.frame().directAim?.blocked).toBe(false);
  const cell=e.world.grid.cellAt(s.x+8,s.y); e.world.grid.blocked[cell]=Blocked.StructureWall;
  expect(e.frame().directAim?.blocked).toBe(true);
  s.reloadT=5; expect(e.frame().directAim?.reloading).toBe(true);
  e.world.grid.blocked[cell]=0; expect(e.frame().directAim?.blocked).toBe(false);
});

test('scenario frames in direct control leave the authoritative world identical', () => {
  const a=SimulationEngine.create(7,'last_convoy'), b=SimulationEngine.create(7,'last_convoy');
  for (const e of [a,b]) e.enqueue({type:'set_direct_control',soldier:e.world.soldiers[0].id});
  for (let tick=0;tick<30;tick++) { a.tick(); b.tick(); a.frame(); }
  expect(a.hashState()).toBe(b.hashState());
});
