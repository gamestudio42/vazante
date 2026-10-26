// Bundles a TypeScript tool with esbuild (no keepNames wrappers, like the game build) and runs it.
// tsx adds per-function helpers that distort benchmarks by 15 to 20%.
import { build } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [entry, ...args] = process.argv.slice(2);
const out = path.join(mkdtempSync(path.join(tmpdir(), 'vazante-')), 'tool.mjs');
await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', target: 'node22', outfile: out, logLevel: 'warning' });
process.argv = [process.argv[0], out, ...args];
await import(pathToFileURL(out).href);
