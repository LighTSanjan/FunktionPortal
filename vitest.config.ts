import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Register control-total tests under prisma/data must run in CI too.
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'prisma/**/*.{test,spec}.{ts,tsx}'],
    // Integration tests need the throwaway database stack and their own
    // setup; they run under vitest.integration.config.ts, never here.
    exclude: ['**/node_modules/**', 'src/test/integration/**'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/test/**', 'src/**/*.d.ts'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Keep the production guard while allowing direct server-module tests.
      'server-only': path.resolve(__dirname, './src/test/server-only-stub.ts'),
    },
  },
})
