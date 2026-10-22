import type { CodigoErro, EstadoSessao } from '@vinimon/shared'
import type { FastifyReply, FastifyRequest } from 'fastify'

export interface DetalheErro {
  campo: string
  mensagem: string
}

export class ErroApp extends Error {
  readonly status: number
  readonly codigo: CodigoErro
  readonly detalhes: DetalheErro[] | undefined
  constructor(status: number, codigo: CodigoErro, mensagem: string, detalhes?: DetalheErro[]) {
    super(mensagem)
    this.name = 'ErroApp'
    this.status = status
    this.codigo = codigo
    this.detalhes = detalhes
  }
}

export const naoAutenticado = (m = 'Faça login para continuar.') => new ErroApp(401, 'NAO_AUTENTICADO', m)
export const loginInvalido = () => new ErroApp(401, 'NAO_AUTENTICADO', 'Login ou senha inválidos.')
export const sessaoIncompleta = (estado: EstadoSessao) =>
  estado === 'TROCA_SENHA'
    ? new ErroApp(403, 'TROCA_SENHA_OBRIGATORIA', 'Troque sua senha para continuar.')
    : new ErroApp(403, 'MFA_PENDENTE', 'Conclua a verificação em duas etapas para continuar.')
export const semPermissao = (m = 'Você não tem permissão para esta ação.') => new ErroApp(403, 'SEM_PERMISSAO', m)
export const origemInvalida = () => new ErroApp(403, 'ORIGEM_INVALIDA', 'Origem da requisição não permitida.')
export const csrfInvalido = () => new ErroApp(403, 'CSRF_INVALIDO', 'Token de segurança inválido. Recarregue a página.')
export const naoEncontrado = (m = 'Registro não encontrado.') => new ErroApp(404, 'NAO_ENCONTRADO', m)
export const conflito = (m: string) => new ErroApp(409, 'CONFLITO', m)
export const regraNegocio = (m: string) => new ErroApp(422, 'REGRA_NEGOCIO', m)
export const requisicaoInvalida = (m: string) => new ErroApp(400, 'REQUISICAO_INVALIDA', m)
export const muitasTentativas = (m: string) => new ErroApp(429, 'MUITAS_TENTATIVAS', m)

/** Código Pxxxx de erros conhecidos do Prisma (checagem estrutural). */
export function codigoPrisma(erro: unknown): string | undefined {
  if (typeof erro === 'object' && erro !== null && 'code' in erro && typeof erro.code === 'string') {
    return /^P\d{4}$/.test(erro.code) ? erro.code : undefined
  }
  return undefined
}

/**
 * Nome do índice único (o adapter pg informa `cause.constraint.index`, não `meta.target`) → campo do formulário.
 * Cada tarefa de cadastro com unique acrescenta a sua linha.
 */
export const CAMPO_POR_INDICE: Record<string, string> = {
  areas_nome_key: 'nome',
  usuarios_login_key: 'login',
  usuarios_email_key: 'email',
}

export function responderRotaInexistente(req: FastifyRequest, reply: FastifyReply) {
  return reply
    .code(404)
    .send({ erro: { codigo: 'ROTA_INEXISTENTE', mensagem: 'Rota não encontrada.', requestId: req.id } })
}
