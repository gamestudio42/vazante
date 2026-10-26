import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
  server: {
    headers: {
      // Cross-origin isolation enables SharedArrayBuffer for the horde buffer (v0.5).
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
