import { defineConfig } from '@playwright/test'

if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is required')

export default defineConfig({
  testDir: './tests/account', outputDir: './test-results-account', workers: 1, retries: 0,
  use: { baseURL: 'http://127.0.0.1:13002', trace: 'retain-on-failure' },
  webServer: [
    {
      command: 'go test ./internal/httpapi -run ^TestBrowserFixture$ -timeout 0 -count=1', cwd: '../api',
      env: { OPENOJ_BROWSER_TEST: '1', TEST_DATABASE_URL: process.env.TEST_DATABASE_URL },
      url: 'http://127.0.0.1:18082/health', timeout: 120000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10000 },
    },
    {
      command: 'bun .output/server/index.mjs',
      env: { HOST: '127.0.0.1', PORT: '13002', NUXT_API_BASE_URL: 'http://127.0.0.1:18082', NUXT_PUBLIC_SITE_URL: 'http://127.0.0.1:13002', NUXT_COGNITO_DOMAIN: 'https://example.auth.ap-northeast-1.amazoncognito.com', NUXT_COGNITO_CLIENT_ID: 'browser-client', NUXT_COGNITO_CLIENT_SECRET: 'browser-secret' },
      url: 'http://127.0.0.1:13002',
    },
  ],
})
