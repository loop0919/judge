import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  testIgnore: '**/account/**',
  fullyParallel: true,
  workers: 2,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  use: { baseURL: 'http://127.0.0.1:13000', trace: 'retain-on-failure' },
  webServer: [
    {
      command: 'bun tests/fixtures/public-api.mjs',
      url: 'http://127.0.0.1:18080/health',
      timeout: 120_000,
    },
    {
      command: 'bun .output/server/index.mjs',
      env: {
        HOST: '127.0.0.1', PORT: '13000',
        NUXT_API_BASE_URL: 'http://127.0.0.1:18080',
        NUXT_PUBLIC_SITE_URL: 'https://judge.example',
      },
      url: 'http://127.0.0.1:13000',
    },
    {
      command: 'bun tests/fixtures/failing-api.mjs',
      url: 'http://127.0.0.1:18081/health',
    },
    {
      command: 'bun .output/server/index.mjs',
      env: {
        HOST: '127.0.0.1', PORT: '13001',
        NUXT_API_BASE_URL: 'http://127.0.0.1:18081',
        NUXT_PUBLIC_SITE_URL: 'https://judge.example',
      },
      url: 'http://127.0.0.1:13001',
    },
  ],
})
