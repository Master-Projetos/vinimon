import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { criarArea, criarUsuario, headersDe, limparBanco } from '../../../test/ajudantes'
import { criarAtivo, criarChamado } from '../../../test/fabricas'
import { type App, buildApp } from '../../app'
import { prisma } from '../../lib/prisma'

describe('módulo busca', () => {
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

  const buscar = (headers: Record<string, string>, q: string, extra = '') =>
    app.inject({ method: 'GET', url: `/api/v1/busca?q=${encodeURIComponent(q)}${extra}`, headers })

  async function cenario() {
    const area = await criarArea()
    const outraArea = await criarArea()
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const operador = await criarUsuario({ perfil: 'OPERADOR', areaId: area.id })
    const solicitante = await criarUsuario({ perfil: 'USUARIO' })
    const h = {
      admin: await headersDe(admin.id),
      operador: await headersDe(operador.id),
      usuario: await headersDe(solicitante.id),
    }
    return { area, outraArea, admin, operador, solicitante, h }
  }

  const definirAssunto = (id: number, assunto: string) => prisma.chamado.update({ where: { id }, data: { assunto } })

  const criarArtigoDireto = (titulo: string, extra: { situacao?: 'PUBLICADO' | 'RASCUNHO'; interno?: boolean } = {}) =>
    prisma.artigo.create({
      data: {
        titulo,
        conteudo: 'Conteúdo do artigo.',
        situacao: extra.situacao ?? 'PUBLICADO',
        visibilidade: extra.interno ? 'INTERNO' : 'PUBLICO',
      },
      select: { id: true },
    })

  it('401 sem sessão', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/busca?q=teste' })
    expect(res.statusCode).toBe(401)
  })

  it('400 com detalhes para q curta, longa, ausente e limite inválido', async () => {
    const { h } = await cenario()
    for (const url of ['q=a', `q=${'x'.repeat(101)}`, '', 'q=teste&limite=6', 'q=teste&limite=0']) {
      const res = await app.inject({ method: 'GET', url: `/api/v1/busca?${url}`, headers: h.admin })
      expect(res.statusCode).toBe(400)
      expect(res.json().erro.detalhes.length).toBeGreaterThan(0)
    }
    expect((await buscar(h.admin, '7')).statusCode).toBe(200) // número de um dígito vale
    expect((await buscar(h.admin, '#7')).statusCode).toBe(200)
  })

  it('caminho feliz: encontra chamado, artigo, ativo e pessoa, com DTOs enxutos', async () => {
    const { area, admin, solicitante, h } = await cenario()
    const chamado = await criarChamado({ solicitanteId: solicitante.id, areaId: area.id })
    await definirAssunto(chamado.id, 'Impressora quebrada no térreo')
    const artigo = await criarArtigoDireto('Como configurar a impressora')
    const ativo = await criarAtivo()
    await prisma.ativo.update({ where: { id: ativo.id }, data: { modelo: 'Impressora HP' } })
    await prisma.usuario.update({ where: { id: solicitante.id }, data: { nome: 'Fulana Impressora' } })

    const res = await buscar(h.admin, 'impressora')
    expect(res.statusCode).toBe(200)
    const corpo = res.json()
    expect(corpo.chamados).toEqual([
      {
        id: chamado.id,
        assunto: 'Impressora quebrada no térreo',
        statusNome: expect.any(String),
        statusTipo: 'ABERTO',
      },
    ])
    expect(corpo.artigos).toEqual([{ id: artigo.id, titulo: 'Como configurar a impressora', resumo: null }])
    expect(corpo.ativos).toEqual([{ id: ativo.id, etiqueta: ativo.etiqueta, modelo: 'Impressora HP' }])
    expect(corpo.usuarios).toEqual([{ id: solicitante.id, nome: 'Fulana Impressora', perfil: 'USUARIO' }])
    expect(JSON.stringify(corpo)).not.toContain(admin.login)
  })

  it('busca com e sem acento dá o mesmo resultado', async () => {
    const { area, solicitante, h } = await cenario()
    const chamado = await criarChamado({ solicitanteId: solicitante.id, areaId: area.id })
    await definirAssunto(chamado.id, 'Impressão travada')
    const artigo = await criarArtigoDireto('Solução para impressão')
    await prisma.usuario.update({ where: { id: solicitante.id }, data: { nome: 'José Impressão' } })
    const [com, sem, maiuscula] = await Promise.all([
      buscar(h.admin, 'impressão'),
      buscar(h.admin, 'impressao'),
      buscar(h.admin, 'IMPRESSÃO'),
    ])
    expect(com.json()).toEqual(sem.json())
    expect(com.json()).toEqual(maiuscula.json())
    expect(com.json().chamados.map((c: { id: number }) => c.id)).toEqual([chamado.id])
    expect(com.json().artigos.map((a: { id: number }) => a.id)).toEqual([artigo.id])
    expect(com.json().usuarios).toHaveLength(1)
  })

  it('S106/T62: chamado de outra área não aparece, nem pelo número; o solicitante vê só os seus', async () => {
    const { area, outraArea, operador, solicitante, h } = await cenario()
    const outroSolicitante = await criarUsuario({ perfil: 'USUARIO' })
    const meu = await criarChamado({ solicitanteId: solicitante.id, areaId: outraArea.id })
    const daArea = await criarChamado({ solicitanteId: outroSolicitante.id, areaId: area.id, operadorId: operador.id })
    const alheio = await criarChamado({ solicitanteId: outroSolicitante.id, areaId: outraArea.id })
    for (const id of [meu.id, daArea.id, alheio.id]) await definirAssunto(id, `Rede lenta ${id}`)

    const op = await buscar(h.operador, 'rede lenta')
    expect(op.json().chamados.map((c: { id: number }) => c.id)).toEqual([daArea.id])
    const opNumero = await buscar(h.operador, `#${alheio.id}`)
    expect(opNumero.json().chamados).toEqual([])
    const usu = await buscar(h.usuario, 'rede lenta')
    expect(usu.json().chamados.map((c: { id: number }) => c.id)).toEqual([meu.id])
    expect((await buscar(h.usuario, String(alheio.id))).json().chamados).toEqual([])
    const adm = await buscar(h.admin, 'rede lenta')
    expect(adm.json().chamados.map((c: { id: number }) => c.id)).toEqual([alheio.id, daArea.id, meu.id])
  })

  it('o número exato vem primeiro, com ou sem #; status ignorado só aparece pelo número', async () => {
    const { area, solicitante, h } = await cenario()
    // o texto só casa com números de 2+ dígitos (tokens têm 2 a 30 caracteres): cria 12 chamados
    const criados = []
    for (let i = 0; i < 12; i++) criados.push(await criarChamado({ solicitanteId: solicitante.id, areaId: area.id }))
    const [b, c] = criados
    const a = criados[11]
    if (!a || !b || !c) throw new Error('fábrica não criou os chamados')
    expect(a.id).toBeGreaterThanOrEqual(10)
    for (const x of criados) await definirAssunto(x.id, 'Neutro')
    await definirAssunto(b.id, `Referente ao chamado ${a.id}`)
    await definirAssunto(c.id, `Também cita ${a.id}`)
    for (const q of [String(a.id), `#${a.id}`]) {
      const ids = (await buscar(h.admin, q)).json().chamados.map((x: { id: number }) => x.id)
      expect(ids).toEqual([a.id, c.id, b.id])
    }
    const ignorado = await prisma.status.create({
      data: { nome: 'Status ignorado de teste', tipo: 'ABERTO', ignorado: true },
      select: { id: true },
    })
    await prisma.chamado.update({ where: { id: b.id }, data: { statusId: ignorado.id, statusTipo: 'ABERTO' } })
    const porTexto = (await buscar(h.admin, `chamado ${a.id}`)).json().chamados
    // b (status ignorado) some; c continua, porque a descrição padrão também cita "chamado"
    expect(porTexto.map((x: { id: number }) => x.id)).toEqual([c.id])
    const pelaNumero = (await buscar(h.admin, `#${b.id}`)).json().chamados
    expect(pelaNumero.map((x: { id: number }) => x.id)).toEqual([b.id])
  })

  it('T62: % não devolve tudo e "50%" é texto literal', async () => {
    const { area, solicitante, h } = await cenario()
    const a = await criarChamado({ solicitanteId: solicitante.id, areaId: area.id })
    const b = await criarChamado({ solicitanteId: solicitante.id, areaId: area.id })
    await definirAssunto(a.id, 'Desconto de 50% na fatura')
    await definirAssunto(b.id, 'Outro assunto qualquer')
    expect((await buscar(h.admin, '%')).statusCode).toBe(400)
    for (const q of ['%%', '__', '\\\\']) {
      const corpo = (await buscar(h.admin, q)).json()
      expect(corpo).toEqual({ chamados: [], artigos: [], ativos: [], usuarios: [] })
    }
    const r = (await buscar(h.admin, '50%')).json()
    expect(r.chamados.map((x: { id: number }) => x.id)).toEqual([a.id])
  })

  it('S107/T62: USUARIO não vê ativos nem pessoas; a equipe vê só usuários ativos', async () => {
    const { area, h } = await cenario()
    const ativo = await criarAtivo()
    const inativo = await criarUsuario({ perfil: 'OPERADOR', areaId: area.id, ativo: false })
    await prisma.usuario.update({ where: { id: inativo.id }, data: { nome: 'Zeca Inativo' } })
    await prisma.ativo.update({ where: { id: ativo.id }, data: { modelo: 'Zeca Modelo' } })
    const usuario = (await buscar(h.usuario, 'zeca')).json()
    expect(usuario.ativos).toEqual([])
    expect(usuario.usuarios).toEqual([])
    const equipe = (await buscar(h.operador, 'zeca')).json()
    expect(equipe.ativos).toHaveLength(1)
    expect(equipe.usuarios).toEqual([])
    await prisma.usuario.update({ where: { id: inativo.id }, data: { ativo: true } })
    expect((await buscar(h.operador, 'zeca')).json().usuarios).toHaveLength(1)
  })

  it('S108: artigo rascunho nunca aparece; INTERNO só com conhecimento.verInterno', async () => {
    const { h } = await cenario()
    const publico = await criarArtigoDireto('Guia de VPN público')
    const interno = await criarArtigoDireto('Guia de VPN interno', { interno: true })
    await criarArtigoDireto('Guia de VPN rascunho', { situacao: 'RASCUNHO' })
    const ids = async (headers: Record<string, string>) =>
      (await buscar(headers, 'vpn')).json().artigos.map((a: { id: number }) => a.id)
    expect(await ids(h.usuario)).toEqual([publico.id])
    expect((await ids(h.operador)).sort()).toEqual([publico.id, interno.id].sort())
    expect((await ids(h.admin)).sort()).toEqual([publico.id, interno.id].sort())
  })

  it('respeita o limite (padrão e máximo 5)', async () => {
    const { area, solicitante, h } = await cenario()
    for (let i = 0; i < 7; i++) {
      const c = await criarChamado({ solicitanteId: solicitante.id, areaId: area.id })
      await definirAssunto(c.id, 'Problema recorrente')
    }
    expect((await buscar(h.admin, 'recorrente')).json().chamados).toHaveLength(5)
    expect((await buscar(h.admin, 'recorrente', '&limite=2')).json().chamados).toHaveLength(2)
  })
})
