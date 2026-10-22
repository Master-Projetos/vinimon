import type { SessaoResposta, Verificar2faBody } from '@vinimon/shared'
import { auditar } from '../../lib/auditoria'
import { obterConfig } from '../../lib/config'
import type { ContextoUsuario } from '../../lib/contexto'
import { cifrar, decifrar } from '../../lib/cripto'
import { conflito, ErroApp, semPermissao } from '../../lib/erros'
import { prisma } from '../../lib/prisma'
import { verificarSenha } from '../../lib/senha'
import {
  csrfDaSessao,
  desconectarSessoes,
  promoverSessao,
  revogarSessao,
  revogarSessoesDoUsuario,
} from '../../lib/sessao'
import { gerarCodigosRecuperacao, gerarSegredo, hashCodigo, uriOtpauth, verificarCodigo } from '../../lib/totp'
import { estadoAposMfa, estadoAposTrocaSenha } from './estados'
import { obterUsuarioMe } from './service'

const MAX_FALHAS_MFA = 5
const codigoInvalido = () => new ErroApp(401, 'NAO_AUTENTICADO', 'Código inválido ou já utilizado.')

export interface SessaoPromovida {
  resposta: SessaoResposta
  token: string
  expiraEm: Date
}

async function respostaDe(
  usuarioId: number,
  estado: SessaoResposta['estado'],
  sessaoId: string,
): Promise<SessaoResposta> {
  return { estado, csrf: csrfDaSessao(sessaoId), usuario: estado === 'ATIVA' ? await obterUsuarioMe(usuarioId) : null }
}

/** Conta a falha na sessão e em falhas_login; na 5ª revoga a sessão pendente (S28). */
async function registrarFalhaMfa(ctx: ContextoUsuario, acao: string): Promise<never> {
  const s = await prisma.sessao.update({
    where: { id: ctx.usuario.sessaoId },
    data: { falhasMfa: { increment: 1 } },
    select: { falhasMfa: true },
  })
  await prisma.$transaction(async (tx) => {
    await tx.falhaLogin.create({ data: { loginNormalizado: ctx.usuario.login, ip: ctx.ip ?? 'desconhecido' } })
    await auditar(tx, ctx, { acao, entidade: 'usuario', entidadeId: ctx.usuario.id, dados: { falhas: s.falhasMfa } })
  })
  if (s.falhasMfa >= MAX_FALHAS_MFA) await revogarSessao(ctx.usuario.sessaoId, 'mfa_falhas')
  throw codigoInvalido()
}

/** POST /auth/2fa/verificar: sessão PENDENTE_MFA → próximo estado, com token novo (S19). */
export async function verificar2fa(corpo: Verificar2faBody, ctx: ContextoUsuario): Promise<SessaoPromovida> {
  const u = await prisma.usuario.findUniqueOrThrow({
    where: { id: ctx.usuario.id },
    select: {
      id: true,
      perfil: true,
      deveTrocarSenha: true,
      mfaAtivadoEm: true,
      totpSecretEnc: true,
      totpUltimoPasso: true,
    },
  })
  if (!u.totpSecretEnc) throw new ErroApp(400, 'REQUISICAO_INVALIDA', 'Este usuário não tem 2FA cadastrado.')

  let passo: number | null = null
  if ('codigo' in corpo) {
    const r = await verificarCodigo(decifrar(u.totpSecretEnc), corpo.codigo, u.totpUltimoPasso)
    if (!r.valido) return registrarFalhaMfa(ctx, 'mfa.falha')
    passo = r.passo
  } else {
    const usado = await prisma.codigoRecuperacao.updateMany({
      where: { usuarioId: u.id, codigoHash: hashCodigo(corpo.codigoRecuperacao), usadoEm: null },
      data: { usadoEm: new Date() },
    })
    if (usado.count !== 1) return registrarFalhaMfa(ctx, 'mfa.falha')
  }

  const estado = estadoAposMfa(u)
  await prisma.$transaction(async (tx) => {
    if (passo !== null) {
      // Atualização condicional: dois pedidos simultâneos com o mesmo código não passam os dois.
      const gravado = await tx.usuario.updateMany({
        where: { id: u.id, OR: [{ totpUltimoPasso: null }, { totpUltimoPasso: { lt: passo } }] },
        data: { totpUltimoPasso: passo },
      })
      if (gravado.count !== 1) throw codigoInvalido()
    }
    if (estado === 'ATIVA') await tx.usuario.update({ where: { id: u.id }, data: { ultimoLoginEm: new Date() } })
    await auditar(tx, ctx, {
      acao: passo === null ? 'mfa.recuperacaoUsada' : 'mfa.verificado',
      entidade: 'usuario',
      entidadeId: u.id,
    })
  })
  const nova = await promoverSessao(ctx.usuario.sessaoId, estado)
  return { resposta: await respostaDe(u.id, estado, ctx.usuario.sessaoId), ...nova }
}

/** POST /auth/2fa/iniciar: gera um segredo pendente. Quem já tem 2FA não recadastra (reset é do admin, S31). */
export async function iniciar2fa(ctx: ContextoUsuario): Promise<{ otpauthUri: string; segredo: string }> {
  const u = await prisma.usuario.findUniqueOrThrow({ where: { id: ctx.usuario.id }, select: { mfaAtivadoEm: true } })
  if (u.mfaAtivadoEm) throw conflito('O 2FA já está ativo. Para trocar de aparelho, peça o reset a um administrador.')
  const segredo = gerarSegredo()
  await prisma.usuario.update({ where: { id: ctx.usuario.id }, data: { totpSecretPendenteEnc: cifrar(segredo) } })
  const cfg = await obterConfig()
  return { segredo, otpauthUri: uriOtpauth({ issuer: cfg['sistema.nome'], label: ctx.usuario.login, secret: segredo }) }
}

/** POST /auth/2fa/confirmar: ativa o 2FA, devolve os códigos de recuperação uma única vez e revoga as outras sessões. */
export async function confirmar2fa(codigo: string, ctx: ContextoUsuario) {
  const u = await prisma.usuario.findUniqueOrThrow({
    where: { id: ctx.usuario.id },
    select: { id: true, perfil: true, mfaAtivadoEm: true, totpSecretPendenteEnc: true },
  })
  if (u.mfaAtivadoEm) throw conflito('O 2FA já está ativo.')
  if (!u.totpSecretPendenteEnc)
    throw new ErroApp(400, 'REQUISICAO_INVALIDA', 'Inicie o cadastro do 2FA antes de confirmar.')
  const r = await verificarCodigo(decifrar(u.totpSecretPendenteEnc), codigo, null)
  if (!r.valido) return registrarFalhaMfa(ctx, 'mfa.confirmacao_falha')

  const codigos = gerarCodigosRecuperacao()
  const revogadas = await prisma.$transaction(async (tx) => {
    await tx.usuario.update({
      where: { id: u.id },
      data: {
        totpSecretEnc: u.totpSecretPendenteEnc,
        totpSecretPendenteEnc: null,
        mfaAtivadoEm: new Date(),
        totpUltimoPasso: r.passo,
      },
    })
    await tx.codigoRecuperacao.deleteMany({ where: { usuarioId: u.id } })
    await tx.codigoRecuperacao.createMany({
      data: codigos.map((c) => ({ usuarioId: u.id, codigoHash: hashCodigo(c) })),
    })
    await auditar(tx, ctx, { acao: 'mfa.ativado', entidade: 'usuario', entidadeId: u.id })
    return revogarSessoesDoUsuario(tx, u.id, 'mfa_alterado', ctx.usuario.sessaoId)
  })
  desconectarSessoes(revogadas, 'mfa_alterado')
  const estado = estadoAposTrocaSenha({ perfil: u.perfil, deveTrocarSenha: false, mfaAtivadoEm: new Date() })
  const nova = await promoverSessao(ctx.usuario.sessaoId, estado)
  return { codigos, resposta: await respostaDe(u.id, estado, ctx.usuario.sessaoId), ...nova }
}

async function exigirSenha(usuarioId: number, senha: string): Promise<void> {
  const u = await prisma.$queryRaw<
    { senha_hash: string | null }[]
  >`SELECT senha_hash FROM usuarios WHERE id = ${usuarioId}`
  const { ok } = await verificarSenha(senha, u[0]?.senha_hash ?? null)
  if (!ok) throw new ErroApp(400, 'VALIDACAO', 'Senha incorreta.', [{ campo: 'senha', mensagem: 'Senha incorreta.' }])
}

/** POST /auth/2fa/codigos: gera 10 códigos novos e invalida os anteriores (S30). */
export async function novosCodigos(senha: string, ctx: ContextoUsuario): Promise<string[]> {
  const u = await prisma.usuario.findUniqueOrThrow({ where: { id: ctx.usuario.id }, select: { mfaAtivadoEm: true } })
  if (!u.mfaAtivadoEm)
    throw new ErroApp(400, 'REQUISICAO_INVALIDA', 'Ative o 2FA antes de gerar códigos de recuperação.')
  await exigirSenha(ctx.usuario.id, senha)
  const codigos = gerarCodigosRecuperacao()
  await prisma.$transaction(async (tx) => {
    await tx.codigoRecuperacao.deleteMany({ where: { usuarioId: ctx.usuario.id } })
    await tx.codigoRecuperacao.createMany({
      data: codigos.map((c) => ({ usuarioId: ctx.usuario.id, codigoHash: hashCodigo(c) })),
    })
    await auditar(tx, ctx, { acao: 'mfa.codigos_regenerados', entidade: 'usuario', entidadeId: ctx.usuario.id })
  })
  return codigos
}

/** POST /auth/2fa/desativar: só USUARIO; a equipe tem 2FA obrigatório (S26). */
export async function desativar2fa(senha: string, codigo: string, ctx: ContextoUsuario): Promise<void> {
  if (ctx.usuario.perfil !== 'USUARIO')
    throw semPermissao('O 2FA é obrigatório para a equipe e só pode ser resetado por um administrador.')
  const u = await prisma.usuario.findUniqueOrThrow({
    where: { id: ctx.usuario.id },
    select: { mfaAtivadoEm: true, totpSecretEnc: true, totpUltimoPasso: true },
  })
  if (!u.mfaAtivadoEm || !u.totpSecretEnc) throw new ErroApp(400, 'REQUISICAO_INVALIDA', 'O 2FA não está ativo.')
  await exigirSenha(ctx.usuario.id, senha)
  const r = await verificarCodigo(decifrar(u.totpSecretEnc), codigo, u.totpUltimoPasso)
  if (!r.valido)
    throw new ErroApp(400, 'VALIDACAO', 'Código inválido ou já utilizado.', [
      { campo: 'codigo', mensagem: 'Código inválido ou já utilizado.' },
    ])
  const revogadas = await prisma.$transaction(async (tx) => {
    await tx.usuario.update({
      where: { id: ctx.usuario.id },
      data: { totpSecretEnc: null, totpSecretPendenteEnc: null, mfaAtivadoEm: null, totpUltimoPasso: null },
    })
    await tx.codigoRecuperacao.deleteMany({ where: { usuarioId: ctx.usuario.id } })
    await auditar(tx, ctx, { acao: 'mfa.removido', entidade: 'usuario', entidadeId: ctx.usuario.id })
    return revogarSessoesDoUsuario(tx, ctx.usuario.id, 'mfa_alterado', ctx.usuario.sessaoId)
  })
  desconectarSessoes(revogadas, 'mfa_alterado')
}
