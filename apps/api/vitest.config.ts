// apps/api/vitest.config.ts
import { defineConfig } from 'vitest/config'
import { garantirBancoDeTeste, URL_BANCO_TESTE } from './test/constantes'

garantirBancoDeTeste(URL_BANCO_TESTE)

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts', 'scripts/**/*.test.ts'],
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/setup.ts'],
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: URL_BANCO_TESTE,
      APP_ORIGIN: 'http://localhost:5173',
      TRUST_PROXY: 'false',
      CSRF_SECRET: 'ZGV2LWFwZW5hcy10cm9xdWUtZW0tcHJvZHVjYW8tMDAwMQ==',
      ENCRYPTION_KEY: 'ZGV2LWFwZW5hcy10cm9xdWUtZW0tcHJvZHVjYW8tMDE=',
      UPLOAD_DIR: './storage/teste',
      LOG_LEVEL: 'silent',
      API_DOCS: 'false',
      JOBS_HABILITADOS: 'false',
    },
  },
})
