import { defineConfig } from 'vitest/config';
import path from 'path';

// Two test surfaces:
//   1. Node-side: scoring/ + runners/ — pure TS, no DOM. Existing.
//   2. Browser-side: app/ — React components rendered via happy-dom.
//
// Vitest picks the right `environment` per-file via the
// `environmentMatchGlobs` option so we don't have to fan out to multiple
// config files. The `app/**` tests get happy-dom; everything else stays
// on node.
//
// Coverage is v8 + restricted to `app/live/` so the report focuses on
// the file under test (LiveClient.tsx) rather than the entire app.

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  // Use the automatic JSX runtime so test files can render <Foo /> without
  // having to import React. Mirrors what Next.js does at build time.
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    include: [
      'runners/**/*.test.ts',
      'scoring/**/*.test.ts',
      'app/**/*.test.ts',
      'app/**/*.test.tsx',
    ],
    exclude: ['node_modules', 'infra/**', 'out', '.next'],
    environment: 'node',
    environmentMatchGlobs: [
      ['app/**', 'happy-dom'],
    ],
    globals: false,
    setupFiles: ['./app/__tests__/setup.ts'],
    reporters: process.env.CI ? 'dot' : 'default',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'json-summary'],
      include: ['app/live/**/*.{ts,tsx}'],
      exclude: [
        'app/live/**/*.test.{ts,tsx}',
        'app/live/page.tsx',
      ],
    },
  },
});
