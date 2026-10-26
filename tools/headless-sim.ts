import { hex32 } from '@vazante/kernel';
import { SimulationEngine } from '@vazante/simulation';

const seed = Number(process.argv[2] ?? 1);
const ticks = Number(process.argv[3] ?? 3000);
const engine = SimulationEngine.create(seed, 'last_convoy');
const t0 = performance.now();
let worst = 0;
for (let i = 0; i < ticks; i++) {
  const a = performance.now();
  engine.tick();
  worst = Math.max(worst, performance.now() - a);
  if (i % 600 === 0) {
    const f = engine.frame(false);
    console.log(`t=${(f.tick / 10).toFixed(0)}s zombies=${f.stats.zombiesAlive} killed=${f.stats.zombiesKilled} soldiers=${f.stats.soldiersAlive} ammo=${f.stats.ammoTotal}`);
  }
}
const ms = performance.now() - t0;
console.log(`seed=${seed} ticks=${ticks} hash=${hex32(engine.hashState())} mean=${(ms / ticks).toFixed(3)}ms worst=${worst.toFixed(2)}ms`);
