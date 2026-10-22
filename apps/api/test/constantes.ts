// apps/api/test/constantes.ts
import { existsSync } from 'node:fs'

if (existsSync('.env')) process.loadEnvFile('.env')

export const URL_BANCO_TESTE =
  process.env.DATABASE_URL_TESTE ?? 'postgresql://vinimon:vinimon@localhost:5432/vinimon_test'

export function garantirBancoDeTeste(url: string): void {
  if (!new URL(url).pathname.endsWith('_test'))
    throw new Error(`O banco de teste precisa terminar em _test (recebido: ${url})`)
}
