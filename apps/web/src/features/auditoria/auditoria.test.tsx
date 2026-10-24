import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { CONFIG_PADRAO, type Meta, type SessaoResposta, type UsuarioMe } from '@vinimon/shared'
import { afterEach, describe, expect, it } from 'vitest'
import type { ApiFalsa } from '@/test/api-falsa'
import { renderRota } from '@/test/render-rota'

// Radix (Popper) usa ResizeObserver, que o jsdom não tem.
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
// O Select do Radix também usa estas APIs de ponteiro e rolagem.
Element.prototype.scrollIntoView = () => {}
Element.prototype.hasPointerCapture = () => false
Element.prototype.releasePointerCapture = () => {}

function sessaoDe(perfil: UsuarioMe['perfil']): SessaoResposta {
  const usuario: UsuarioMe = {
    id: 7,
    nome: 'Ana Souza',
    login: 'ana',
    email: null,
    telefone: null,
    perfil,
    areaId: null,
    areaIds: [],
    permissoes: [],
    mfaAtivo: true,
    deveTrocarSenha: false,
    tema: 'SISTEMA',
    densidade: null,
    enviarComEnter: true,
  }
  return { estado: 'ATIVA', csrf: 'csrf-teste', usuario }
}

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } })

const pagina = (itens: unknown[]) => ({ itens, total: itens.length, pagina: 1, porPagina: 25 })

const meta: Meta = {
  areas: [],
  prioridades: [],
  status: [],
  problemas: [],
  canais: [],
  departamentos: [],
  unidades: [],
  tiposAtivo: [],
  jornadas: [],
  categorias: [],
  config: Object.fromEntries(Object.entries(CONFIG_PADRAO)) as Meta['config'],
}

let falsaAtual: ApiFalsa | undefined
afterEach(() => {
  cleanup()
  falsaAtual?.restaurar()
  falsaAtual = undefined
})

function montar(caminho: string, respostas: Parameters<typeof renderRota>[1]['respostas']) {
  const r = renderRota(caminho, { sessao: sessaoDe('ADMIN'), respostas })
  falsaAtual = r.falsa
  return r
}

const registro = {
  id: 9,
  criadoEm: '2026-05-10T12:00:00.000Z',
  atorTipo: 'USUARIO',
  ator: { id: 7, nome: 'Ana Souza' },
  acao: 'config.alterada',
  entidade: 'Config',
  entidadeId: null,
  ip: '10.0.0.1',
  userAgent: null,
  requestId: null,
  dados: { 'anexos.habilitados': { de: true, para: false } },
}

const lista = { 'GET /auditoria': pagina([registro]), 'GET /meta': meta }

describe('/admin/auditoria', () => {
  it('lista o config.alterada e expande os dados', async () => {
    montar('/admin/auditoria', lista)
    expect(await screen.findByText('config.alterada')).toBeInTheDocument()
    expect(screen.getByText('Ana Souza')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Ver detalhes de config\.alterada/ }))
    expect(await screen.findByText(/"anexos\.habilitados"/)).toBeInTheDocument()
  })

  it('os filtros entram na query', async () => {
    const { falsa } = montar('/admin/auditoria', lista)
    await screen.findByText('config.alterada')
    fireEvent.change(screen.getByLabelText('Ação'), { target: { value: 'config.alterada' } })
    fireEvent.change(screen.getByLabelText('Entidade'), { target: { value: 'Config' } })
    fireEvent.change(screen.getByLabelText('Ator (ID)'), { target: { value: '7' } })
    fireEvent.click(screen.getByRole('button', { name: 'Filtrar' }))
    await waitFor(() => {
      const urls = falsa.chamadas.map((c) => c.url)
      expect(
        urls.some((u) => u.includes('acao=config.alterada') && u.includes('entidade=Config') && u.includes('atorId=7')),
      ).toBe(true)
    })
  })

  it.each([
    [403, 'Você não tem acesso a este conteúdo'],
    [404, 'Não encontrado'],
  ] as const)('%i ao listar mostra o ErrorState', async (status, titulo) => {
    montar('/admin/auditoria', {
      'GET /auditoria': () => json({ erro: { codigo: 'ERRO', mensagem: 'Negado.' } }, status),
    })
    expect(await screen.findByText(titulo)).toBeInTheDocument()
  })
})
