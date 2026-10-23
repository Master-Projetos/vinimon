import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { type App, buildApp } from '../src/app'
import { prisma } from '../src/lib/prisma'
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
const ATORES: readonly Ator[] = [
  'solicitante',
  'outroUsuario',
  'operadorDaArea',
  'operadorSecundario',
  'operadorOutraArea',
  'responsavelOutraArea',
  'admin',
]
/** Quem enxerga o chamado (área A, responsável = o operador de outra área, solicitante = `solicitante`). */
const VE: Record<Ator, boolean> = {
  solicitante: true,
  outroUsuario: false,
  operadorDaArea: true,
  operadorSecundario: true,
  operadorOutraArea: false,
  responsavelOutraArea: true,
  admin: true,
}
const EH_USUARIO: Record<Ator, boolean> = {
  solicitante: true,
  outroUsuario: true,
  operadorDaArea: false,
  operadorSecundario: false,
  operadorOutraArea: false,
  responsavelOutraArea: false,
  admin: false,
}
/** Quem pode reabrir um chamado encerrado: solicitante, último operador e ADMIN. */
const PODE_REABRIR: Record<Ator, boolean> = {
  solicitante: true,
  outroUsuario: false,
  operadorDaArea: false,
  operadorSecundario: false,
  operadorOutraArea: false,
  responsavelOutraArea: true,
  admin: true,
}

type Tipo = 'leitura' | 'atender' | 'soSolicitante' | 'cancelar' | 'reabrir'
interface Rota {
  nome: string
  metodo: 'GET' | 'POST' | 'PUT' | 'DELETE'
  caminho: string
  corpo?: Record<string, unknown>
  tipo: Tipo
  /** Status de quem passa por escopo e permissão (o corpo tem `versao` velha de propósito, quando há `versao`). */
  ok: number
}

const VELHA = 999
const AMANHA = () => new Date(Date.now() + 24 * 3600_000).toISOString()

const ROTAS: Rota[] = [
  { nome: 'detalhe', metodo: 'GET', caminho: '', tipo: 'leitura', ok: 200 },
  { nome: 'histórico', metodo: 'GET', caminho: '/historico', tipo: 'leitura', ok: 200 },
  { nome: 'seguir', metodo: 'PUT', caminho: '/seguir', tipo: 'leitura', ok: 204 },
  { nome: 'deixar de seguir', metodo: 'DELETE', caminho: '/seguir', tipo: 'leitura', ok: 204 },
  { nome: 'assumir', metodo: 'POST', caminho: '/assumir', corpo: { versao: VELHA }, tipo: 'atender', ok: 409 },
  {
    nome: 'encaminhar',
    metodo: 'POST',
    caminho: '/encaminhar',
    corpo: { versao: VELHA, areaId: 1 },
    tipo: 'atender',
    ok: 409,
  },
  {
    nome: 'status',
    metodo: 'POST',
    caminho: '/status',
    corpo: { versao: VELHA, statusId: 1 },
    tipo: 'atender',
    ok: 409,
  },
  {
    nome: 'prioridade',
    metodo: 'POST',
    caminho: '/prioridade',
    corpo: { versao: VELHA, prioridadeId: 1 },
    tipo: 'atender',
    ok: 409,
  },
  {
    nome: 'classificação',
    metodo: 'POST',
    caminho: '/classificacao',
    corpo: { versao: VELHA, canalId: 1 },
    tipo: 'atender',
    ok: 409,
  },
  {
    nome: 'agendar',
    metodo: 'POST',
    caminho: '/agendar',
    corpo: { versao: VELHA, para: 'AMANHA' },
    tipo: 'atender',
    ok: 409,
  },
  {
    nome: 'concluir',
    metodo: 'POST',
    caminho: '/concluir',
    corpo: { versao: VELHA, solucao: 'Resolvido.' },
    tipo: 'atender',
    ok: 409,
  },
  { nome: 'tags', metodo: 'PUT', caminho: '/tags', corpo: { tags: [] }, tipo: 'atender', ok: 200 },
  {
    nome: 'aprovar',
    metodo: 'POST',
    caminho: '/aprovar',
    corpo: { versao: VELHA, nota: 'BOM' },
    tipo: 'soSolicitante',
    ok: 403,
  },
  {
    nome: 'rejeitar',
    metodo: 'POST',
    caminho: '/rejeitar',
    corpo: { versao: VELHA, motivo: 'Não resolveu.' },
    tipo: 'soSolicitante',
    ok: 403,
  },
  {
    nome: 'cancelar',
    metodo: 'POST',
    caminho: '/cancelar',
    corpo: { versao: VELHA, motivo: 'Não preciso mais.' },
    tipo: 'cancelar',
    ok: 409,
  },
  {
    nome: 'reabrir',
    metodo: 'POST',
    caminho: '/reabrir',
    corpo: { versao: VELHA, justificativa: 'Voltou a falhar.' },
    tipo: 'reabrir',
    ok: 422,
  },
]

/** Resultado esperado da tabela: fora do escopo é sempre 404, exceto onde a permissão da rota barra antes (403). */
function esperado(r: Rota, a: Ator): number {
  if (r.tipo === 'atender' && EH_USUARIO[a]) return 403 // `chamado.atender` é checado na rota, antes do escopo
  if (!VE[a]) return 404
  switch (r.tipo) {
    case 'leitura':
    case 'atender':
      return r.ok
    case 'soSolicitante':
      return 403 // o chamado não está CONCLUIDO: ninguém aprova nem rejeita
    case 'cancelar':
      return a === 'solicitante' ? 403 : r.ok // com operador atribuído o solicitante não cancela
    case 'reabrir':
      return PODE_REABRIR[a] ? r.ok : 403 // não está ENCERRADO: 422; sem direito de reabrir: 403
  }
}

describe('matriz de autorização de chamados (S44–S47, T33)', () => {
  let app: App
  let chamadoId: number
  const headers = {} as Record<Ator, Record<string, string>>

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
    const c = await criarChamado({
      solicitanteId: solicitante.id,
      areaId: A.id,
      papel: 'EM_ATENDIMENTO',
      operadorId: responsavelOutraArea.id,
    })
    chamadoId = c.id
    const usuarios = {
      solicitante,
      outroUsuario,
      operadorDaArea,
      operadorSecundario,
      operadorOutraArea,
      responsavelOutraArea,
      admin,
    }
    for (const a of ATORES) headers[a] = await headersDe(usuarios[a].id)
  })

  const casos = ROTAS.flatMap((r) => ATORES.map((a) => [r.nome, a, r] as const))

  it.each(casos)('%s como %s', async (_nome, ator, rota) => {
    const payload =
      rota.corpo === undefined ? undefined : JSON.parse(JSON.stringify(rota.corpo).replace('AMANHA', AMANHA()))
    const res = await app.inject({
      method: rota.metodo,
      url: `/api/v1/chamados/${chamadoId}${rota.caminho}`,
      headers: headers[ator],
      ...(payload === undefined ? {} : { payload }),
    })
    expect(res.statusCode, res.body).toBe(esperado(rota, ator))
    if (res.statusCode === 404) expect(res.json().erro.codigo).toBe('NAO_ENCONTRADO')
  })

  it('chamado inexistente responde igual a fora do escopo (404, mesmo corpo de erro)', async () => {
    const fora = await app.inject({
      method: 'GET',
      url: `/api/v1/chamados/${chamadoId}`,
      headers: headers.operadorOutraArea,
    })
    const inexistente = await app.inject({
      method: 'GET',
      url: '/api/v1/chamados/999999',
      headers: headers.operadorOutraArea,
    })
    expect(fora.statusCode).toBe(404)
    expect(inexistente.statusCode).toBe(404)
    const { requestId: _a, ...erroFora } = fora.json().erro
    const { requestId: _b, ...erroInexistente } = inexistente.json().erro
    expect(erroFora).toEqual(erroInexistente)
  })

  it('sem sessão: 401 em todas as rotas', async () => {
    for (const r of ROTAS) {
      const res = await app.inject({
        method: r.metodo,
        url: `/api/v1/chamados/${chamadoId}${r.caminho}`,
        headers: { origin: headers.admin.origin ?? '' },
      })
      expect(res.statusCode, r.nome).toBe(401)
    }
  })

  it('a lista não mostra chamados de fora do escopo', async () => {
    const dele = await app.inject({
      method: 'GET',
      url: '/api/v1/chamados?visao=minha-area',
      headers: headers.operadorOutraArea,
    })
    expect(dele.statusCode).toBe(200)
    expect(dele.json().itens.map((c: { id: number }) => c.id)).not.toContain(chamadoId)
    const doOperador = await app.inject({ method: 'GET', url: '/api/v1/chamados', headers: headers.operadorDaArea })
    expect(doOperador.json().itens.map((c: { id: number }) => c.id)).toContain(chamadoId)
  })
})
