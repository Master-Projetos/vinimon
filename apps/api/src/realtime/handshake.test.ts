import type { Socket } from 'socket.io-client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { criarArea, criarUsuario, headersDe, limparBanco, ORIGEM } from '../../test/ajudantes'
import { conectar, esperarConectar, esperarErroConexao } from '../../test/socket'
import { type App, buildApp } from '../app'
import { SALA_ADMINS, salaArea, salaUsuario } from './salas'

describe('handshake do Socket.IO (T52)', () => {
  let app: App
  const abertos: Socket[] = []
  const novo = async (...args: Parameters<typeof conectar>) => {
    const s = await conectar(...args)
    abertos.push(s)
    return s
  }

  beforeAll(async () => {
    app = await buildApp({ logger: false })
    await app.ready()
  })
  afterAll(async () => {
    await app.close()
  })
  beforeEach(async () => {
    await limparBanco()
  })
  afterEach(() => {
    for (const s of abertos.splice(0)) s.disconnect()
  })

  it('sessão ATIVA conecta e entra nas salas do usuário, da sessão, da área e dos admins', async () => {
    const area = await criarArea()
    const op = await criarUsuario({ perfil: 'OPERADOR', areaId: area.id })
    const adm = await criarUsuario({ perfil: 'ADMIN' })
    const so = await novo(app, (await headersDe(op.id)).cookie)
    const sa = await novo(app, (await headersDe(adm.id)).cookie)
    await esperarConectar(so)
    await esperarConectar(sa)
    const salas = app.io.of('/').adapter.rooms
    expect(salas.get(salaUsuario(op.id))?.size).toBe(1)
    expect(salas.get(salaArea(area.id))?.size).toBe(1)
    expect(salas.get(SALA_ADMINS)?.size).toBe(1)
  })

  it('T52: recusa sem cookie', async () => {
    const s = await novo(app, undefined)
    const erro = await esperarErroConexao(s)
    expect(erro.data?.codigo).toBe('NAO_AUTENTICADO')
  })

  it('recusa Origin externo, ausente e "null"', async () => {
    const u = await criarUsuario({ perfil: 'USUARIO' })
    const { cookie } = await headersDe(u.id)
    for (const origin of ['https://evil.example', 'null', null]) {
      const s = await novo(app, cookie, origin)
      await esperarErroConexao(s)
    }
  })

  it('recusa sessão PENDENTE_MFA', async () => {
    const u = await criarUsuario({ perfil: 'OPERADOR' })
    const s = await novo(app, (await headersDe(u.id, 'PENDENTE_MFA')).cookie)
    const erro = await esperarErroConexao(s)
    expect(erro.data?.codigo).toBe('NAO_AUTENTICADO')
  })

  it('recusa Bearer no handshake, mesmo com cookie válido', async () => {
    const u = await criarUsuario({ perfil: 'USUARIO' })
    const s = await novo(app, (await headersDe(u.id)).cookie, null, { authorization: 'Bearer abc' })
    await esperarErroConexao(s) // sem Origin o allowRequest já recusa; repete com Origin correto
    const s2 = await novo(app, (await headersDe(u.id)).cookie, ORIGEM, { authorization: 'Bearer abc' })
    const erro = await esperarErroConexao(s2)
    expect(erro.data?.codigo).toBe('NAO_AUTENTICADO')
  })

  it('o 11º socket do mesmo usuário é recusado com LIMITE_CONEXOES', async () => {
    const u = await criarUsuario({ perfil: 'USUARIO' })
    const { cookie } = await headersDe(u.id)
    for (let i = 0; i < 10; i++) await esperarConectar(await novo(app, cookie))
    const s = await novo(app, cookie)
    const erro = await esperarErroConexao(s)
    expect(erro.data?.codigo).toBe('LIMITE_CONEXOES')
  })

  it('app.close() com sockets abertos termina em menos de 2 s', async () => {
    const outro = await buildApp({ logger: false })
    await outro.ready()
    const u = await criarUsuario({ perfil: 'USUARIO' })
    const s = await conectar(outro, (await headersDe(u.id)).cookie)
    await esperarConectar(s)
    const inicio = Date.now()
    await outro.close()
    expect(Date.now() - inicio).toBeLessThan(2000)
    s.disconnect()
  })
})
