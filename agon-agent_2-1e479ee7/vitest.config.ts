import { defineConfig } from 'vitest/config';

// Tests for the desktop UI. Domain and data tests run in plain Node; UI tests
// opt into a simulated DOM with a `@vitest-environment jsdom` comment.
// No browser, Tauri runtime or network is required.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
