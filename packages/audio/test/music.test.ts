import type { Frame, MissionView } from '@vazante/shared';
import { DAY, TICK_HZ } from '@vazante/shared';
import { describe, expect, it } from 'vitest';
import { MusicDirector } from '../src/music.ts';

function frame(waveState: MissionView['waveState'], tick = 0, phase: MissionView['phase'] = 'defend'): Frame {
  return { tick, mission: { waveState, phase } as MissionView } as Frame;
}

describe('adaptive music', () => {
  it('rises from calm to warning to battle', () => {
    const calm = MusicDirector.targetFor(frame('none'), 0, 0);
    const warn = MusicDirector.targetFor(frame('warning'), 0, 0);
    const wave = MusicDirector.targetFor(frame('active'), 0, 0);
    const siege = MusicDirector.targetFor(frame('active'), 80, 200);
    expect(calm).toBeLessThan(0.25);
    expect(warn).toBeGreaterThan(calm);
    expect(wave).toBeGreaterThan(warn);
    expect(siege).toBeGreaterThan(0.95);
  });

  it('is quieter by day than at night, and silent after the mission ends', () => {
    const noon = (12 - DAY.startHour + 24) / 24 * DAY.lengthS * TICK_HZ;
    const midnight = (24 - DAY.startHour) / 24 * DAY.lengthS * TICK_HZ;
    expect(MusicDirector.targetFor(frame('none', midnight), 0, 0)).toBeGreaterThan(MusicDirector.targetFor(frame('none', noon), 0, 0));
    expect(MusicDirector.targetFor(frame('active', 0, 'won'), 80, 200)).toBe(0);
  });

  it('layers: drums only in battle, the pad always', () => {
    expect(MusicDirector.mix(0.1).drums).toBe(0);
    expect(MusicDirector.mix(0.1).pad).toBeGreaterThan(0);
    expect(MusicDirector.mix(0.45).bass).toBeGreaterThan(0.1);
    expect(MusicDirector.mix(0.9).drums).toBeGreaterThan(0.15);
    expect(MusicDirector.mix(0.9).stab).toBeGreaterThan(0);
  });
});
