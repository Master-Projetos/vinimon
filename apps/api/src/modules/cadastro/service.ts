import { createHash, randomBytes } from 'node:crypto'
import type { CadastroPublicoBody, ConfirmarCadastroBody, ListarCadastrosQuery } from '@vinimon/shared'
import { env } from '../../env'
import { auditar } from '../../lib/auditoria'
import { obterConfig } from '../../lib/config'
import type { ContextoUsuario } from '../../lib/contexto'
import { despacharEmail, enfileirarEmail } from '../../lib/email'
import { conflito, naoEncontrado, regraNegocio, requisicaoInvalida } from '../../lib/erros'
import { paginar } from '../../lib/paginacao'
import { prisma } from '../../lib/prisma'
import { solicitar as solicitarRedefinicao } from '../auth/recuperacao'
import { obterUsuario } from '../usuarios/service'
import { selectCadastro } from './schemas'

/** Mesma resposta para qualquer pedido válido: nunca revela se login, e-mail ou domínio são aceitos. */
export const MENSAGEM_CADASTRO = 'Se os dados forem válidos, enviaremos um e-mail para confirmar o cadastro.'
/** Prazo para confirmar o e-mail, contado da solicitação. */
const VALIDADE_CONFIRMACAO_MS = 48 * 60 * 60_000

const hashDoToken = (token: string) => createHash('sha256').update(token).digest('hex')
const linkInvalido = () => requisicaoInvalida('Link inválido ou expirado.')

/**
 * POST /publico/cadastro (A14). Com `cadastro.habilitado` desligado, ou com domínio fora de
 * `cadastro.dominiosPermitidos`, ou com login/e-mail já usado, nada é gravado nem enviado.
 * Uma solicitação repetida substitui a anterior, desde que ela ainda não tenha sido confirmada.
 */
export async function solicitarCadastro(corpo: CadastroPublicoBody): Promise<void> {
  const cfg = await obterConfig()
  if (!cfg['cadastro.habilitado']) return
  const dominio = corpo.email.slice(corpo.email.lastIndexOf('@') + 1)
  if (!cfg['cadastro.dominiosPermitidos'].includes(dominio)) return

  const token = randomBytes(32).toString('base64url')
  const tokenHash = hashDoToken(token)
  const link = `${env.APP_ORIGIN}/confirmar-cadastro?token=${token}`
  const emailId = await prisma.$transaction(async (tx) => {
    const usado = await tx.usuario.findFirst({
      where: { OR: [{ login: corpo.login }, { email: corpo.email }] },
      select: { id: true },
    })
    if (usado) return null
    const confirmado = await tx.cadastroPendente.findFirst({
      where: { confirmadoEm: { not: null }, OR: [{ login: corpo.login }, { email: corpo.email }] },
      select: { id: true },
    })
    if (confirmado) return null
    await tx.cadastroPendente.deleteMany({
      where: { confirmadoEm: null, OR: [{ login: corpo.login }, { email: corpo.email }] },
    })
    await tx.cadastroPendente.create({
      data: {
        login: corpo.login,
        nome: corpo.nome,
        email: corpo.email,
        departamentoId: corpo.departamentoId ?? null,
        tokenHash,
      },
    })
    return enfileirarEmail(tx, {
      para: corpo.email,
      assunto: 'Confirmação de cadastro',
      texto: [
        `Olá, ${corpo.nome}.`,
        '',
        'Recebemos um pedido de cadastro com este e-mail. Para confirmá-lo, use o link abaixo em até 48 horas:',
        link,
        '',
        'Depois da confirmação, um administrador analisa o cadastro. Se você não fez este pedido, ignore esta mensagem.',
      ].join('\n'),
      evento: 'CONFIRMAR_CADASTRO',
      chaveIdempotencia: `confirmar-cadastro:${tokenHash}`,
    })
  })
  if (emailId !== null) await despacharEmail(emailId)
}

/** POST /publico/cadastro/confirmar: marca o e-mail como confirmado. Token inválido ou vencido = 400. */
export async function confirmarCadastro(corpo: ConfirmarCadastroBody): Promise<void> {
  const cadastro = await prisma.cadastroPendente.findUnique({
    where: { tokenHash: hashDoToken(corpo.token) },
    select: { id: true, confirmadoEm: true, criadoEm: true },
  })
  if (!cadastro || cadastro.criadoEm.getTime() + VALIDADE_CONFIRMACAO_MS <= Date.now()) throw linkInvalido()
  if (cadastro.confirmadoEm === null) {
    await prisma.cadastroPendente.updateMany({
      where: { id: cadastro.id, confirmadoEm: null },
      data: { confirmadoEm: new Date() },
    })
  }
}

export async function listarCadastros(q: ListarCadastrosQuery) {
  const [itens, total] = await prisma.$transaction([
    prisma.cadastroPendente.findMany({
      select: selectCadastro,
      orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
      ...paginar(q),
    }),
    prisma.cadastroPendente.count(),
  ])
  return { itens, total, pagina: q.pagina, porPagina: q.porPagina }
}

/**
 * ADMIN aprova um cadastro confirmado: cria o USUARIO sem senha utilizável e envia o link de definição de senha
 * pelo fluxo de redefinição (T-12.4), depois do commit. Exige `email.habilitado`, senão o usuário ficaria sem
 * como entrar.
 */
export async function aprovarCadastro(id: number, ctx: ContextoUsuario) {
  const cfg = await obterConfig()
  if (!cfg['email.habilitado']) {
    throw regraNegocio('Ative o envio de e-mails para aprovar cadastros: o link de definição de senha depende dele.')
  }
  const usuarioId = await prisma.$transaction(async (tx) => {
    const cadastro = await tx.cadastroPendente.findUnique({
      where: { id },
      select: { login: true, nome: true, email: true, departamentoId: true, confirmadoEm: true },
    })
    if (!cadastro) throw naoEncontrado('Cadastro não encontrado.')
    if (cadastro.confirmadoEm === null) throw conflito('O e-mail deste cadastro ainda não foi confirmado.')
    const criado = await tx.usuario.create({
      data: {
        login: cadastro.login,
        nome: cadastro.nome,
        email: cadastro.email,
        departamentoId: cadastro.departamentoId,
        perfil: 'USUARIO',
        ativo: true,
        senhaHash: null,
      },
      select: { id: true },
    })
    await tx.cadastroPendente.delete({ where: { id } })
    await auditar(tx, ctx, {
      acao: 'cadastro.aprovado',
      entidade: 'usuario',
      entidadeId: criado.id,
      dados: {
        depois: {
          login: cadastro.login,
          nome: cadastro.nome,
          email: cadastro.email,
          perfil: 'USUARIO',
          departamentoId: cadastro.departamentoId,
        },
      },
    })
    return criado.id
  })
  const usuario = await obterUsuario(usuarioId)
  await solicitarRedefinicao({ login: usuario.login }, ctx)
  return usuario
}
