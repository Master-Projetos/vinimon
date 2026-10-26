import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { CookieSerializeOptions } from '@fastify/cookie'
import type { Config, EstadoSessao, Perfil } from '@vinimon/shared'
import { env } from '../env'
import { obterConfig } from './config'
import { prisma, type Tx } from './prisma'
import { type MotivoEncerramento, tempoReal } from './tempo-real'

export interface UsuarioSessao {
  id: number
  nome: string
  login: string
  perfil: Perfil
  areaId: number | null
  /** área primária + secundárias (escopo) */
  areaIds: number[]
  sessaoId: string
  estado: EstadoSessao
  mfaAtivo: boolean
  /** OPERADOR com `chamado.isolarAreas` desligado: vê chamados de todas as áreas (só vê; atender continua por área). Ausente = isolado. */
  verTodasAreas?: boolean
}

export type MotivoRevogacao =
  | 'logout'
  | 'inatividade'
  | 'troca_senha'
  | 'senha_redefinida'
  | 'usuario_desativado'
  | 'perfil_alterado'
  | 'mfa_alterado'
  | 'admin'
  | 'limite'
  | 'mfa_falhas'
  | 'encerrar_todas'

export const NOME_COOKIE = env.HTTPS ? '__Host-vinimon_sid' : 'vinimon_sid'
const MAX_SESSOES = 10
const PENDENTE_MS = 10 * 60_000
const TOQUE_MS = 60_000
const TOKEN = /^[A-Za-z0-9_-]{43}$/
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex')
const novoToken = () => randomBytes(32).toString('base64url')
const motivoSocket = (m: MotivoRevogacao): MotivoEncerramento =>
  m === 'logout'
    ? 'logout'
    : m === 'inatividade'
      ? 'expirada'
      : m === 'usuario_desativado'
        ? 'usuario_desativado'
        : 'revogada'

export function csrfDaSessao(sessaoId: string): string {
  return createHmac('sha256', Buffer.from(env.CSRF_SECRET, 'base64')).update(sessaoId).digest('base64url')
}
export function csrfValido(recebido: string, sessaoId: string): boolean {
  const esperado = Buffer.from(csrfDaSessao(sessaoId))
  const r = Buffer.from(recebido)
  return r.length === esperado.length && timingSafeEqual(r, esperado)
}

async function expiracao(estado: EstadoSessao, agora: Date): Promise<Date> {
  if (estado !== 'ATIVA') return new Date(agora.getTime() + PENDENTE_MS)
  const cfg = await obterConfig()
  return new Date(agora.getTime() + cfg['sessao.horasAbsoluta'] * 3_600_000)
}

export async function criarSessao(
  d: { usuarioId: number; estado: EstadoSessao; ip: string | null; userAgent: string | null },
  agora = new Date(),
) {
  const token = novoToken()
  const expiraEm = await expiracao(d.estado, agora)
  const r = await prisma.$transaction(async (tx) => {
    const criada = await tx.sessao.create({
      data: {
        usuarioId: d.usuarioId,
        tokenHash: sha256(token),
        estado: d.estado,
        expiraEm,
        ultimoUsoEm: agora,
        ip: d.ip,
        userAgent: d.userAgent?.slice(0, 256) ?? null,
      },
      select: { id: true },
    })
    const ativas = await tx.sessao.findMany({
      where: { usuarioId: d.usuarioId, revogadaEm: null, expiraEm: { gt: agora } },
      orderBy: { criadaEm: 'desc' },
      select: { id: true },
    })
    const excedentes = ativas.slice(MAX_SESSOES).map((s) => s.id)
    if (excedentes.length > 0) {
      await tx.sessao.updateMany({
        where: { id: { in: excedentes } },
        data: { revogadaEm: agora, motivoRevogacao: 'limite' },
      })
    }
    return { sessaoId: criada.id, excedentes }
  })
  for (const id of r.excedentes) tempoReal.encerrarSessao(id, 'revogada')
  return { sessaoId: r.sessaoId, token, expiraEm }
}

/** Fim do MFA / troca de senha: NOVO token na mesma linha (o csrf não muda: depende do id). */
export async function promoverSessao(sessaoId: string, estado: EstadoSessao, agora = new Date()) {
  const token = novoToken()
  const expiraEm = await expiracao(estado, agora)
  await prisma.sessao.update({
    where: { id: sessaoId },
    data: { tokenHash: sha256(token), estado, expiraEm, ultimoUsoEm: agora },
  })
  return { token, expiraEm }
}

/** Passo 2 da T-13.2: só o OPERADOR é afetado; USUARIO segue no próprio escopo e ADMIN já vê tudo. */
export function verTodasAreas(perfil: Perfil, cfg: Config): boolean {
  return perfil === 'OPERADOR' && !cfg['chamado.isolarAreas']
}

export async function carregarSessao(
  token: string | undefined,
  opcoes: { tocar?: boolean } = {},
): Promise<UsuarioSessao | null> {
  if (token === undefined || !TOKEN.test(token)) return null
  const agora = new Date()
  const s = await prisma.sessao.findUnique({
    where: { tokenHash: sha256(token) },
    select: {
      id: true,
      estado: true,
      expiraEm: true,
      ultimoUsoEm: true,
      revogadaEm: true,
      usuario: {
        select: {
          id: true,
          nome: true,
          login: true,
          perfil: true,
          areaId: true,
          ativo: true,
          mfaAtivadoEm: true,
          areasSecundarias: { select: { areaId: true } },
        },
      },
    },
  })
  if (!s || s.revogadaEm !== null || s.expiraEm.getTime() <= agora.getTime() || !s.usuario.ativo) return null
  const cfg = await obterConfig()
  const limite = s.estado === 'ATIVA' ? cfg['sessao.minutosInatividade'] * 60_000 : PENDENTE_MS
  const ocioso = agora.getTime() - s.ultimoUsoEm.getTime()
  if (ocioso > limite) {
    await revogarSessao(s.id, 'inatividade')
    return null
  }
  if ((opcoes.tocar ?? true) && ocioso > TOQUE_MS) {
    await prisma.sessao.update({ where: { id: s.id }, data: { ultimoUsoEm: agora } })
  }
  const u = s.usuario
  const secundarias = u.areasSecundarias.map((a) => a.areaId)
  return {
    id: u.id,
    nome: u.nome,
    login: u.login,
    perfil: u.perfil,
    areaId: u.areaId,
    areaIds: u.areaId === null ? secundarias : [u.areaId, ...secundarias],
    sessaoId: s.id,
    estado: s.estado,
    mfaAtivo: u.mfaAtivadoEm !== null,
    verTodasAreas: verTodasAreas(u.perfil, cfg),
  }
}

/** Revoga uma sessão e derruba os sockets dela (fora de transação). */
export async function revogarSessao(id: string, motivo: MotivoRevogacao): Promise<void> {
  await prisma.sessao.updateMany({
    where: { id, revogadaEm: null },
    data: { revogadaEm: new Date(), motivoRevogacao: motivo },
  })
  tempoReal.encerrarSessao(id, motivoSocket(motivo))
}

/** Dentro de transação: só grava. Depois do commit chame desconectarSessoes(ids, motivo). */
export async function revogarSessoesDoUsuario(
  tx: Tx,
  usuarioId: number,
  motivo: MotivoRevogacao,
  exceto?: string,
): Promise<string[]> {
  const alvo = await tx.sessao.findMany({
    where: { usuarioId, revogadaEm: null, ...(exceto ? { id: { not: exceto } } : {}) },
    select: { id: true },
  })
  const ids = alvo.map((s) => s.id)
  if (ids.length > 0)
    await tx.sessao.updateMany({
      where: { id: { in: ids } },
      data: { revogadaEm: new Date(), motivoRevogacao: motivo },
    })
  return ids
}
export function desconectarSessoes(ids: readonly string[], motivo: MotivoRevogacao): void {
  for (const id of ids) tempoReal.encerrarSessao(id, motivoSocket(motivo))
}

export function opcoesCookie(expiraEm: Date): CookieSerializeOptions {
  return {
    path: '/',
    httpOnly: true,
    secure: env.HTTPS,
    sameSite: 'strict',
    maxAge: Math.max(0, Math.floor((expiraEm.getTime() - Date.now()) / 1000)),
  }
}
export const opcoesLimparCookie = (): CookieSerializeOptions => ({
  path: '/',
  httpOnly: true,
  secure: env.HTTPS,
  sameSite: 'strict',
})
