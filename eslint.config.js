import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const FORBIDDEN_MATH = ['random', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'exp', 'expm1', 'log', 'log2', 'log10', 'log1p', 'pow', 'cbrt', 'hypot', 'sinh', 'cosh', 'tanh'];

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // Deterministic core: same inputs must give the same state on every machine.
    files: ['packages/kernel/src/**/*.ts', 'packages/simulation/src/**/*.ts', 'packages/shared/src/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error',
        { name: 'Date', message: 'Wall clock is forbidden in the simulation.' },
        { name: 'performance', message: 'Wall clock is forbidden in the simulation.' },
        { name: 'window', message: 'No DOM in the simulation.' },
        { name: 'document', message: 'No DOM in the simulation.' },
        { name: 'setTimeout', message: 'Use simulation ticks.' },
        { name: 'setInterval', message: 'Use simulation ticks.' },
      ],
      'no-restricted-properties': ['error',
        ...FORBIDDEN_MATH.map((property) => ({ object: 'Math', property, message: 'Non-deterministic or transcendental Math is forbidden; use the engine RNG or balance/trig tables.' })),
      ],
    },
  },
);
