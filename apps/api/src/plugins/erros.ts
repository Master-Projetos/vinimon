import type { CodigoErro } from '@vinimon/shared'
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from 'fastify-type-provider-zod'
import { CAMPO_POR_INDICE, codigoPrisma, type DetalheErro, ErroApp } from '../lib/erros'

type CausaAdapter = { cause?: { originalCode?: string; constraint?: { index?: string; fields?: string[] } } }
/** Com driver adapter, `meta = { driverAdapterError, table }` (sem `meta.target`). */
function causaAdapter(erro: unknown): CausaAdapter['cause'] {
  if (typeof erro !== 'object' || erro === null || !('meta' in erro)) return undefined
  const meta = erro.meta as { driverAdapterError?: unknown } | undefined
  return (meta?.driverAdapterError as CausaAdapter | undefined)?.cause
}

function responder(
  req: FastifyRequest,
  reply: FastifyReply,
  status: number,
  codigo: CodigoErro,
  mensagem: string,
  detalhes?: DetalheErro[],
) {
  return reply.code(status).send({ erro: { codigo, mensagem, detalhes, requestId: req.id } })
}

export const errosPlugin = fp(
  async (app) => {
    app.setErrorHandler((erro: FastifyError, req, reply) => {
      if (erro instanceof ErroApp) return responder(req, reply, erro.status, erro.codigo, erro.message, erro.detalhes)

      if (hasZodFastifySchemaValidationErrors(erro)) {
        const detalhes = erro.validation.map((v) => ({
          campo: v.instancePath.replace(/^\//, '').replaceAll('/', '.') || (erro.validationContext ?? 'corpo'),
          mensagem: v.message ?? 'Valor inválido.',
        }))
        return responder(req, reply, 400, 'VALIDACAO', 'Verifique os campos informados.', detalhes)
      }

      const causa = causaAdapter(erro)
      switch (codigoPrisma(erro)) {
        case 'P2002': {
          const campo = CAMPO_POR_INDICE[causa?.constraint?.index ?? '']
          const detalhes = campo ? [{ campo, mensagem: 'Já existe um registro com este valor.' }] : []
          return responder(req, reply, 409, 'CONFLITO', 'Já existe um registro com esse valor.', detalhes)
        }
        // Códigos do Postgres sem tradução no adapter: P2039 (client) e P2010 ($queryRaw/$executeRaw).
        case 'P2039':
        case 'P2010':
          if (causa?.originalCode === '23P01')
            return responder(req, reply, 409, 'CONFLITO', 'O registro conflita com outro existente.')
          if (causa?.originalCode === '23514')
            return responder(req, reply, 422, 'VALIDACAO', 'Os dados violam uma regra de integridade.')
          break
        case 'P2025':
          return responder(req, reply, 404, 'NAO_ENCONTRADO', 'Registro não encontrado.')
        case 'P2034':
          return responder(req, reply, 409, 'CONFLITO', 'Conflito de concorrência. Tente novamente.')
        case 'P2003':
          return req.method === 'DELETE'
            ? responder(
                req,
                reply,
                409,
                'REGISTRO_EM_USO',
                'Registro em uso por outros dados. Desative-o em vez de excluir.',
              )
            : responder(req, reply, 422, 'REFERENCIA_INVALIDA', 'Um dos registros relacionados não existe.')
      }

      if (isResponseSerializationError(erro)) {
        req.log.error({ err: erro, issues: erro.cause.issues }, 'resposta fora do schema')
        return responder(req, reply, 500, 'INTERNO', 'Erro interno do servidor.')
      }

      const status = erro.statusCode ?? 500
      if (status === 429)
        return responder(req, reply, 429, 'MUITAS_TENTATIVAS', 'Muitas requisições. Aguarde e tente novamente.')
      if (status === 413)
        return responder(req, reply, 413, 'ARQUIVO_GRANDE', 'Arquivo ou requisição maior que o permitido.')
      if (status === 415) return responder(req, reply, 415, 'CONTEUDO_NAO_SUPORTADO', 'Tipo de conteúdo não suportado.')
      if (status === 503)
        return responder(req, reply, 503, 'INDISPONIVEL', 'Servidor sobrecarregado. Tente novamente em instantes.')
      if (status >= 400 && status < 500)
        return responder(req, reply, status, 'REQUISICAO_INVALIDA', 'Requisição inválida.')

      req.log.error({ err: erro }, 'erro não tratado')
      return responder(req, reply, 500, 'INTERNO', 'Erro interno do servidor.')
    })
  },
  { name: 'erros' },
)
