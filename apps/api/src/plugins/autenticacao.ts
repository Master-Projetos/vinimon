import { type EstadoSessao, type Permissao, temPermissao } from '@vinimon/shared'
import fp from 'fastify-plugin'
import { naoAutenticado, requisicaoInvalida, semPermissao, sessaoIncompleta } from '../lib/erros'
import { carregarSessao, NOME_COOKIE, type UsuarioSessao } from '../lib/sessao'

export type Acesso = 'publico' | 'autenticado' | Permissao

declare module 'fastify' {
  interface FastifyRequest {
    usuario: UsuarioSessao | null
  }
  interface FastifyContextConfig {
    /** OBRIGATÓRIO em toda rota /api/v1 (fail-closed). */
    acesso?: Acesso
    /** Estados de sessão aceitos. Padrão: ['ATIVA']. */
    estados?: readonly EstadoSessao[]
    /** false SOMENTE na rota de relatório CSP. */
    csrf?: false
  }
}

/** Carrega a sessão (onRequest) e aplica a declaração de acesso (preValidation, antes do Zod). */
export const autenticacaoPlugin = fp(
  async (app) => {
    app.decorateRequest('usuario', null)

    app.addHook('onRequest', async (req) => {
      const token = req.cookies[NOME_COOKIE]
      if (token !== undefined && req.headers.authorization !== undefined) {
        throw requisicaoInvalida('Use cookie de sessão ou token de API, nunca os dois.')
      }
      const usuario = await carregarSessao(token)
      if (usuario) {
        req.usuario = usuario
        req.log = req.log.child({ usuarioId: usuario.id })
      }
    })

    app.addHook('preValidation', async (req) => {
      const { acesso, estados = ['ATIVA'] } = req.routeOptions.config
      if (acesso === undefined) {
        req.log.error({ url: req.routeOptions.url }, 'rota sem config.acesso')
        throw semPermissao('Rota sem declaração de acesso.')
      }
      if (acesso === 'publico') return
      const u = req.usuario
      if (!u) throw naoAutenticado()
      if (!estados.includes(u.estado)) throw sessaoIncompleta(u.estado)
      if (acesso !== 'autenticado' && !temPermissao(u.perfil, acesso)) throw semPermissao()
    })
  },
  { name: 'autenticacao' },
)
