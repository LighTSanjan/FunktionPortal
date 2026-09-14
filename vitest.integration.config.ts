import { defineConfig } from 'vitest/config'
import path from 'path'

/**
 * Integration tests: the real server actions, against a real Postgres with
 * every migration applied, real row-level security, real triggers and real
 * object storage — the throwaway self-hosted stack from
 * docker-compose.test.yml. Only the cookie lookup that tells the app who is
 * signed in is replaced, so the session, organisation and permission checks
 * that sit on top of it are the production code.
 *
 *   npm run test:integration
 *
 * They refuse to start against anything but localhost. The hosted database
 * holds real members' data and these tests truncate every table.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/test/integration/**/*.int.test.ts'],
    setupFiles: ['./src/test/integration/setup.ts'],
    // One database, shared state within a file, truncated between files.
    fileParallelism: false,
    pool: 'forks',
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'server-only': path.resolve(__dirname, './src/test/server-only-stub.ts'),
    },
  },
})
