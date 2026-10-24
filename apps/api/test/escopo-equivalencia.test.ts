import { beforeAll, describe, expect, it } from 'vitest'
import { escopoChamados, podeVerChamado } from '../src/autorizacao/chamados'
import { prisma } from '../src/lib/prisma'
import { carregarSessao, type UsuarioSessao } from '../src/lib/sessao'
import { criarArea, criarUsuario, headersDe, limparBanco } from './ajudantes'
import { criarChamado, semearBase } from './fabricas'

type Ator =
  | 'solicitante'
  | 'outroUsuario'
  | 'operadorDaArea'
  | 'operadorSecundario'
  | 'operadorOutraArea'
  | 'responsavelOutraArea'
  | 'admin'

describe('escopoChamados (Prisma) e podeVerChamado (TS) devolvem o mesmo conjunto (T33)', () => {
  const atores = {} as Record<Ator, UsuarioSessao>
  let chamados: Array<{ id: number; areaId: number; operadorId: number | null; solicitanteId: number }> = []

  beforeAll(async () => {
    await limparBanco()
    await semearBase()
    const A = await criarArea()
    const B = await criarArea()
    const C = await criarArea()
    const solicitante = await criarUsuario({ perfil: 'USUARIO' })
    const outroUsuario = await criarUsuario({ perfil: 'USUARIO' })
    const operadorDaArea = await criarUsuario({ perfil: 'OPERADOR', areaId: A.id })
    const operadorSecundario = await criarUsuario({ perfil: 'OPERADOR', areaId: C.id })
    await prisma.usuarioArea.create({ data: { usuarioId: operadorSecundario.id, areaId: A.id } })
    const operadorOutraArea = await criarUsuario({ perfil: 'OPERADOR', areaId: B.id })
    const responsavelOutraArea = await criarUsuario({ perfil: 'OPERADOR', areaId: B.id })
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const usuarios = {
      solicitante,
      outroUsuario,
      operadorDaArea,
      operadorSecundario,
      operadorOutraArea,
      responsavelOutraArea,
      admin,
    }
    for (const [nome, u] of Object.entries(usuarios) as Array<[Ator, { id: number }]>) {
      const { cookie } = await headersDe(u.id)
      const token = cookie.split('=')[1]
      const sessao = await carregarSessao(token, { tocar: false })
      if (!sessao) throw new Error(`sessão não carregou para ${nome}`)
      atores[nome] = sessao
    }

    const novo = (dados: Parameters<typeof criarChamado>[0]) => criarChamado(dados)
    const criados = [
      await novo({ solicitanteId: solicitante.id, areaId: A.id, papel: 'INICIAL' }), // área primária do operador da A
      await novo({
        solicitanteId: solicitante.id,
        areaId: A.id,
        papel: 'EM_ATENDIMENTO',
        operadorId: operadorDaArea.id,
      }),
      await novo({ solicitanteId: outroUsuario.id, areaId: A.id, papel: 'INICIAL' }),
      await novo({ solicitanteId: solicitante.id, areaId: C.id, papel: 'INICIAL' }), // área primária do secundário
      await novo({ solicitanteId: solicitante.id, areaId: B.id, papel: 'INICIAL' }), // outra área
      await novo({
        solicitanteId: outroUsuario.id,
        areaId: B.id,
        papel: 'EM_ATENDIMENTO',
        operadorId: operadorOutraArea.id,
      }),
      await novo({
        solicitanteId: solicitante.id,
        areaId: A.id,
        papel: 'EM_ATENDIMENTO',
        operadorId: responsavelOutraArea.id,
      }), // responsável de outra área
      await novo({ solicitanteId: operadorOutraArea.id, areaId: A.id, papel: 'INICIAL' }), // solicitante OPERADOR
      await novo({ solicitanteId: operadorDaArea.id, areaId: B.id, papel: 'INICIAL' }), // solicitante OPERADOR em outra área
      await novo({ solicitanteId: solicitante.id, areaId: A.id, papel: 'ENCERRADO', operadorId: operadorDaArea.id }),
      await novo({ solicitanteId: outroUsuario.id, areaId: C.id, papel: 'CANCELADO' }),
      await novo({
        solicitanteId: solicitante.id,
        areaId: B.id,
        papel: 'CONCLUIDO',
        operadorId: responsavelOutraArea.id,
      }),
    ]
    chamados = criados.map((c) => ({
      id: c.id,
      areaId: c.areaId,
      operadorId: c.operadorId,
      solicitanteId: c.solicitanteId,
    }))
  })

  const ids = (xs: Array<{ id: number }>) => xs.map((x) => x.id).sort((a, b) => a - b)

  it('a fixture tem 12 chamados', () => {
    expect(chamados).toHaveLength(12)
  })

  it.each([
    'solicitante',
    'outroUsuario',
    'operadorDaArea',
    'operadorSecundario',
    'operadorOutraArea',
    'responsavelOutraArea',
    'admin',
  ] as const)('T33: ator %s: mesmo conjunto no Prisma e em memória', async (nome) => {
    const u = atores[nome]
    const noBanco = ids(await prisma.chamado.findMany({ where: escopoChamados(u), select: { id: true } }))
    const emMemoria = ids(chamados.filter((c) => podeVerChamado(u, c)))
    expect(noBanco).toEqual(emMemoria)
  })

  it('os conjuntos não são triviais: ninguém vê tudo, exceto o ADMIN, e há quem veja alguns', () => {
    const vistos = (nome: Ator) => chamados.filter((c) => podeVerChamado(atores[nome], c)).length
    expect(vistos('admin')).toBe(12)
    expect(vistos('operadorOutraArea')).toBeGreaterThan(0)
    expect(vistos('operadorOutraArea')).toBeLessThan(12)
    expect(vistos('solicitante')).toBeLessThan(12)
  })
})
