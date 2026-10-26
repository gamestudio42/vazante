/** Binary min-heap of integer values keyed by integer priority; ties broken by the smaller value (deterministic). */
export class MinHeap {
  private keys: number[] = [];
  private vals: number[] = [];

  get size(): number {
    return this.vals.length;
  }

  clear(): void {
    this.keys.length = 0;
    this.vals.length = 0;
  }

  push(key: number, val: number): void {
    const k = this.keys;
    const v = this.vals;
    let i = v.length;
    k.push(key);
    v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (less(k[i], v[i], k[p], v[p])) {
        swap(k, v, i, p);
        i = p;
      } else break;
    }
  }

  /** Remove the minimum; returns its value. Call `topKey` first if the key is needed. */
  pop(): number {
    const k = this.keys;
    const v = this.vals;
    const top = v[0];
    const lastK = k.pop()!;
    const lastV = v.pop()!;
    if (v.length > 0) {
      k[0] = lastK;
      v[0] = lastV;
      let i = 0;
      const n = v.length;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < n && less(k[l], v[l], k[m], v[m])) m = l;
        if (r < n && less(k[r], v[r], k[m], v[m])) m = r;
        if (m === i) break;
        swap(k, v, i, m);
        i = m;
      }
    }
    return top;
  }

  topKey(): number {
    return this.keys[0];
  }
}

function less(ka: number, va: number, kb: number, vb: number): boolean {
  return ka < kb || (ka === kb && va < vb);
}

function swap(k: number[], v: number[], a: number, b: number): void {
  const tk = k[a];
  k[a] = k[b];
  k[b] = tk;
  const tv = v[a];
  v[a] = v[b];
  v[b] = tv;
}
