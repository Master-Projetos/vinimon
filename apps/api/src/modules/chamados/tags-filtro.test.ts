import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { criarArea, criarUsuario, headersDe, limparBanco } from '../../../test/ajudantes'
import { criarChamado, semearBase } from '../../../test/fabricas'
import { type App, buildApp } from '../../app'
import { prisma } from '../../lib/prisma'

describe('GET /chamados: filtro de tags E/OU/NÃO (T-14.5)', () => {
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
    await semearBase()
  })

  const get = (url: string, headers: Record<string, string>) => app.inject({ method: 'GET', url, headers })
  const ids = (res: { json(): { itens: Array<{ id: number }> } }) =>
    res
      .json()
      .itens.map((i) => i.id)
      .sort((a, b) => a - b)

  async function cenario() {
    const A = await criarArea()
    const u = await criarUsuario({ perfil: 'USUARIO' })
    const o = await criarUsuario({ perfil: 'OPERADOR', areaId: A.id })
    const c1 = await criarChamado({ solicitanteId: u.id, areaId: A.id })
    const c2 = await criarChamado({ solicitanteId: u.id, areaId: A.id })
    const c3 = await criarChamado({ solicitanteId: u.id, areaId: A.id })
    const t1 = await prisma.tag.create({ data: { nome: 'Rede', nomeNormalizado: 'rede' } })
    const t2 = await prisma.tag.create({ data: { nome: 'Urgente', nomeNormalizado: 'urgente' } })
    // c1: t1 e t2 · c2: t1 · c3: sem tags
    await prisma.chamadoTag.createMany({
      data: [
        { chamadoId: c1.id, tagId: t1.id },
        { chamadoId: c1.id, tagId: t2.id },
        { chamadoId: c2.id, tagId: t1.id },
      ],
    })
    return {
      c1: c1.id,
      c2: c2.id,
      c3: c3.id,
      t1: t1.id,
      t2: t2.id,
      hO: await headersDe(o.id),
      hU: await headersDe(u.id),
    }
  }

  it('todas (E), alguma (OU) e nenhuma (NÃO), isoladas e combinadas', async () => {
    const x = await cenario()
    const base = '/api/v1/chamados?visao=todos'
    expect(ids(await get(`${base}&tagIds=${x.t1}&tagIds=${x.t2}`, x.hO))).toEqual([x.c1])
    expect(ids(await get(`${base}&tagIdsAlguma=${x.t1}&tagIdsAlguma=${x.t2}`, x.hO))).toEqual([x.c1, x.c2])
    expect(ids(await get(`${base}&tagIdsNenhuma=${x.t2}`, x.hO))).toEqual([x.c2, x.c3])
    expect(ids(await get(`${base}&tagIdsAlguma=${x.t1}&tagIdsNenhuma=${x.t2}`, x.hO))).toEqual([x.c2])
  })

  it('USUARIO com filtro de tag recebe 403', async () => {
    const x = await cenario()
    for (const q of ['tagIds', 'tagIdsAlguma', 'tagIdsNenhuma']) {
      const res = await get(`/api/v1/chamados?visao=todos&${q}=${x.t1}`, x.hU)
      expect(res.statusCode, q).toBe(403)
    }
  })
})
