import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // The integration tests drive the whole app through MSW; give them room when
    // every test file runs in parallel on a busy machine.
    testTimeout: 20_000,
  },
});
