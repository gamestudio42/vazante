export const SAVE_FORMAT = 'vazante-save';
/** Bump when the save layout changes. Rule changes are caught by the hash check instead. */
export const SAVE_VERSION = 1;

/** A full copy of the simulation state at one tick. */
export interface SaveGame {
  format: typeof SAVE_FORMAT;
  version: number;
  scenario: string;
  seed: number;
  tick: number;
  /** State hash at `tick`; a load that does not hash back is rejected. */
  hash: number;
  /** Structured-clonable world snapshot (typed arrays, maps and plain objects). */
  world: unknown;
}

/** Metadata shown in the load menu. */
export interface SaveMeta {
  slot: string;
  scenario: string;
  seed: number;
  tick: number;
  savedAt: number;
}

export function isSaveGame(v: unknown): v is SaveGame {
  const s = v as SaveGame;
  return (
    typeof s === 'object' &&
    s !== null &&
    s.format === SAVE_FORMAT &&
    typeof s.version === 'number' &&
    typeof s.seed === 'number' &&
    typeof s.tick === 'number' &&
    typeof s.hash === 'number' &&
    typeof s.world === 'object'
  );
}

// ----- File encoding: JSON with typed arrays and maps tagged -----

const TYPED = ['Int8Array', 'Uint8Array', 'Uint8ClampedArray', 'Int16Array', 'Uint16Array', 'Int32Array', 'Uint32Array', 'Float32Array', 'Float64Array'] as const;
type TypedName = (typeof TYPED)[number];
type Typed = Int8Array | Uint8Array | Uint8ClampedArray | Int16Array | Uint16Array | Int32Array | Uint32Array | Float32Array | Float64Array;
const CTORS: Record<TypedName, new (b: ArrayBuffer) => Typed> = {
  Int8Array,
  Uint8Array,
  Uint8ClampedArray,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  Float32Array,
  Float64Array,
};

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/**
 * JSON text for a save file. Shared references are not preserved by JSON, so maps are written as
 * entry lists and the simulation rebuilds its id indexes on load.
 */
export function encodeSave(save: SaveGame): string {
  return JSON.stringify(save, function (this: unknown, _k, v: unknown) {
    if (ArrayBuffer.isView(v) && !(v instanceof DataView)) {
      const t = v as Typed;
      return { $t: t.constructor.name, d: toBase64(new Uint8Array(t.buffer, t.byteOffset, t.byteLength)) };
    }
    if (v instanceof Map) return { $m: [...v.entries()] };
    // JSON has no Infinity, NaN or -0; the hash would notice.
    if (typeof v === 'number' && (!Number.isFinite(v) || Object.is(v, -0))) return { $n: String(Object.is(v, -0) ? '-0' : v) };
    return v;
  });
}

export function decodeSave(text: string): SaveGame {
  const v: unknown = JSON.parse(text, (_k, x: unknown) => {
    const o = x as { $t?: string; d?: string; $m?: [unknown, unknown][]; $n?: string };
    if (o && typeof o === 'object') {
      if (typeof o.$n === 'string') return Number(o.$n);
      if (typeof o.$t === 'string' && typeof o.d === 'string' && (TYPED as readonly string[]).includes(o.$t)) {
        const bytes = fromBase64(o.d);
        return new CTORS[o.$t as TypedName](bytes.buffer as ArrayBuffer);
      }
      if (Array.isArray(o.$m)) return new Map(o.$m);
    }
    return x;
  });
  if (!isSaveGame(v)) throw new Error('save_invalid');
  return v;
}
