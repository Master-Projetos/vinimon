// apps/api/test/ajudantes.ts
import { CSRF_HEADER, type Perfil } from '@vinimon/shared'
import { env } from '../src/env'
import { Prisma } from '../src/generated/prisma/client'
import { invalidarConfig } from '../src/lib/config'
import { prisma } from '../src/lib/prisma'
import { hashSenha } from '../src/lib/senha'
import { criarSessao, csrfDaSessao, NOME_COOKIE } from '../src/lib/sessao'

export const ORIGEM = env.APP_ORIGIN
export const SENHA_TESTE = 'Cavalo-Bateria-Grampo-2026'
let hashTeste: Promise<string> | undefined
let sequencia = 0

/** Esvazia o schema public (pgboss intocado). Tabelas validadas por regex antes do Prisma.raw. */
export async function limparBanco(): Promise<void> {
  const tabelas = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
  const nomes = tabelas.map((t) => t.tablename).filter((n) => /^[a-z_][a-z0-9_]*$/.test(n))
  if (nomes.length > 0) {
    const lista = nomes.map((n) => `"public"."${n}"`).join(', ')
    await prisma.$executeRaw`TRUNCATE TABLE ${Prisma.raw(lista)} RESTART IDENTITY CASCADE`
  }
  invalidarConfig()
}

export async function criarArea(dados: { nome?: string; atende?: boolean } = {}) {
  sequencia += 1
  return prisma.area.create({
    data: { nome: dados.nome ?? `Área ${sequencia}`, atende: dados.atende ?? true },
    select: { id: true },
  })
}

export async function criarUsuario(d: { perfil: Perfil; areaId?: number | null; ativo?: boolean }) {
  sequencia += 1
  hashTeste ??= hashSenha(SENHA_TESTE) // um hash por execução (argon2 é caro de propósito)
  const areaId = d.areaId !== undefined ? d.areaId : d.perfil === 'OPERADOR' ? (await criarArea()).id : null
  return prisma.usuario.create({
    data: {
      login: `usuario${sequencia}`,
      nome: `Usuário ${sequencia}`,
      email: `usuario${sequencia}@teste.local`,
      senhaHash: await hashTeste,
      perfil: d.perfil,
      areaId,
      ativo: d.ativo ?? true,
    },
    select: { id: true, login: true, perfil: true, areaId: true },
  })
}

/** Cabeçalhos de um usuário com sessão ATIVA (direto no banco, sem passar pelo login/rate limit). */
export async function headersDe(usuarioId: number) {
  const { sessaoId, token } = await criarSessao({ usuarioId, estado: 'ATIVA', ip: '127.0.0.1', userAgent: 'vitest' })
  return { cookie: `${NOME_COOKIE}=${token}`, origin: ORIGEM, [CSRF_HEADER]: csrfDaSessao(sessaoId) }
}
