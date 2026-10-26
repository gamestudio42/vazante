const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** Incremental 32-bit FNV-1a over bytes, numbers and strings. */
export class Fnv1a {
  private h = FNV_OFFSET;
  private readonly f64 = new Float64Array(1);
  private readonly f64Bytes = new Uint8Array(this.f64.buffer);

  byte(b: number): this {
    this.h = Math.imul(this.h ^ (b & 0xff), FNV_PRIME) >>> 0;
    return this;
  }

  bytes(data: ArrayBufferView): this {
    const view = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    for (let i = 0; i < view.length; i++) this.byte(view[i]);
    return this;
  }

  u32(n: number): this {
    return this.byte(n).byte(n >>> 8).byte(n >>> 16).byte(n >>> 24);
  }

  f64Value(n: number): this {
    this.f64[0] = n;
    for (let i = 0; i < 8; i++) this.byte(this.f64Bytes[i]);
    return this;
  }

  str(s: string): this {
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      this.byte(c).byte(c >>> 8);
    }
    return this;
  }

  digest(): number {
    return this.h >>> 0;
  }
}

export function fnv1a(s: string): number {
  return new Fnv1a().str(s).digest();
}

export function hex32(n: number): string {
  return (n >>> 0).toString(16).padStart(8, '0');
}
