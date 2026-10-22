import { CONFIG_PADRAO } from '@vinimon/shared'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { criarUsuario, headersDe, limparBanco, ORIGEM } from '../../../test/ajudantes'
import { type App, buildApp } from '../../app'
import { prisma } from '../../lib/prisma'

describe('módulo configuração', () => {
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
  })

  it('401 sem sessão', async () => {
    const leitura = await app.inject({ method: 'GET', url: '/api/v1/config' })
    expect(leitura.statusCode).toBe(401)
    expect(leitura.json()).toMatchObject({ erro: { codigo: 'NAO_AUTENTICADO' } })

    const escrita = await app.inject({
      method: 'PATCH',
      url: '/api/v1/config',
      headers: { origin: ORIGEM },
      payload: { 'sistema.nome': 'Outro' },
    })
    expect(escrita.statusCode).toBe(401)
    expect(escrita.json()).toMatchObject({ erro: { codigo: 'NAO_AUTENTICADO' } })
  })

  it('403 para USUARIO e OPERADOR, em leitura e escrita', async () => {
    for (const perfil of ['USUARIO', 'OPERADOR'] as const) {
      const u = await criarUsuario({ perfil })
      const headers = await headersDe(u.id)
      const leitura = await app.inject({ method: 'GET', url: '/api/v1/config', headers })
      expect(leitura.statusCode).toBe(403)
      expect(leitura.json().erro.codigo).toBe('SEM_PERMISSAO')

      const escrita = await app.inject({
        method: 'PATCH',
        url: '/api/v1/config',
        headers,
        payload: { 'sistema.nome': 'Outro' },
      })
      expect(escrita.statusCode).toBe(403)
      expect(escrita.json().erro.codigo).toBe('SEM_PERMISSAO')
    }
  })

  it('GET devolve os padrões quando a tabela está vazia', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const res = await app.inject({ method: 'GET', url: '/api/v1/config', headers: await headersDe(admin.id) })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual(CONFIG_PADRAO)
  })

  it('PATCH grava, o GET reflete e a auditoria traz só as chaves alteradas', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)

    const alterada = await app.inject({
      method: 'PATCH',
      url: '/api/v1/config',
      headers,
      payload: {
        'sistema.nome': 'Vinimon Teste',
        'anexos.tamanhoMaxMb': 5,
        'sistema.organizacao': CONFIG_PADRAO['sistema.organizacao'],
      },
    })
    expect(alterada.statusCode).toBe(200)
    expect(alterada.json()).toMatchObject({ 'sistema.nome': 'Vinimon Teste', 'anexos.tamanhoMaxMb': 5 })

    const lida = await app.inject({ method: 'GET', url: '/api/v1/config', headers })
    expect(lida.json()).toMatchObject({ 'sistema.nome': 'Vinimon Teste', 'anexos.tamanhoMaxMb': 5 })

    const auditorias = await prisma.auditoria.findMany({ where: { acao: 'config.alterada' } })
    expect(auditorias).toHaveLength(1)
    expect(auditorias[0]?.dados).toEqual({
      antes: { 'sistema.nome': 'Vinimon', 'anexos.tamanhoMaxMb': 10 },
      depois: { 'sistema.nome': 'Vinimon Teste', 'anexos.tamanhoMaxMb': 5 },
    })
  })

  it('PATCH sem mudança de valor não audita', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/config',
      headers: await headersDe(admin.id),
      payload: { 'sistema.nome': CONFIG_PADRAO['sistema.nome'] },
    })
    expect(res.statusCode).toBe(200)
    expect(await prisma.auditoria.count({ where: { acao: 'config.alterada' } })).toBe(0)
  })

  it('400 com detalhes para chave desconhecida e valor fora da faixa, sem gravar nada', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)

    const desconhecida = await app.inject({
      method: 'PATCH',
      url: '/api/v1/config',
      headers,
      payload: { 'sistema.inexistente': 'x' },
    })
    expect(desconhecida.statusCode).toBe(400)
    expect(desconhecida.json().erro.codigo).toBe('VALIDACAO')

    const foraDaFaixa = await app.inject({
      method: 'PATCH',
      url: '/api/v1/config',
      headers,
      payload: { 'anexos.tamanhoMaxMb': 99 },
    })
    expect(foraDaFaixa.statusCode).toBe(400)
    expect(foraDaFaixa.json().erro.codigo).toBe('VALIDACAO')
    expect(foraDaFaixa.json().erro.detalhes).toEqual([expect.objectContaining({ campo: 'anexos.tamanhoMaxMb' })])

    expect(await prisma.config.count()).toBe(0)
  })

  it('422 para jornada padrão inexistente (REFERENCIA_INVALIDA) e inativa (REGRA_NEGOCIO)', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)

    const inexistente = await app.inject({
      method: 'PATCH',
      url: '/api/v1/config',
      headers,
      payload: { 'sla.jornadaPadraoId': 9999 },
    })
    expect(inexistente.statusCode).toBe(422)
    expect(inexistente.json().erro.codigo).toBe('REFERENCIA_INVALIDA')

    const inativa = await prisma.jornada.create({
      data: { nome: 'Jornada inativa', ativo: false },
      select: { id: true },
    })
    const rejeitada = await app.inject({
      method: 'PATCH',
      url: '/api/v1/config',
      headers,
      payload: { 'sla.jornadaPadraoId': inativa.id },
    })
    expect(rejeitada.statusCode).toBe(422)
    expect(rejeitada.json().erro.codigo).toBe('REGRA_NEGOCIO')
    expect(await prisma.config.count()).toBe(0)
  })

  it('200 e leitura refletida para jornada padrão ativa', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const ativa = await prisma.jornada.create({ data: { nome: 'Jornada ativa', ativo: true }, select: { id: true } })

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/config',
      headers,
      payload: { 'sla.jornadaPadraoId': ativa.id },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()['sla.jornadaPadraoId']).toBe(ativa.id)

    const lida = await app.inject({ method: 'GET', url: '/api/v1/config', headers })
    expect(lida.json()['sla.jornadaPadraoId']).toBe(ativa.id)
  })
})
