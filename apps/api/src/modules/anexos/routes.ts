import { anexosApi as c } from '@vinimon/shared'
import { create as contentDisposition } from 'content-disposition'
import type { FastifyReply } from 'fastify'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { env } from '../../env'
import { contextoDe } from '../../lib/contexto'
import { naoAutenticado, requisicaoInvalida } from '../../lib/erros'
import * as service from './service'

const tags = ['Anexos']
const MIB = 1024 * 1024
// S70: o conteúdo baixado nunca executa nada
const CSP_ANEXO = "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox"

export const rotasAnexos: FastifyPluginAsyncZod = async (app) => {
  app.route({
    method: c.enviar.metodo,
    url: c.enviar.caminho,
    schema: {
      tags,
      summary: 'Envia anexos (multipart): campos interno/assentamentoId primeiro, depois os arquivos',
      params: c.enviar.params,
      response: { 201: c.enviar.resposta },
    },
    config: { acesso: 'anexo.enviar', rateLimit: { max: 30, timeWindow: '1 hour' } },
    handler: async (req, reply) => {
      if (!req.isMultipart()) throw requisicaoInvalida('Envie o arquivo como multipart/form-data.')
      // as partes só são lidas depois de `autorizarUpload` (dentro de `enviarAnexos`): nada toca o disco antes
      const partes = req.parts({ limits: { fileSize: env.MAX_ANEXO_MB * MIB + 1, files: 5 } })
      const criados = await service.enviarAnexos(req.params.id, partes, contextoDe(req), req.log)
      return reply.code(201).send(criados)
    },
  })

  app.route({
    method: c.listar.metodo,
    url: c.listar.caminho,
    schema: {
      tags,
      summary: 'Lista os anexos do chamado',
      params: c.listar.params,
      response: { 200: c.listar.resposta },
    },
    config: { acesso: 'autenticado' },
    handler: (req) => {
      if (!req.usuario) throw naoAutenticado()
      return service.listarAnexos(req.params.id, req.usuario)
    },
  })

  app.route({
    method: c.baixar.metodo,
    url: c.baixar.caminho,
    schema: {
      tags,
      summary: 'Baixa o anexo (inline só para imagens png, jpeg, gif e webp)',
      params: c.baixar.params,
      response: { 200: c.baixar.resposta },
    },
    config: { acesso: 'autenticado' },
    handler: async (req, reply) => {
      if (!req.usuario) throw naoAutenticado()
      const a = await service.abrirAnexo(req.params.id, req.usuario)
      // o corpo é um stream: `response` é só documentação, então o `send` usa o tipo genérico do reply
      const envio: FastifyReply = reply
      return envio
        .type(a.mime)
        .header('content-disposition', contentDisposition(a.nome, { type: a.inline ? 'inline' : 'attachment' }))
        .header('x-content-type-options', 'nosniff')
        .header('content-security-policy', CSP_ANEXO)
        .header('cross-origin-resource-policy', 'same-origin')
        .header('cache-control', 'private, no-store')
        .send(a.stream)
    },
  })

  app.route({
    method: c.excluir.metodo,
    url: c.excluir.caminho,
    schema: {
      tags,
      summary: 'Exclui o anexo (ADMIN)',
      params: c.excluir.params,
      response: { 204: c.excluir.resposta },
    },
    config: { acesso: 'cadastro.gerenciar' },
    handler: async (req, reply) => {
      await service.excluirAnexo(req.params.id, contextoDe(req), req.log)
      return reply.code(204).send()
    },
  })
}
