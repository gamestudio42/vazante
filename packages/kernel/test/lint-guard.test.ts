import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

describe('determinism lint guard', () => {
  const eslint = new ESLint({ cwd: process.cwd() });
  const lint = async (code: string) => {
    const [r] = await eslint.lintText(code, { filePath: 'packages/simulation/src/__guard__.ts' });
    return r.messages.map((m) => m.ruleId);
  };

  it('rejects transcendental Math, Math.random and the wall clock in the simulation', async () => {
    expect(await lint('export const a = Math.sin(1);\n')).toContain('no-restricted-properties');
    expect(await lint('export const b = Math.random();\n')).toContain('no-restricted-properties');
    expect(await lint('export const c = Date.now();\n')).toContain('no-restricted-globals');
    expect(await lint('export const d = performance.now();\n')).toContain('no-restricted-globals');
  });

  it('allows sqrt and floor', async () => {
    expect(await lint('export const e = Math.sqrt(2) + Math.floor(1.5);\n')).toEqual([]);
  });
});
