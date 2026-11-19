import { defineConfig } from 'vitest/config';

/** Tests run against a real grapesjs editor in jsdom (no layout: rects are stubbed per test). */
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    globals: false,
    restoreMocks: true,
    css: false,
  },
});
