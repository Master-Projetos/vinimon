import { verify } from '@node-rs/argon2'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { criarUsuario, limparBanco, ORIGEM, SENHA_TESTE } from '../../../test/ajudantes'
import { type App, buildApp } from '../../app'

// spy: true mantém a implementação real e deixa contar as chamadas (vi.spyOn não funciona no namespace CJS).
vi.mock('@node-rs/argon2', { spy: true })

describe('T07: login sem vazamento por tempo', () => {
  let app: App
  beforeAll(async () => {
    app = await buildApp({ logger: false })
    await app.ready()
  })
  afterAll(async () => {
    await app.close()
  })
  beforeEach(async () => {
    await limparBanco()
    vi.mocked(verify).mockClear()
  })

  const entrar = (login: string, senha: string) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'content-type': 'application/json', origin: ORIGEM },
      payload: { login, senha },
    })

  it('login inexistente verifica 1 hash (contra o fictício)', async () => {
    const r = await entrar('naoexiste', SENHA_TESTE)
    expect(r.statusCode).toBe(401)
    expect(vi.mocked(verify)).toHaveBeenCalledTimes(1)
  })

  it('senha errada verifica 1 hash e responde igual', async () => {
    const u = await criarUsuario({ perfil: 'USUARIO' })
    vi.mocked(verify).mockClear()
    const errada = await entrar(u.login, 'senha-errada-123')
    expect(errada.statusCode).toBe(401)
    expect(vi.mocked(verify)).toHaveBeenCalledTimes(1)
    const inexistente = await entrar('naoexiste', 'senha-errada-123')
    expect(inexistente.json()).toEqual(
      errada.json().erro
        ? { erro: { ...errada.json().erro, requestId: inexistente.json().erro.requestId } }
        : errada.json(),
    )
  })
})
