import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const alias = { '@shared': here('./src/shared') };

// Two projects so server tests stay in plain Node (fast, real sockets) while
// React component tests get a DOM.
export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'node',
          environment: 'node',
          include: [
            'tests/unit/**/*.test.ts',
            'tests/integration/**/*.test.ts',
            'tests/acceptance/**/*.test.ts',
          ],
          // An integration test plays a whole game through real sockets, and
          // views are deliberately throttled to ten a second, so the default
          // five seconds is not enough.
          testTimeout: 60000,
          hookTimeout: 30000,
        },
      },
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: 'dom',
          environment: 'jsdom',
          globals: true,
          setupFiles: [here('./tests/setup-dom.ts')],
          include: ['src/client/**/*.test.ts', 'src/client/**/*.test.tsx'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/shared/**', 'src/server/**'],
      // The engine and the unit converters decide every number a student sees,
      // so they carry a line threshold. The rest of the app is covered by the
      // integration, simulation and end-to-end suites instead.
      thresholds: {
        'src/shared/engine/**': { lines: 95 },
        'src/shared/units.ts': { lines: 95 },
      },
    },
  },
});
