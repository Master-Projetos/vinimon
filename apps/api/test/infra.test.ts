import { beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app'
import { prisma } from '../src/lib/prisma'
import { criarUsuario, headersDe, limparBanco } from './ajudantes'

describe('infraestrutura de testes', () => {
  beforeEach(limparBanco)

  it('limparBanco zera a tabela usuarios', async () => {
    await criarUsuario({ perfil: 'ADMIN' })
    expect(await prisma.usuario.count()).toBe(1)
    await limparBanco()
    expect(await prisma.usuario.count()).toBe(0)
  })

  it('usuário com sessão ativa acessa a API', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const app = await buildApp({ logger: false })
    try {
      const res = await app.inject({ method: 'GET', url: '/api/v1/saude', headers })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ ok: true })
    } finally {
      await app.close()
    }
  })

  it('rota inexistente devolve ROTA_INEXISTENTE', async () => {
    const app = await buildApp({ logger: false })
    try {
      const res = await app.inject({ method: 'GET', url: '/api/v1/xyz' })
      expect(res.statusCode).toBe(404)
      expect(res.json().erro.codigo).toBe('ROTA_INEXISTENTE')
    } finally {
      await app.close()
    }
  })
})
