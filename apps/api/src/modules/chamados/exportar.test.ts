import { BOM_CSV, ChamadoFiltrosSchema } from '@vinimon/shared'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { criarArea, criarUsuario, headersDe, limparBanco } from '../../../test/ajudantes'
import { criarChamado, semearBase } from '../../../test/fabricas'
import { type App, buildApp } from '../../app'
import { prisma } from '../../lib/prisma'
import { exportarChamados } from './exportar'

const CABECALHO = [
  'Nº',
  'Assunto',
  'Status',
  'Prioridade',
  'Área',
  'Tipo de problema',
  'Solicitante',
  'Operador',
  'Canal',
  'Abertura',
  'Primeira resposta',
  'Encerramento',
  'Prazo de solução',
  'SLA de solução cumprido',
].join(';')

describe('GET /chamados/exportar (T-5.12, S82, S87)', () => {
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

  /** Área A (operador O1) e área B (operador O2). c1 e c2 são da área A; c3 é da área B. */
  async function cenario() {
    const A = await criarArea()
    const B = await criarArea()
    const u1 = await criarUsuario({ perfil: 'USUARIO' })
    const o1 = await criarUsuario({ perfil: 'OPERADOR', areaId: A.id })
    const o2 = await criarUsuario({ perfil: 'OPERADOR', areaId: B.id })
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const c1 = await criarChamado({ solicitanteId: u1.id, areaId: A.id })
    const c2 = await criarChamado({ solicitanteId: u1.id, areaId: A.id, papel: 'EM_ATENDIMENTO', operadorId: o1.id })
    const c3 = await criarChamado({ solicitanteId: u1.id, areaId: B.id })
    await prisma.chamado.update({ where: { id: c1.id }, data: { assunto: '=HYPERLINK(1)' } })
    return {
      A,
      B,
      u1,
      o1,
      o2,
      admin,
      c: { c1: c1.id, c2: c2.id, c3: c3.id },
      hU1: await headersDe(u1.id),
      hO1: await headersDe(o1.id),
      hO2: await headersDe(o2.id),
      hAdmin: await headersDe(admin.id),
    }
  }

  /** Linhas de dados (sem BOM e sem cabeçalho). */
  const linhasDe = (corpo: string): string[] =>
    corpo
      .slice(BOM_CSV.length)
      .split('\r\n')
      .filter((l) => l !== '')
      .slice(1)

  it('401 sem sessão', async () => {
    const res = await get('/api/v1/chamados/exportar')
    expect(res.statusCode).toBe(401)
  })

  it('403 para USUARIO (sem relatorio.ver)', async () => {
    const x = await cenario()
    const res = await get('/api/v1/chamados/exportar', x.hU1)
    expect(res.statusCode).toBe(403)
  })

  it('400 com detalhes para filtro inválido', async () => {
    const x = await cenario()
    const res = await get('/api/v1/chamados/exportar?visao=inexistente', x.hAdmin)
    expect(res.statusCode).toBe(400)
    expect(res.json().erro.codigo).toBe('VALIDACAO')
    expect(res.json().erro.detalhes.length).toBeGreaterThan(0)
  })

  it('caminho feliz: BOM, cabeçalho na ordem, nome do arquivo e uma linha por chamado', async () => {
    const x = await cenario()
    const res = await get('/api/v1/chamados/exportar', x.hAdmin)
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8')
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="?chamados-\d{4}-\d{2}-\d{2}\.csv"?$/)
    expect(res.body.startsWith(BOM_CSV)).toBe(true)
    expect(res.body.slice(BOM_CSV.length).split('\r\n')[0]).toBe(CABECALHO)
    expect(linhasDe(res.body)).toHaveLength(3)
    expect(linhasDe(res.body).join('\n')).toContain(`${x.c.c2};`)
  })

  it('assunto com fórmula sai com o prefixo apóstrofo (S82)', async () => {
    const x = await cenario()
    const res = await get('/api/v1/chamados/exportar', x.hAdmin)
    const linha = linhasDe(res.body).find((l) => l.startsWith(`${x.c.c1};`))
    expect(linha?.split(';')[1]).toBe("'=HYPERLINK(1)")
  })

  it('contagem de linhas igual ao total da lista com os mesmos filtros', async () => {
    const x = await cenario()
    const filtros = '?areaIds=' + x.A.id
    const lista = await get(`/api/v1/chamados${filtros}`, x.hO1)
    const csv = await get(`/api/v1/chamados/exportar${filtros}`, x.hO1)
    expect(csv.statusCode).toBe(200)
    expect(linhasDe(csv.body)).toHaveLength(lista.json().total)
    expect(lista.json().total).toBe(2)
  })

  it('OPERADOR com areaIds de outra área recebe só BOM e cabeçalho (sem 403, sem linhas de outra área)', async () => {
    const x = await cenario()
    const res = await get(`/api/v1/chamados/exportar?areaIds=${x.B.id}`, x.hO1)
    expect(res.statusCode).toBe(200)
    expect(res.body).toBe(`${BOM_CSV}${CABECALHO}\r\n`)
  })

  it('grava auditoria exportacao.csv com os filtros e o número de linhas', async () => {
    const x = await cenario()
    await get('/api/v1/chamados/exportar?areaIds=' + x.A.id, x.hO1)
    const registro = await prisma.auditoria.findFirst({
      where: { acao: 'exportacao.csv' },
      select: { atorId: true, entidade: true, dados: true },
    })
    expect(registro?.atorId).toBe(x.o1.id)
    expect(registro?.entidade).toBe('chamado')
    expect(registro?.dados).toMatchObject({ linhas: 2, filtros: { areaIds: [x.A.id] } })
  })

  it('para no limite de linhas e audita só as linhas emitidas', async () => {
    const x = await cenario()
    const usuario = {
      id: x.admin.id,
      nome: 'Administrador de teste',
      login: 'admin-teste',
      perfil: 'ADMIN' as const,
      areaId: null,
      areaIds: [],
      sessaoId: 'sessao-teste',
      estado: 'ATIVA' as const,
      mfaAtivo: false,
    }
    const filtros = ChamadoFiltrosSchema.parse({})
    const exp = await exportarChamados({ usuario, ip: null, userAgent: null, requestId: null }, filtros, new Date(), {
      limite: 2,
      lote: 1,
    })
    let texto = ''
    for await (const parte of exp.fluxo) texto += String(parte)
    expect(linhasDe(texto)).toHaveLength(2)
    const registro = await prisma.auditoria.findFirst({ where: { acao: 'exportacao.csv' }, select: { dados: true } })
    expect(registro?.dados).toMatchObject({ linhas: 2 })
  })
})
