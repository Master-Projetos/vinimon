import { areasGeridasApi as c } from '@vinimon/shared'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { contextoDe } from '../../lib/contexto'
import * as service from './service'

const tags = ['Áreas geridas']

export const rotasAreasGeridas: FastifyPluginAsyncZod = async (app) => {
  app.route({
    method: c.listarUsuarios.metodo,
    url: c.listarUsuarios.caminho,
    schema: {
      tags,
      summary: 'Lista os usuários de uma área gerida',
      params: c.listarUsuarios.params,
      response: { 200: c.listarUsuarios.resposta },
    },
    config: { acesso: 'autenticado' },
    handler: (req) => service.listarUsuariosGeridos(req.params.areaId, contextoDe(req)),
  })

  app.route({
    method: c.atualizarUsuario.metodo,
    url: c.atualizarUsuario.caminho,
    schema: {
      tags,
      summary: 'Atualiza telefone, departamento ou situação de um usuário da área gerida',
      params: c.atualizarUsuario.params,
      body: c.atualizarUsuario.body,
      response: { 200: c.atualizarUsuario.resposta },
    },
    config: { acesso: 'autenticado' },
    handler: (req) => service.atualizarUsuarioGerido(req.params.areaId, req.params.id, req.body, contextoDe(req)),
  })
}
