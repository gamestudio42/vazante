import { describe, expect, it } from 'vitest';
import { SAMPLE_FAMILIES, SampleBank } from '../src/samples.ts';

/** Decodes any body into a stub buffer tagged with the file name. */
const ctx = { decodeAudioData: async (b: ArrayBuffer) => ({ name: new TextDecoder().decode(b) }) } as unknown as BaseAudioContext;

function fetcher(missing: (name: string) => boolean): typeof fetch {
  return (async (url: string) => {
    const name = url.slice(url.lastIndexOf('/') + 1);
    if (missing(name)) return { ok: false } as Response;
    return { ok: true, arrayBuffer: async () => new TextEncoder().encode(name).buffer } as Response;
  }) as typeof fetch;
}

describe('sample bank', () => {
  it('loads every family and the engine loop from the base URL', async () => {
    const bank = new SampleBank();
    const n = await bank.load(ctx, 'audio/', fetcher(() => false));
    expect(n).toBe(Object.values(SAMPLE_FAMILIES).reduce((a, b) => a + b, 0) + 1);
    expect(bank.has('rifle')).toBe(true);
    expect(bank.loop('engine_loop')).not.toBeNull();
  });

  it('leaves a missing family empty so the director falls back to synthesis', async () => {
    const bank = new SampleBank();
    await bank.load(ctx, 'audio/', fetcher((n) => n.startsWith('groan_') || n === 'shotgun_2.ogg'));
    expect(bank.has('groan')).toBe(false);
    expect(bank.pick('groan')).toBeNull();
    expect(bank.has('shotgun')).toBe(true);
  });

  it('never plays the same take twice in a row', async () => {
    const bank = new SampleBank();
    await bank.load(ctx, 'audio/', fetcher(() => false));
    const always0 = () => 0;
    const a = bank.pick('rifle', always0) as unknown as { name: string };
    const b = bank.pick('rifle', always0) as unknown as { name: string };
    expect(a.name).not.toBe(b.name);
  });

  it('survives a network error', async () => {
    const bank = new SampleBank();
    const n = await bank.load(ctx, 'audio/', (async () => {
      throw new Error('offline');
    }) as typeof fetch);
    expect(n).toBe(0);
  });
});
