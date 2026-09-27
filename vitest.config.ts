import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**', 'server/**', 'shared/**'],
      exclude: [
        'server/test_parser.ts',
        'src/main.tsx',
        'src/vite-env.d.ts',
        '**/*.d.ts',
        '**/*.json',
        '**/*.css',
        '**/*.html',
        '**/*.db',
        '**/*.db-*',
      ],
      thresholds: {
        // Just under the measured coverage (2026-09-27: 93% lines, 91% statements, 92% functions, 81% branches).
        lines: 90,
        statements: 89,
        functions: 90,
        branches: 78,
      },
    },
  },
});
