// apps/api/test/global-setup.ts
import { execSync } from 'node:child_process'
import { garantirBancoDeTeste, URL_BANCO_TESTE } from './constantes'

export default function setup() {
  garantirBancoDeTeste(URL_BANCO_TESTE)
  // Só migrações pendentes. NUNCA "migrate reset" (destrutivo e bloqueado para agentes no Prisma 7).
  execSync('pnpm exec prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: URL_BANCO_TESTE },
  })
}
