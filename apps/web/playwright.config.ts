import { defineConfig, devices } from '@playwright/test'
import { E2E_SENHA, E2E_TOTP_SECRET, ORIGEM_E2E, SENHA_ADMIN_E2E } from './e2e/ajudantes'

// A API serve o build do web (WEB_DIST_DIR) no banco vinimon_e2e, em http://localhost:3100.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: ORIGEM_E2E,
    trace: 'retain-on-failure',
    // Opcional: caminho de um Chromium já instalado (ambiente sem `playwright install`). Sem a variável, usa o do Playwright.
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined },
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      testIgnore: /auth\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
  ],
  webServer: {
    cwd: '../api',
    command:
      'pnpm -F @vinimon/web build && pnpm -F @vinimon/api build && pnpm exec tsx scripts/e2e-preparar.ts && node dist/server.mjs',
    url: 'http://localhost:3100/api/v1/saude/pronto',
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: '3100',
      APP_ORIGIN: ORIGEM_E2E,
      WEB_DIST_DIR: '../web/dist',
      UPLOAD_DIR: './storage/e2e',
      DATABASE_URL: 'postgresql://vinimon:vinimon@localhost:5432/vinimon_e2e',
      TRUST_PROXY: 'false',
      API_DOCS: 'false',
      LOG_LEVEL: 'warn',
      JOBS_HABILITADOS: 'false',
      SOCKET_REVALIDAR_MS: '1000',
      CSRF_SECRET: 'ZGV2LWFwZW5hcy10cm9xdWUtZW0tcHJvZHVjYW8tMDAwMQ==',
      ENCRYPTION_KEY: 'ZGV2LWFwZW5hcy10cm9xdWUtZW0tcHJvZHVjYW8tMDE=',
      SEED_ADMIN_PASSWORD: SENHA_ADMIN_E2E,
      E2E_SENHA,
      E2E_TOTP_SECRET,
    },
  },
})
