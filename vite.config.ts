import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Relative base so the site works under any GitHub Pages sub-path.
export default defineConfig({
  base: './',
  plugins: [react()],
  test: { include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'] },
});
