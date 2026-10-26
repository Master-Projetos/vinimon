import { expect } from '@playwright/test'
import { totp } from './totp'

/** Porta da API nos E2E. Mude com `E2E_PORTA` (e `E2E_BANCO`) para rodar dois conjuntos de specs ao mesmo tempo. */
export const PORTA_E2E = process.env.E2E_PORTA ?? '3100'
/** Banco do E2E; o preparo só aceita nomes terminados em `_e2e`. */
export const BANCO_E2E = process.env.E2E_BANCO ?? 'vinimon_e2e'
/** Origem do build servido pela API nos testes E2E (ver playwright.config.ts). */
export const ORIGEM_E2E = `http://localhost:${PORTA_E2E}`
/** Senha do primeiro acesso do admin, semeada por apps/api/scripts/e2e-preparar.ts. */
export const SENHA_ADMIN_E2E = process.env.SEED_ADMIN_PASSWORD ?? 'Girafa-Satelite-Pinhao-7731'
/** Senha nova que o admin define no primeiro acesso (T68). */
export const NOVA_SENHA_ADMIN_E2E = 'Pelicano-Violino-Nuvem-8842'
/** Senha dos usuários de teste (operador, usuario, usuario-t72). */
export const E2E_SENHA = process.env.E2E_SENHA ?? 'Cavalo-Bateria-Grampo-2026'
/** Segredo TOTP fixo dos usuários de teste, em base32. */
export const E2E_TOTP_SECRET = process.env.E2E_TOTP_SECRET ?? 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'

/** Passo de 30 s atual (RFC 6238). */
export const passoAtual = (): number => Math.floor(Date.now() / 30_000)

/**
 * Código TOTP de um passo posterior a `passoUsado` (anti-replay: o servidor recusa o mesmo passo duas vezes).
 * Espera o passo virar quando preciso.
 */
export async function codigoNovoPasso(segredo: string, passoUsado: number): Promise<{ codigo: string; passo: number }> {
  await expect.poll(passoAtual, { timeout: 31_000 }).toBeGreaterThan(passoUsado)
  return { codigo: totp(segredo), passo: passoAtual() }
}

/** Chaves fixas só dos testes (não são segredos reais); a API do webServer e o preparo do banco usam as mesmas. */
export const CSRF_SECRET_E2E = 'ZGV2LWFwZW5hcy10cm9xdWUtZW0tcHJvZHVjYW8tMDAwMQ=='
export const ENCRYPTION_KEY_E2E = 'ZGV2LWFwZW5hcy10cm9xdWUtZW0tcHJvZHVjYW8tMDE='
