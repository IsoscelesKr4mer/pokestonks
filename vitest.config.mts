import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    environmentMatchGlobs: [
      // Component tests run in happy-dom; everything else stays in node.
      ['**/*.test.tsx', 'happy-dom'],
      ['components/**/*.test.ts', 'happy-dom'],
    ],
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    exclude: ['node_modules', 'tests/e2e/**', '.next'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
      'server-only': resolve(__dirname, 'tests/mocks/server-only.ts'),
    },
  },
});
