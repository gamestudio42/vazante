import { Grid, computeFlowField } from '@vazante/simulation';
for (const n of [512, 128, 256, 512]) {
  const g = new Grid(n, n);
  const src = [g.idx(n >> 1, n >> 1), g.idx(10, 10)];
  computeFlowField(g, src, 200);
  const t = performance.now();
  for (let i = 0; i < 10; i++) computeFlowField(g, src, 200);
  console.log(n, ((performance.now() - t) / 10).toFixed(2), 'ms');
}
