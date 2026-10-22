// apps/api/test/ajudantes.ts
import { CSRF_HEADER, type EstadoSessao, type Perfil } from '@vinimon/shared'
import { env } from '../src/env'
import { Prisma } from '../src/generated/prisma/client'
import { invalidarConfig } from '../src/lib/config'
import { cifrar } from '../src/lib/cripto'
import { prisma } from '../src/lib/prisma'
import { hashSenha } from '../src/lib/senha'
import { criarSessao, csrfDaSessao, NOME_COOKIE } from '../src/lib/sessao'
import { gerarCodigosRecuperacao, gerarSegredo, hashCodigo } from '../src/lib/totp'

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

/** Cabeçalhos de um usuário com sessão no estado pedido (direto no banco, sem passar pelo login/rate limit). */
export async function headersDe(usuarioId: number, estado: EstadoSessao = 'ATIVA') {
  const { sessaoId, token } = await criarSessao({ usuarioId, estado, ip: '127.0.0.1', userAgent: 'vitest' })
  return { cookie: `${NOME_COOKIE}=${token}`, origin: ORIGEM, [CSRF_HEADER]: csrfDaSessao(sessaoId) }
}

/** Cadastra o 2FA direto no banco. Devolve o segredo (para gerar códigos com otplib) e os códigos de recuperação. */
export async function ativarMfa(usuarioId: number) {
  const secret = gerarSegredo()
  const codigos = gerarCodigosRecuperacao()
  await prisma.usuario.update({
    where: { id: usuarioId },
    data: { totpSecretEnc: cifrar(secret), mfaAtivadoEm: new Date() },
  })
  await prisma.codigoRecuperacao.createMany({ data: codigos.map((c) => ({ usuarioId, codigoHash: hashCodigo(c) })) })
  return { secret, codigos }
}

/** Extrai o token do cookie de uma resposta de login/2FA/troca de senha. */
export function tokenDoCookie(res: { headers: Record<string, unknown> }): string {
  const sc = res.headers['set-cookie']
  const linha = String((Array.isArray(sc) ? sc[0] : sc) ?? '')
  return /=([^;]+)/.exec(linha)?.[1] ?? ''
}

/** Cabeçalhos para continuar uma sessão a partir do cookie e do csrf devolvidos pelo login. */
export const headersComToken = (token: string, csrf: string) => ({
  cookie: `${NOME_COOKIE}=${token}`,
  origin: ORIGEM,
  [CSRF_HEADER]: csrf,
})
