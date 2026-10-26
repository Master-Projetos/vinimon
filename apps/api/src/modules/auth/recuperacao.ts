import { createHash, randomBytes } from 'node:crypto'
import type { EsqueciSenhaBody, RedefinirSenhaBody } from '@vinimon/shared'
import { env } from '../../env'
import { auditar } from '../../lib/auditoria'
import { obterConfig } from '../../lib/config'
import type { Contexto } from '../../lib/contexto'
import { despacharEmail, enfileirarEmail } from '../../lib/email'
import { ErroApp } from '../../lib/erros'
import { validarNovaSenha } from '../../lib/forca-senha'
import { prisma } from '../../lib/prisma'
import { hashSenha } from '../../lib/senha'
import { desconectarSessoes, revogarSessoesDoUsuario } from '../../lib/sessao'

export const MENSAGEM_ESQUECI = 'Se o login existir, enviaremos instruções'
const VALIDADE_MS = 30 * 60_000

const hashDoToken = (token: string) => createHash('sha256').update(token).digest('hex')
const linkInvalido = () => new ErroApp(400, 'REQUISICAO_INVALIDA', 'Link inválido ou expirado')

/** GET /auth/recuperacao: só a chave `email.habilitado`, para a tela anônima de login decidir o link. */
export async function recuperacaoHabilitada(): Promise<{ habilitada: boolean }> {
  const cfg = await obterConfig()
  return { habilitada: cfg['email.habilitado'] === true }
}

/**
 * POST /auth/esqueci-senha (SEN-10). A resposta é a mesma para qualquer login: este código nunca sinaliza
 * se o usuário existe. Só envia para usuário ativo, com e-mail, e com `email.habilitado` ligado.
 */
export async function solicitar(corpo: EsqueciSenhaBody, ctx: Contexto): Promise<void> {
  const cfg = await obterConfig()
  const u = await prisma.usuario.findUnique({
    where: { login: corpo.login },
    select: { id: true, ativo: true, email: true, nome: true },
  })
  if (!cfg['email.habilitado'] || !u?.ativo || !u.email) return
  const email = u.email

  const token = randomBytes(32).toString('base64url')
  const link = `${env.APP_ORIGIN}/redefinir-senha?token=${token}`
  const tokenHash = hashDoToken(token)
  const emailId = await prisma.$transaction(async (tx) => {
    await tx.tokenSenha.updateMany({ where: { usuarioId: u.id, usadoEm: null }, data: { usadoEm: new Date() } })
    await tx.tokenSenha.create({
      data: { usuarioId: u.id, tokenHash, expiraEm: new Date(Date.now() + VALIDADE_MS), ip: ctx.ip },
    })
    await auditar(tx, ctx, { acao: 'senha.recuperacao_solicitada', entidade: 'usuario', entidadeId: u.id })
    return enfileirarEmail(tx, {
      para: email,
      assunto: 'Redefinição de senha',
      texto: [
        `Olá, ${u.nome}.`,
        '',
        'Recebemos um pedido para redefinir a sua senha. Use o link abaixo em até 30 minutos:',
        link,
        '',
        'Se você não fez este pedido, ignore esta mensagem: sua senha continua a mesma.',
      ].join('\n'),
      evento: 'RECUPERAR_SENHA',
      usuarioId: u.id,
      chaveIdempotencia: `recuperar-senha:${tokenHash}`,
    })
  })
  await despacharEmail(emailId)
}

/** POST /auth/redefinir-senha: uso único; troca a senha e revoga todas as sessões na mesma transação (S20). */
export async function redefinir(corpo: RedefinirSenhaBody, ctx: Contexto): Promise<void> {
  const tokenHash = hashDoToken(corpo.token)
  const t = await prisma.tokenSenha.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      usadoEm: true,
      expiraEm: true,
      usuario: { select: { id: true, ativo: true, login: true, nome: true, email: true } },
    },
  })
  if (!t || t.usadoEm !== null || t.expiraEm <= new Date() || !t.usuario.ativo) throw linkInvalido()
  const u = t.usuario

  const [atual] = await prisma.$queryRaw<
    { senha_hash: string | null }[]
  >`SELECT senha_hash FROM usuarios WHERE id = ${u.id}`
  const cfg = await obterConfig()
  await validarNovaSenha(
    corpo.novaSenha,
    { login: u.login, nome: u.nome, email: u.email, organizacao: cfg['sistema.organizacao'] },
    atual?.senha_hash ?? null,
  )
  const novoHash = await hashSenha(corpo.novaSenha) // fora da transação (custo de CPU)

  const revogadas = await prisma.$transaction(async (tx) => {
    const usado = await tx.tokenSenha.updateMany({
      where: { id: t.id, usadoEm: null, expiraEm: { gt: new Date() } },
      data: { usadoEm: new Date() },
    })
    if (usado.count === 0) throw linkInvalido()
    await tx.tokenSenha.updateMany({ where: { usuarioId: u.id, usadoEm: null }, data: { usadoEm: new Date() } })
    await tx.usuario.update({
      where: { id: u.id },
      data: { senhaHash: novoHash, deveTrocarSenha: false, senhaAlteradaEm: new Date() },
    })
    await auditar(tx, ctx, { acao: 'senha.redefinida', entidade: 'usuario', entidadeId: u.id })
    return revogarSessoesDoUsuario(tx, u.id, 'senha_redefinida')
  })
  desconectarSessoes(revogadas, 'senha_redefinida')
}
