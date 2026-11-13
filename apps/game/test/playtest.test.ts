import { describe, expect, it } from 'vitest';
import { emptyLog, exportReport, MAX_EVENTS, MAX_SESSIONS, parseLog, record, startSession, summarize, touch, type PlaytestLog } from '../src/playtest.ts';

function session(log: PlaytestLog, id: string, scenario = 'last_convoy'): PlaytestLog {
  return startSession(log, { id, startedAt: 0, scenario, difficulty: 'veteran', locale: 'pt-BR', seed: 1, gpu: 'test' });
}

function play(log: PlaytestLog, id: string): PlaytestLog {
  return record(log, id, { s: 1, tick: 10, kind: 'screen', v: 'playing' });
}

describe('playtest log', () => {
  it('reads back what it wrote and rejects unknown data', () => {
    const log = play(session(emptyLog(), 'a'), 'a');
    expect(parseLog(JSON.stringify(log))).toEqual(log);
    expect(parseLog('not json')).toEqual(emptyLog());
    expect(parseLog(JSON.stringify({ version: 99, sessions: [] }))).toEqual(emptyLog());
    expect(parseLog(null)).toEqual(emptyLog());
  });

  it('sets the outcome on a win or a loss', () => {
    let log = play(session(emptyLog(), 'a'), 'a');
    log = record(log, 'a', { s: 300, tick: 3000, kind: 'lost', v: 'post_fell' });
    expect(log.sessions[0].outcome).toBe('lost');
    expect(log.sessions[0].last).toMatchObject({ s: 300, tick: 3000 });
  });

  it('keeps the newest sessions and the first event of a long session', () => {
    let log = emptyLog();
    for (let i = 0; i < MAX_SESSIONS + 5; i++) log = session(log, `s${i}`);
    expect(log.sessions).toHaveLength(MAX_SESSIONS);
    expect(log.sessions[0].id).toBe('s5');

    let one = session(emptyLog(), 'a');
    for (let i = 0; i < MAX_EVENTS + 20; i++) one = record(one, 'a', { s: i, tick: i, kind: 'fps', v: 60 });
    const events = one.sessions[0].events;
    expect(events).toHaveLength(MAX_EVENTS);
    expect(events[0].kind).toBe('start');
    expect(events[events.length - 1].s).toBe(MAX_EVENTS + 19);
  });

  it('summarizes wins, losses and where players gave up', () => {
    let log = emptyLog();
    log = play(session(log, 'won'), 'won');
    log = record(log, 'won', { s: 600, tick: 6000, kind: 'won' });
    log = play(session(log, 'lost'), 'lost');
    log = record(log, 'lost', { s: 240, tick: 2400, kind: 'lost' });
    log = play(session(log, 'quit1'), 'quit1');
    log = touch(log, 'quit1', { stage: 1, s: 120 });
    log = play(session(log, 'quit2'), 'quit2');
    log = touch(log, 'quit2', { stage: 1, s: 60 });
    // Never left the briefing: not counted.
    log = session(log, 'menu');
    log = play(session(log, 'other', 'survival'), 'other');

    const [convoy, survival] = summarize(log);
    expect(convoy).toEqual({ scenario: 'last_convoy', played: 4, won: 1, lost: 1, abandoned: 2, medianMinutes: 3, abandonedAtStage: { 1: 2 } });
    expect(survival).toMatchObject({ scenario: 'survival', played: 1, abandoned: 1 });
  });

  it('exports a report with the summary and the raw sessions', () => {
    const log = play(session(emptyLog(), 'a'), 'a');
    const report = JSON.parse(exportReport(log, 'test', 0)) as { game: string; summary: unknown[]; sessions: unknown[] };
    expect(report.game).toBe('vazante');
    expect(report.summary).toHaveLength(1);
    expect(report.sessions).toHaveLength(1);
  });
});
