import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { criarArea, criarUsuario, headersDe, limparBanco } from '../../../test/ajudantes'
import { criarChamado, criarProblema, semearBase } from '../../../test/fabricas'
import { type App, buildApp } from '../../app'
import { prisma } from '../../lib/prisma'
import { registrarEvento } from './eventos'

describe('GET /chamados/:id, /historico e /reincidencia (S46, S49)', () => {
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

  const get = (url: string, headers?: Record<string, string>) =>
    app.inject({ method: 'GET', url, ...(headers ? { headers } : {}) })

  /** U1 é o solicitante; O1 é o operador responsável (área A); O2 é de outra área; U2 é outro USUARIO. */
  async function cenario() {
    const A = await criarArea()
    const B = await criarArea()
    const u1 = await criarUsuario({ perfil: 'USUARIO' })
    const u2 = await criarUsuario({ perfil: 'USUARIO' })
    const o1 = await criarUsuario({ perfil: 'OPERADOR', areaId: A.id })
    const o2 = await criarUsuario({ perfil: 'OPERADOR', areaId: B.id })
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const chamado = await criarChamado({
      solicitanteId: u1.id,
      areaId: A.id,
      papel: 'EM_ATENDIMENTO',
      operadorId: o1.id,
    })
    return {
      A,
      B,
      u1,
      u2,
      o1,
      o2,
      admin,
      chamado,
      hU1: await headersDe(u1.id),
      hU2: await headersDe(u2.id),
      hO1: await headersDe(o1.id),
      hO2: await headersDe(o2.id),
      hAdmin: await headersDe(admin.id),
    }
  }

  it('401 sem sessão e 400 para id inválido', async () => {
    const x = await cenario()
    for (const url of [
      `/api/v1/chamados/${x.chamado.id}`,
      `/api/v1/chamados/${x.chamado.id}/historico`,
      '/api/v1/chamados/reincidencia',
    ]) {
      const res = await get(url)
      expect(res.statusCode, url).toBe(401)
      expect(res.json().erro.codigo).toBe('NAO_AUTENTICADO')
    }
    for (const id of ['abc', '0', '-3']) expect((await get(`/api/v1/chamados/${id}`, x.hO1)).statusCode, id).toBe(400)
    expect((await get('/api/v1/chamados/abc/historico', x.hO1)).statusCode).toBe(400)
  })

  it('fora do escopo dá 404, idêntico ao de chamado inexistente (S46); o mesmo no histórico', async () => {
    const x = await cenario()
    for (const sufixo of ['', '/historico']) {
      const inexistente = await get(`/api/v1/chamados/999999${sufixo}`, x.hO1)
      expect(inexistente.statusCode).toBe(404)
      for (const h of [x.hU2, x.hO2]) {
        const fora = await get(`/api/v1/chamados/${x.chamado.id}${sufixo}`, h)
        expect(fora.statusCode, sufixo).toBe(404)
        const semRequestId = (r: { json(): { erro: Record<string, unknown> } }) => ({
          ...r.json().erro,
          requestId: undefined,
        })
        expect(semRequestId(fora)).toEqual(semRequestId(inexistente)) // nada distingue "existe mas é de outro" de "não existe"
      }
    }
  })

  it('o solicitante, o operador responsável, o da área e o ADMIN veem o detalhe', async () => {
    const x = await cenario()
    for (const h of [x.hU1, x.hO1, x.hAdmin]) {
      const res = await get(`/api/v1/chamados/${x.chamado.id}`, h)
      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({
        id: x.chamado.id,
        versao: 0,
        status: { tipo: 'EM_ATENDIMENTO' },
        solicitante: { id: x.u1.id },
        operador: { id: x.o1.id },
      })
    }
    const responsavelDeOutraArea = await criarUsuario({ perfil: 'OPERADOR', areaId: x.B.id })
    await prisma.chamado.update({ where: { id: x.chamado.id }, data: { operadorId: responsavelDeOutraArea.id } })
    expect((await get(`/api/v1/chamados/${x.chamado.id}`, await headersDe(responsavelDeOutraArea.id))).statusCode).toBe(
      200,
    ) // responsável vê
    expect((await get(`/api/v1/chamados/${x.chamado.id}`, x.hO2)).statusCode).toBe(404) // outro operador da B, não
  })

  it('USUARIO não recebe `descricaoTecnica` nem `tags`; a equipe recebe', async () => {
    const x = await cenario()
    await prisma.chamado.update({ where: { id: x.chamado.id }, data: { descricaoTecnica: 'Cartucho 85A trocado' } })
    const tag = await prisma.tag.create({ data: { nome: 'Rede', nomeNormalizado: 'rede' } })
    await prisma.chamadoTag.create({ data: { chamadoId: x.chamado.id, tagId: tag.id } })

    const doSolicitante = (await get(`/api/v1/chamados/${x.chamado.id}`, x.hU1)).json()
    expect(doSolicitante).not.toHaveProperty('descricaoTecnica')
    expect(doSolicitante).not.toHaveProperty('tags')

    const daEquipe = (await get(`/api/v1/chamados/${x.chamado.id}`, x.hO1)).json()
    expect(daEquipe.descricaoTecnica).toBe('Cartucho 85A trocado')
    expect(daEquipe.tags).toEqual([{ id: tag.id, nome: 'Rede' }])
  })

  it('operador que é o solicitante do próprio chamado não vê `descricaoTecnica` (F10 da v1)', async () => {
    const x = await cenario()
    const meu = await criarChamado({ solicitanteId: x.o1.id, areaId: x.A.id })
    await prisma.chamado.update({ where: { id: meu.id }, data: { descricaoTecnica: 'texto interno' } })
    const res = (await get(`/api/v1/chamados/${meu.id}`, x.hO1)).json()
    expect(res).not.toHaveProperty('descricaoTecnica')
    expect(res.tags).toEqual([]) // equipe sempre recebe a lista (vazia)
  })

  it('`acoes` vem de `acoesDoUsuario`: o responsável atende, o solicitante só comenta e anexa', async () => {
    const x = await cenario()
    const doO1 = (await get(`/api/v1/chamados/${x.chamado.id}`, x.hO1)).json().acoes
    expect(doO1).toMatchObject({
      assumir: true,
      encaminhar: true,
      concluir: true,
      comentarInterno: true,
      aprovar: false,
    })
    const doU1 = (await get(`/api/v1/chamados/${x.chamado.id}`, x.hU1)).json().acoes
    expect(doU1).toMatchObject({
      comentar: true,
      anexar: true,
      assumir: false,
      comentarInterno: false,
      concluir: false,
      aprovar: false,
    })
    expect(Object.keys(doU1)).toHaveLength(15)
  })

  it('participantes e `seguindo`: solicitante, operador e seguidores; silenciar tira `seguindo`', async () => {
    const x = await cenario()
    await prisma.chamadoSeguidor.createMany({
      data: [
        { chamadoId: x.chamado.id, usuarioId: x.u1.id, motivo: 'SOLICITANTE' },
        { chamadoId: x.chamado.id, usuarioId: x.o1.id, motivo: 'ATRIBUIDO' },
        { chamadoId: x.chamado.id, usuarioId: x.admin.id, motivo: 'MANUAL' },
      ],
    })
    const d = (await get(`/api/v1/chamados/${x.chamado.id}`, x.hAdmin)).json()
    expect(d.participantes.map((p: { papel: string }) => p.papel)).toEqual(['SOLICITANTE', 'OPERADOR', 'SEGUIDOR'])
    expect(d.participantes.at(-1)).toMatchObject({ id: x.admin.id })
    expect(d.seguindo).toBe(true)
    expect((await get(`/api/v1/chamados/${x.chamado.id}`, x.hU2)).statusCode).toBe(404)
    await prisma.chamadoSeguidor.update({
      where: { chamadoId_usuarioId: { chamadoId: x.chamado.id, usuarioId: x.admin.id } },
      data: { silenciadoEm: new Date() },
    })
    expect((await get(`/api/v1/chamados/${x.chamado.id}`, x.hAdmin)).json().seguindo).toBe(false)
  })

  it('o detalhe traz `avaliacao`, SLA e não vaza campo interno do banco', async () => {
    const x = await cenario()
    await prisma.avaliacaoChamado.create({
      data: { chamadoId: x.chamado.id, avaliadorId: x.u1.id, nota: 'OTIMO', comentario: 'Rápido' },
    })
    const res = await get(`/api/v1/chamados/${x.chamado.id}`, x.hU1)
    const d = res.json()
    expect(d.avaliacao).toMatchObject({ nota: 'OTIMO', comentario: 'Rápido', automatica: false })
    expect(Object.keys(d.sla.resposta).sort()).toEqual(['alerta', 'cumprido', 'finalizado', 'meta', 'prazo'])
    expect(res.body).not.toMatch(/buscaNorm|busca_norm|senhaHash|tokenHash|totp|jornadaId/)
  })

  describe('histórico', () => {
    const evento = (
      chamadoId: number,
      tipo: Parameters<typeof registrarEvento>[1]['tipo'],
      atorId: number | null,
      interno = false,
      dados: Record<string, unknown> = {},
    ) => prisma.$transaction((tx) => registrarEvento(tx, { chamadoId, tipo, atorId, interno, dados }))

    it('em ordem de id, com ator e dados; ator nulo para o sistema', async () => {
      const x = await cenario()
      const e1 = await evento(x.chamado.id, 'CRIADO', x.u1.id)
      const e2 = await evento(x.chamado.id, 'ASSUMIDO', x.o1.id, false, { de: null, para: x.o1.id })
      const e3 = await evento(x.chamado.id, 'SLA_RISCO', null)
      const res = await get(`/api/v1/chamados/${x.chamado.id}/historico`, x.hO1)
      expect(res.statusCode).toBe(200)
      const itens = res.json()
      expect(itens.map((i: { id: number }) => i.id)).toEqual([e1, e2, e3])
      expect(itens[0]).toMatchObject({ tipo: 'CRIADO', ator: { id: x.u1.id }, dados: {} })
      expect(itens[1]).toMatchObject({ tipo: 'ASSUMIDO', ator: { id: x.o1.id }, dados: { de: null, para: x.o1.id } })
      expect(itens[2]).toMatchObject({ tipo: 'SLA_RISCO', ator: null })
      expect(itens[0].criadoEm).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })

    it('quem não vê conteúdo interno não recebe eventos `interno=true`; a equipe recebe tudo (S49)', async () => {
      const x = await cenario()
      const publico = await evento(x.chamado.id, 'STATUS_ALTERADO', x.o1.id)
      const interno = await evento(x.chamado.id, 'COMENTARIO', x.o1.id, true)
      expect(
        (await get(`/api/v1/chamados/${x.chamado.id}/historico`, x.hU1)).json().map((i: { id: number }) => i.id),
      ).toEqual([publico])
      expect(
        (await get(`/api/v1/chamados/${x.chamado.id}/historico`, x.hO1)).json().map((i: { id: number }) => i.id),
      ).toEqual([publico, interno])
      expect((await get(`/api/v1/chamados/${x.chamado.id}/historico`, x.hAdmin)).json()).toHaveLength(2)
    })

    it('o solicitante que é OPERADOR também não vê evento interno', async () => {
      const x = await cenario()
      const meu = await criarChamado({ solicitanteId: x.o1.id, areaId: x.A.id })
      const publico = await evento(meu.id, 'CRIADO', x.o1.id)
      await evento(meu.id, 'COMENTARIO', x.admin.id, true)
      const res = await get(`/api/v1/chamados/${meu.id}/historico`, x.hO1)
      expect(res.json().map((i: { id: number }) => i.id)).toEqual([publico])
    })

    it('sem `chamado.atender`, TAGS_ALTERADAS some do histórico mesmo que não seja interno', async () => {
      const x = await cenario()
      const status = await evento(x.chamado.id, 'STATUS_ALTERADO', x.o1.id)
      const tags = await evento(x.chamado.id, 'TAGS_ALTERADAS', x.o1.id, false)
      expect(
        (await get(`/api/v1/chamados/${x.chamado.id}/historico`, x.hU1)).json().map((i: { id: number }) => i.id),
      ).toEqual([status])
      expect(
        (await get(`/api/v1/chamados/${x.chamado.id}/historico`, x.hO1)).json().map((i: { id: number }) => i.id),
      ).toEqual([status, tags])
    })

    it('chamado sem eventos devolve lista vazia', async () => {
      const x = await cenario()
      const res = await get(`/api/v1/chamados/${x.chamado.id}/historico`, x.hO1)
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual([])
    })
  })

  describe('reincidência', () => {
    it('os 10 últimos do ativo, com `emAberto`, só dentro do escopo', async () => {
      const x = await cenario()
      const ativo = await prisma.ativo.create({
        data: { etiqueta: 'ATV-REINC', tipo: { create: { nome: 'Tipo de teste' } } },
      })
      const doAtivo: number[] = []
      for (let i = 0; i < 12; i++) {
        const c = await criarChamado({
          solicitanteId: x.u1.id,
          areaId: x.A.id,
          papel: i === 0 ? 'ENCERRADO' : 'EM_ATENDIMENTO',
        })
        await prisma.chamado.update({ where: { id: c.id }, data: { ativoId: ativo.id } })
        doAtivo.push(c.id)
      }
      const daOutraArea = await criarChamado({ solicitanteId: x.u2.id, areaId: x.B.id })
      await prisma.chamado.update({ where: { id: daOutraArea.id }, data: { ativoId: ativo.id } })

      const comoO1 = (await get(`/api/v1/chamados/reincidencia?ativoId=${ativo.id}`, x.hO1)).json()
      expect(comoO1.ativo).toHaveLength(10)
      expect(comoO1.ativo.map((i: { id: number }) => i.id)).toEqual([...doAtivo].reverse().slice(0, 10)) // id desc, sem o da área B
      expect(comoO1.ativo.every((i: { emAberto: boolean }) => i.emAberto)).toBe(true)
      expect(comoO1.solicitante).toEqual([])

      const encerrado = (await get(`/api/v1/chamados/reincidencia?ativoId=${ativo.id}`, x.hAdmin))
        .json()
        .ativo.find((i: { id: number }) => i.id === doAtivo[0])
      expect(encerrado).toBeUndefined() // fora dos 10 mais recentes
      await prisma.chamado.deleteMany({ where: { id: { in: doAtivo.slice(2) } } })
      const poucos = (await get(`/api/v1/chamados/reincidencia?ativoId=${ativo.id}`, x.hO1)).json().ativo
      expect(poucos.find((i: { id: number }) => i.id === doAtivo[0])).toMatchObject({ emAberto: false })
      expect(poucos.find((i: { id: number }) => i.id === doAtivo[1])).toMatchObject({ emAberto: true })

      const comoU2 = (await get(`/api/v1/chamados/reincidencia?ativoId=${ativo.id}`, x.hU2)).json()
      expect(comoU2.ativo.map((i: { id: number }) => i.id)).toEqual([daOutraArea.id]) // USUARIO só vê os próprios
    })

    it('do mesmo solicitante e problema, só dos últimos 30 dias e do próprio usuário', async () => {
      const x = await cenario()
      const problema = await criarProblema({ areaIds: [x.A.id], areaPadraoId: x.A.id })
      const outroProblema = await criarProblema({ areaIds: [x.A.id], areaPadraoId: x.A.id })
      const novo = (extra: { solicitanteId?: number; problemaId: number; abertoEm?: Date }) =>
        criarChamado({
          solicitanteId: extra.solicitanteId ?? x.u1.id,
          areaId: x.A.id,
          problemaId: extra.problemaId,
          ...(extra.abertoEm ? { abertoEm: extra.abertoEm } : {}),
        })
      const recente = await novo({ problemaId: problema.id })
      await novo({ problemaId: problema.id, abertoEm: new Date(Date.now() - 31 * 86_400_000) }) // antigo demais
      await novo({ problemaId: outroProblema.id }) // outro problema
      await novo({ problemaId: problema.id, solicitanteId: x.u2.id }) // outro solicitante

      const res = (await get(`/api/v1/chamados/reincidencia?problemaId=${problema.id}`, x.hU1)).json()
      expect(res.solicitante.map((i: { id: number }) => i.id)).toEqual([recente.id])
      expect(res.ativo).toEqual([])
      expect(res.solicitante[0]).toMatchObject({ emAberto: true, assunto: expect.any(String) })
    })

    it('sem parâmetros devolve duas listas vazias; id inválido dá 400', async () => {
      const x = await cenario()
      const res = await get('/api/v1/chamados/reincidencia', x.hO1)
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ ativo: [], solicitante: [] })
      expect((await get('/api/v1/chamados/reincidencia?ativoId=abc', x.hO1)).statusCode).toBe(400)
      expect((await get('/api/v1/chamados/reincidencia?problemaId=0', x.hO1)).statusCode).toBe(400)
    })
  })
})
