import { createHash, randomBytes } from 'node:crypto'
import {
  type CadastroAprovado,
  type ConfirmarCadastro,
  type ListarCadastrosPendentesQuery,
  MENSAGEM_CADASTRO,
  MENSAGEM_CADASTRO_CONFIRMADO,
  type SolicitarCadastro,
} from '@vinimon/shared'
import { env } from '../../env'
import type { Prisma } from '../../generated/prisma/client'
import { auditar } from '../../lib/auditoria'
import { obterConfig } from '../../lib/config'
import type { Contexto, ContextoUsuario } from '../../lib/contexto'
import { despacharEmail, enfileirarEmail } from '../../lib/email'
import { codigoPrisma, conflito, naoEncontrado, requisicaoInvalida } from '../../lib/erros'
import { paginar } from '../../lib/paginacao'
import { prisma } from '../../lib/prisma'

/** Projeção única da listagem (nunca devolva o hash do token). */
const selectCadastroPendente = {
  id: true,
  login: true,
  nome: true,
  email: true,
  departamentoId: true,
  departamento: { select: { id: true, nome: true } },
  confirmadoEm: true,
  criadoEm: true,
} satisfies Prisma.CadastroPendenteSelect

const VALIDADE_CONFIRMACAO_MS = 48 * 3_600_000
const VALIDADE_SENHA_MS = 48 * 3_600_000
/** Piso de duração do POST /publico/cadastro: aceito e ignorado levam o mesmo tempo aproximado. */
const DURACAO_MINIMA_MS = 300

const hashDoToken = (token: string) => createHash('sha256').update(token).digest('hex')
const linkInvalido = () => requisicaoInvalida('Link inválido ou expirado')
const esperar = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * POST /publico/cadastro (A14). A resposta é a mesma em qualquer caso: cadastro desabilitado, domínio fora da lista,
 * login ou e-mail já usados (usuário ou pedido pendente), departamento inválido ou pedido aceito. Nada daqui
 * sinaliza ao chamador qual foi o caso (sem enumeração de contas).
 */
export async function solicitar(corpo: SolicitarCadastro): Promise<{ mensagem: string }> {
  const inicio = Date.now()
  try {
    await tentarRegistrar(corpo)
  } catch (err) {
    // Corrida entre dois pedidos iguais (unicidade): o perdedor é ignorado como qualquer outro caso.
    if (codigoPrisma(err) !== 'P2002') throw err
  }
  const restante = DURACAO_MINIMA_MS - (Date.now() - inicio)
  if (restante > 0) await esperar(restante)
  return { mensagem: MENSAGEM_CADASTRO }
}

async function tentarRegistrar(corpo: SolicitarCadastro): Promise<void> {
  const cfg = await obterConfig()
  const dominio = corpo.email.slice(corpo.email.lastIndexOf('@') + 1)
  const permitido = cfg['cadastro.habilitado'] && cfg['cadastro.dominiosPermitidos'].includes(dominio)

  // As mesmas consultas rodam sempre, para o tempo não depender do caso.
  const limite = new Date(Date.now() - VALIDADE_CONFIRMACAO_MS)
  const [usuario, pendente, departamento] = await Promise.all([
    prisma.usuario.findFirst({
      where: { OR: [{ login: corpo.login }, { email: corpo.email }] },
      select: { id: true },
    }),
    prisma.cadastroPendente.findFirst({
      where: {
        OR: [{ login: corpo.login }, { email: corpo.email }],
        // pedido não confirmado e vencido não bloqueia: é substituído abaixo
        NOT: { confirmadoEm: null, criadoEm: { lt: limite } },
      },
      select: { id: true },
    }),
    corpo.departamentoId === undefined
      ? Promise.resolve(null)
      : prisma.departamento.findFirst({ where: { id: corpo.departamentoId, ativo: true }, select: { id: true } }),
  ])
  if (!permitido || usuario || pendente) return
  if (corpo.departamentoId !== undefined && !departamento) return

  const token = randomBytes(32).toString('base64url')
  const tokenHash = hashDoToken(token)
  const link = `${env.APP_ORIGIN}/cadastro/confirmar?token=${token}`
  const emailId = await prisma.$transaction(async (tx) => {
    await tx.cadastroPendente.deleteMany({
      where: { OR: [{ login: corpo.login }, { email: corpo.email }], confirmadoEm: null, criadoEm: { lt: limite } },
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
    if (!cfg['email.habilitado']) return null
    return enfileirarEmail(tx, {
      para: corpo.email,
      assunto: 'Confirme o seu cadastro',
      texto: [
        `Olá, ${corpo.nome}.`,
        '',
        'Recebemos um pedido de cadastro com este e-mail. Para confirmar, use o link abaixo em até 48 horas:',
        link,
        '',
        'Depois da confirmação, o pedido seguirá para aprovação do administrador.',
        'Se você não fez este pedido, ignore esta mensagem.',
      ].join('\n'),
      evento: 'CADASTRO_CONFIRMAR',
      chaveIdempotencia: `cadastro-confirmar:${tokenHash}`,
    })
  })
  if (emailId !== null) await despacharEmail(emailId)
}

/** POST /publico/cadastro/confirmar: uso único; token inexistente, vencido ou já usado = 400 genérico. */
export async function confirmar(corpo: ConfirmarCadastro, ctx: Contexto): Promise<{ mensagem: string }> {
  const tokenHash = hashDoToken(corpo.token)
  await prisma.$transaction(async (tx) => {
    const usado = await tx.cadastroPendente.updateMany({
      where: { tokenHash, confirmadoEm: null, criadoEm: { gt: new Date(Date.now() - VALIDADE_CONFIRMACAO_MS) } },
      data: { confirmadoEm: new Date() },
    })
    if (usado.count === 0) throw linkInvalido()
    const p = await tx.cadastroPendente.findUniqueOrThrow({ where: { tokenHash }, select: { id: true } })
    await auditar(tx, ctx, { acao: 'cadastro.confirmado', entidade: 'cadastro_pendente', entidadeId: p.id })
  })
  return { mensagem: MENSAGEM_CADASTRO_CONFIRMADO }
}

/** Só pedidos com e-mail confirmado aparecem para o administrador. */
export async function listarPendentes(q: ListarCadastrosPendentesQuery) {
  const where = { confirmadoEm: { not: null } }
  const [itens, total] = await prisma.$transaction([
    prisma.cadastroPendente.findMany({
      where,
      select: selectCadastroPendente,
      orderBy: [{ criadoEm: 'asc' }, { id: 'asc' }],
      ...paginar(q),
    }),
    prisma.cadastroPendente.count({ where }),
  ])
  return { itens, total, pagina: q.pagina, porPagina: q.porPagina }
}

/**
 * Aprova: cria o USUARIO (perfil USUARIO, ativo, sem senha utilizável) e emite o link de definição de senha com o
 * mesmo mecanismo da recuperação (TokenSenha, resgatado em /auth/redefinir-senha). O pedido é apagado.
 */
export async function aprovar(id: number, ctx: ContextoUsuario): Promise<CadastroAprovado> {
  const token = randomBytes(32).toString('base64url')
  const tokenHash = hashDoToken(token)
  const link = `${env.APP_ORIGIN}/redefinir-senha?token=${token}`
  const cfg = await obterConfig()

  const r = await prisma.$transaction(async (tx) => {
    const p = await tx.cadastroPendente.findFirst({
      where: { id, confirmadoEm: { not: null } },
      select: { id: true, login: true, nome: true, email: true, departamentoId: true },
    })
    if (!p) throw naoEncontrado('Cadastro pendente não encontrado.')
    const existente = await tx.usuario.findFirst({
      where: { OR: [{ login: p.login }, { email: p.email }] },
      select: { id: true },
    })
    if (existente) throw conflito('Já existe um usuário com este login ou e-mail.')
    await tx.cadastroPendente.delete({ where: { id: p.id } })
    const usuario = await tx.usuario.create({
      data: {
        login: p.login,
        nome: p.nome,
        email: p.email,
        perfil: 'USUARIO',
        ativo: true,
        departamentoId: p.departamentoId,
        senhaHash: null, // login impossível até a senha ser definida pelo link
        deveTrocarSenha: false,
      },
      select: { id: true, login: true },
    })
    await tx.tokenSenha.create({
      data: { usuarioId: usuario.id, tokenHash, expiraEm: new Date(Date.now() + VALIDADE_SENHA_MS), ip: null },
    })
    await auditar(tx, ctx, {
      acao: 'usuario.criado',
      entidade: 'usuario',
      entidadeId: usuario.id,
      dados: { depois: { login: usuario.login, perfil: 'USUARIO', origem: 'auto-cadastro' } },
    })
    await auditar(tx, ctx, {
      acao: 'cadastro.aprovado',
      entidade: 'cadastro_pendente',
      entidadeId: p.id,
      dados: { usuarioId: usuario.id, login: usuario.login },
    })
    const emailId = cfg['email.habilitado']
      ? await enfileirarEmail(tx, {
          para: p.email,
          assunto: 'Cadastro aprovado: defina a sua senha',
          texto: [
            `Olá, ${p.nome}.`,
            '',
            'O seu cadastro foi aprovado. Defina a sua senha pelo link abaixo, válido por 48 horas:',
            link,
            '',
            'Se você não fez este pedido, ignore esta mensagem.',
          ].join('\n'),
          evento: 'CADASTRO_APROVADO',
          usuarioId: usuario.id,
          chaveIdempotencia: `cadastro-aprovado:${tokenHash}`,
        })
      : null
    return { usuario, emailId }
  })
  if (r.emailId !== null) await despacharEmail(r.emailId)
  return { usuarioId: r.usuario.id, login: r.usuario.login }
}

/** DELETE /cadastro-pendentes/:id: rejeita (apaga) um pedido confirmado. */
export async function rejeitar(id: number, ctx: ContextoUsuario): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const apagados = await tx.cadastroPendente.deleteMany({ where: { id, confirmadoEm: { not: null } } })
    if (apagados.count === 0) throw naoEncontrado('Cadastro pendente não encontrado.')
    await auditar(tx, ctx, { acao: 'cadastro.rejeitado', entidade: 'cadastro_pendente', entidadeId: id })
  })
}
