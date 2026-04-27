import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    // Default to node. Component tests opt into happy-dom via the per-file
    // `// @vitest-environment happy-dom` directive (see Plan 3 task spec).
    environment: 'node',
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
