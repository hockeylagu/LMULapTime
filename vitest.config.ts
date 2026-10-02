import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: [
            'test/server/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
            'test/domain/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
            'test/utils/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
            'test/api/**/*.{test,spec}.ts',
          ],
        },
      },
      {
        test: {
          name: 'dom',
          environment: 'jsdom',
          pool: 'vmThreads',
          include: [
            'test/components/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
            'test/**/*.test.tsx',
          ],
          setupFiles: ['./test/setup.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}', 'server/**/*.ts', 'shared/**/*.ts'],
      exclude: [
        'server/test_parser.ts',
        'src/main.tsx',
        '**/*.d.ts',
      ],
      thresholds: {
        // Just under the measured coverage (2026-09-27: 93% lines, 91% statements, 92% functions, 81% branches).
        lines: 90,
        statements: 90,
        functions: 90,
        branches: 80,
      },
    },
  },
});
