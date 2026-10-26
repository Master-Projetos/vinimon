import { ESTADOS_SESSAO } from '@vinimon/shared'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { contextoAnonimo, contextoDe } from '../../lib/contexto'
import { csrfDaSessao, NOME_COOKIE, opcoesCookie, opcoesLimparCookie } from '../../lib/sessao'
import * as mfa from './mfa'
import * as recuperacao from './recuperacao'
import { authApi as c } from './schemas'
import * as service from './service'
import * as sessoes from './sessoes'

const tags = ['Autenticação']

export const rotasAuth: FastifyPluginAsyncZod = async (app) => {
  app.route({
    method: c.entrar.metodo,
    url: c.entrar.caminho,
    schema: { tags, summary: 'Entrar', body: c.entrar.body, response: { 200: c.entrar.resposta } },
    config: { acesso: 'publico', rateLimit: { max: 10, timeWindow: '1 minute' } },
    handler: async (req, reply) => {
      const r = await service.entrar(req.body, { ...contextoAnonimo(req), ip: req.ip })
      reply.setCookie(NOME_COOKIE, r.token, opcoesCookie(r.expiraEm))
      return {
        estado: r.estado,
        csrf: csrfDaSessao(r.sessaoId),
        usuario: r.estado === 'ATIVA' ? await service.obterUsuarioMe(r.usuarioId) : null,
      }
    },
  })

  app.route({
    method: c.sessao.metodo,
    url: c.sessao.caminho,
    schema: { tags, summary: 'Sessão atual', response: { 200: c.sessao.resposta } },
    config: { acesso: 'autenticado', estados: ESTADOS_SESSAO },
    handler: async (req) => {
      const u = req.usuario
      if (!u) throw new Error('inalcançável: acesso autenticado garante usuário')
      return {
        estado: u.estado,
        csrf: csrfDaSessao(u.sessaoId),
        usuario: u.estado === 'ATIVA' ? await service.obterUsuarioMe(u.id) : null,
      }
    },
  })

  app.route({
    method: c.sair.metodo,
    url: c.sair.caminho,
    schema: { tags, summary: 'Sair', response: { 204: c.sair.resposta } },
    config: { acesso: 'autenticado', estados: ESTADOS_SESSAO },
    handler: async (req, reply) => {
      await service.sair(contextoDe(req))
      reply.clearCookie(NOME_COOKIE, opcoesLimparCookie())
      return reply.code(204).send()
    },
  })

  const pendente = ['PENDENTE_MFA'] as const
  const cadastro = ['CADASTRO_MFA', 'ATIVA'] as const
  const aplicar = (
    reply: { setCookie: (n: string, v: string, o: ReturnType<typeof opcoesCookie>) => unknown },
    p: { token: string; expiraEm: Date },
  ) => reply.setCookie(NOME_COOKIE, p.token, opcoesCookie(p.expiraEm))

  app.route({
    method: c.verificar2fa.metodo,
    url: c.verificar2fa.caminho,
    schema: {
      tags,
      summary: 'Verifica o 2FA no login',
      body: c.verificar2fa.body,
      response: { 200: c.verificar2fa.resposta },
    },
    config: { acesso: 'autenticado', estados: pendente, rateLimit: { max: 10, timeWindow: '1 minute' } },
    handler: async (req, reply) => {
      const r = await mfa.verificar2fa(req.body, contextoDe(req))
      aplicar(reply, r)
      return r.resposta
    },
  })

  app.route({
    method: c.iniciar2fa.metodo,
    url: c.iniciar2fa.caminho,
    schema: { tags, summary: 'Inicia o cadastro do 2FA', response: { 200: c.iniciar2fa.resposta } },
    config: { acesso: 'autenticado', estados: cadastro, rateLimit: { max: 10, timeWindow: '1 hour' } },
    handler: (req) => mfa.iniciar2fa(contextoDe(req)),
  })

  app.route({
    method: c.confirmar2fa.metodo,
    url: c.confirmar2fa.caminho,
    schema: {
      tags,
      summary: 'Confirma o cadastro do 2FA',
      body: c.confirmar2fa.body,
      response: { 200: c.confirmar2fa.resposta },
    },
    config: { acesso: 'autenticado', estados: cadastro, rateLimit: { max: 10, timeWindow: '1 hour' } },
    handler: async (req, reply) => {
      const r = await mfa.confirmar2fa(req.body.codigo, contextoDe(req))
      aplicar(reply, r)
      return { codigos: r.codigos, sessao: r.resposta }
    },
  })

  app.route({
    method: c.codigos2fa.metodo,
    url: c.codigos2fa.caminho,
    schema: {
      tags,
      summary: 'Gera novos códigos de recuperação',
      body: c.codigos2fa.body,
      response: { 200: c.codigos2fa.resposta },
    },
    config: { acesso: 'autenticado', rateLimit: { max: 5, timeWindow: '1 hour' } },
    handler: async (req) => ({ codigos: await mfa.novosCodigos(req.body.senha, contextoDe(req)) }),
  })

  app.route({
    method: c.desativar2fa.metodo,
    url: c.desativar2fa.caminho,
    schema: {
      tags,
      summary: 'Desativa o 2FA (só usuários comuns)',
      body: c.desativar2fa.body,
      response: { 204: c.desativar2fa.resposta },
    },
    config: { acesso: 'autenticado', rateLimit: { max: 5, timeWindow: '1 hour' } },
    handler: async (req, reply) => {
      await mfa.desativar2fa(req.body.senha, req.body.codigo, contextoDe(req))
      return reply.code(204).send()
    },
  })

  app.route({
    method: c.trocarSenha.metodo,
    url: c.trocarSenha.caminho,
    schema: { tags, summary: 'Troca a senha', body: c.trocarSenha.body, response: { 200: c.trocarSenha.resposta } },
    config: { acesso: 'autenticado', estados: ['TROCA_SENHA', 'ATIVA'], rateLimit: { max: 5, timeWindow: '1 hour' } },
    handler: async (req, reply) => {
      const r = await service.trocarSenha(req.body, contextoDe(req))
      aplicar(reply, r)
      return r.resposta
    },
  })

  // Limite de 3/h por login, somado ao de 3/h por IP da config da rota (SEN-10).
  const limitePorLogin = app.rateLimit({
    max: 3,
    timeWindow: '1 hour',
    keyGenerator: (req) => {
      const corpo = req.body
      const login = typeof corpo === 'object' && corpo !== null && 'login' in corpo ? String(corpo.login) : ''
      return `esqueci-senha:${login}`
    },
  })

  app.route({
    method: c.esqueciSenha.metodo,
    url: c.esqueciSenha.caminho,
    schema: {
      tags,
      summary: 'Solicita a redefinição de senha por e-mail',
      body: c.esqueciSenha.body,
      response: { 202: c.esqueciSenha.resposta },
    },
    config: { acesso: 'publico', rateLimit: { max: 3, timeWindow: '1 hour' } },
    preHandler: limitePorLogin,
    handler: async (req, reply) => {
      await recuperacao.solicitar(req.body, contextoAnonimo(req))
      return reply.code(202).send({ mensagem: recuperacao.MENSAGEM_ESQUECI })
    },
  })

  app.route({
    method: c.recuperacaoHabilitada.metodo,
    url: c.recuperacaoHabilitada.caminho,
    schema: {
      tags,
      summary: 'Informa se a recuperação de senha por e-mail está disponível',
      response: { 200: c.recuperacaoHabilitada.resposta },
    },
    config: { acesso: 'publico', rateLimit: { max: 60, timeWindow: '1 minute' } },
    handler: () => recuperacao.recuperacaoHabilitada(),
  })

  app.route({
    method: c.redefinirSenha.metodo,
    url: c.redefinirSenha.caminho,
    schema: {
      tags,
      summary: 'Redefine a senha com o token recebido por e-mail',
      body: c.redefinirSenha.body,
      response: { 204: c.redefinirSenha.resposta },
    },
    config: { acesso: 'publico', rateLimit: { max: 10, timeWindow: '1 hour' } },
    handler: async (req, reply) => {
      await recuperacao.redefinir(req.body, contextoAnonimo(req))
      return reply.code(204).send()
    },
  })

  app.route({
    method: c.sessoes.metodo,
    url: c.sessoes.caminho,
    schema: { tags, summary: 'Dispositivos conectados', response: { 200: c.sessoes.resposta } },
    config: { acesso: 'autenticado' },
    handler: (req) => sessoes.listarSessoes(contextoDe(req)),
  })

  app.route({
    method: c.revogarSessao.metodo,
    url: c.revogarSessao.caminho,
    schema: {
      tags,
      summary: 'Encerra uma sessão do próprio usuário',
      params: c.revogarSessao.params,
      response: { 204: c.revogarSessao.resposta },
    },
    config: { acesso: 'autenticado' },
    handler: async (req, reply) => {
      await sessoes.revogarDispositivo(req.params.id, contextoDe(req))
      return reply.code(204).send()
    },
  })

  app.route({
    method: c.encerrarTodas.metodo,
    url: c.encerrarTodas.caminho,
    schema: {
      tags,
      summary: 'Encerra todas as sessões, inclusive a atual',
      response: { 204: c.encerrarTodas.resposta },
    },
    config: { acesso: 'autenticado' },
    handler: async (req, reply) => {
      await sessoes.encerrarTodas(contextoDe(req))
      reply.clearCookie(NOME_COOKIE, opcoesLimparCookie())
      return reply.code(204).send()
    },
  })
}
