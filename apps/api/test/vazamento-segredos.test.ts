import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type App, buildApp } from '../src/app'
import { ativarMfa, criarUsuario, headersDe, limparBanco } from './ajudantes'

// T40: nenhuma resposta GET devolve hash de senha, segredo de 2FA, hash de token ou código de recuperação.
const PROIBIDO =
  /senhaHash|senha_hash|totpSecret|totp_secret|tokenHash|token_hash|codigoHash|codigo_hash|\$argon2id|^v1:/m

describe('T40: vazamento de segredos', () => {
  let app: App
  beforeAll(async () => {
    await limparBanco()
    app = await buildApp({ logger: false })
    await app.ready()
  })
  afterAll(async () => {
    await app.close()
  })

  it('percorre toda rota GET autenticada e não encontra segredos', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    await ativarMfa(admin.id)
    const headers = await headersDe(admin.id)
    const rotas = app.rotasApi.filter((r) => r.metodo.toUpperCase().includes('GET') && r.acesso !== 'publico')
    expect(rotas.length).toBeGreaterThanOrEqual(3)
    let consultadas = 0
    for (const rota of rotas) {
      const restantes = rota.url.replace(':id', String(admin.id))
      if (restantes.includes(':')) continue // outros parâmetros: cobertos nos testes de cada módulo
      const res = await app.inject({ method: 'GET', url: restantes, headers })
      expect(res.body, `GET ${restantes}`).not.toMatch(PROIBIDO)
      consultadas++
    }
    expect(consultadas).toBeGreaterThanOrEqual(3)
  })
})
