import { ZOMBIES, ZombieState, type ZombieKind } from '@vazante/shared';

/** Fixed-capacity zombie pool stored as a structure of typed arrays. */
export class ZombiePool {
  readonly capacity: number;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly hp: Int16Array;
  readonly state: Uint8Array;
  readonly kind: Uint8Array;
  /** Ticks until the next attack is allowed. */
  readonly attackCd: Uint16Array;
  /** Ticks until the wander heading changes. */
  readonly wanderT: Uint16Array;
  readonly wanderDir: Uint8Array;
  /** Soldier id being chased, 0 = none (following the flow field). */
  readonly target: Int32Array;
  /** Stack of free slots; top at freeCount - 1. Lowest slots are handed out first. */
  private readonly free: Int32Array;
  private freeCount: number;
  alive = 0;
  /** One past the highest slot ever allocated; systems iterate [0, highWater). */
  highWater = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.vx = new Float32Array(capacity);
    this.vy = new Float32Array(capacity);
    this.hp = new Int16Array(capacity);
    this.state = new Uint8Array(capacity);
    this.kind = new Uint8Array(capacity);
    this.attackCd = new Uint16Array(capacity);
    this.wanderT = new Uint16Array(capacity);
    this.wanderDir = new Uint8Array(capacity);
    this.target = new Int32Array(capacity);
    this.free = new Int32Array(capacity);
    for (let i = 0; i < capacity; i++) this.free[i] = capacity - 1 - i;
    this.freeCount = capacity;
  }

  /** Allocate a zombie; returns the slot or -1 if the pool is full. */
  spawn(x: number, y: number, kind: ZombieKind, state: ZombieState = ZombieState.Wandering): number {
    if (this.freeCount === 0) return -1;
    const s = this.free[--this.freeCount];
    this.x[s] = x;
    this.y[s] = y;
    this.vx[s] = 0;
    this.vy[s] = 0;
    this.hp[s] = ZOMBIES[kind].hp;
    this.state[s] = state;
    this.kind[s] = kind;
    this.attackCd[s] = 0;
    this.wanderT[s] = 0;
    this.wanderDir[s] = 0;
    this.target[s] = 0;
    this.alive++;
    if (s >= this.highWater) this.highWater = s + 1;
    return s;
  }

  kill(s: number): void {
    if (this.state[s] === ZombieState.Free) return;
    this.state[s] = ZombieState.Free;
    this.hp[s] = 0;
    this.free[this.freeCount++] = s;
    this.alive--;
  }

  isAlive(s: number): boolean {
    return s >= 0 && s < this.capacity && this.state[s] !== ZombieState.Free;
  }

  get freeSlots(): number {
    return this.freeCount;
  }

  serializeFree(): number[] {
    return Array.from(this.free.subarray(0, this.freeCount));
  }

  restoreFree(free: readonly number[]): void {
    this.freeCount = free.length;
    for (let i = 0; i < free.length; i++) this.free[i] = free[i];
  }
}
