/**
 * Recorded CC0 clips (built by `pnpm audio`, listed in docs/assets.md), by family: each family is
 * `<name>_1.ogg` .. `<name>_<n>.ogg`. Everything here is optional: a family that has not loaded
 * (offline, missing file, decode error) leaves the director on its procedural recipe.
 */
export const SAMPLE_FAMILIES = {
  rifle: 4,
  lmg: 3,
  shotgun: 4,
  reload: 3,
  pump: 1,
  dry: 1,
  splat: 4,
  break: 2,
  punch: 2,
  groan: 10,
  roar: 2,
  bite: 3,
  scream: 5,
  explosion: 3,
  metal: 3,
  debris: 1,
  static: 1,
} as const;

export type SampleFamily = keyof typeof SAMPLE_FAMILIES;

/** Single files that are not picked at random. */
export const SAMPLE_LOOPS = ['engine_loop'] as const;
export type SampleLoop = (typeof SAMPLE_LOOPS)[number];

export class SampleBank {
  private readonly families = new Map<SampleFamily, AudioBuffer[]>();
  private readonly loops = new Map<SampleLoop, AudioBuffer>();
  /** Last index played per family, so the same take never plays twice in a row. */
  private readonly last = new Map<SampleFamily, number>();

  /** Fetch and decode every clip in parallel; resolves once all have settled, never rejects. */
  async load(ctx: BaseAudioContext, base: string, fetcher: typeof fetch = fetch): Promise<number> {
    const get = async (name: string): Promise<AudioBuffer | null> => {
      try {
        const r = await fetcher(`${base}${name}.ogg`);
        if (!r.ok) return null;
        return await ctx.decodeAudioData(await r.arrayBuffer());
      } catch {
        return null;
      }
    };
    const jobs: Promise<void>[] = [];
    for (const [family, n] of Object.entries(SAMPLE_FAMILIES) as [SampleFamily, number][]) {
      jobs.push(
        Promise.all(Array.from({ length: n }, (_, i) => get(`${family}_${i + 1}`))).then((bufs) => {
          const ok = bufs.filter((b): b is AudioBuffer => b !== null);
          if (ok.length > 0) this.families.set(family, ok);
        }),
      );
    }
    for (const name of SAMPLE_LOOPS)
      jobs.push(
        get(name).then((b) => {
          if (b) this.loops.set(name, b);
        }),
      );
    await Promise.all(jobs);
    return this.size;
  }

  get size(): number {
    let n = this.loops.size;
    for (const b of this.families.values()) n += b.length;
    return n;
  }

  has(family: SampleFamily): boolean {
    return this.families.has(family);
  }

  /** A random take from the family, avoiding the previous one; null when the family has not loaded. */
  pick(family: SampleFamily, rand: () => number = Math.random): AudioBuffer | null {
    const bufs = this.families.get(family);
    if (!bufs) return null;
    let i = (rand() * bufs.length) | 0;
    if (bufs.length > 1 && i === this.last.get(family)) i = (i + 1) % bufs.length;
    this.last.set(family, i);
    return bufs[i];
  }

  loop(name: SampleLoop): AudioBuffer | null {
    return this.loops.get(name) ?? null;
  }
}
