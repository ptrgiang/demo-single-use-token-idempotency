import { cloudflarePool, cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

const workerOptions = { wrangler: { configPath: './wrangler.toml' } };

export default defineConfig({
  plugins: [cloudflareTest(workerOptions)],
  test: {
    include: ['tests/**/*.test.ts'],
    pool: cloudflarePool(workerOptions),
  },
});
