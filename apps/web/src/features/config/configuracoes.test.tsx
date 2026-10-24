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

const erro400 = (campo: string, mensagem: string) =>
  json({ erro: { codigo: 'VALIDACAO', mensagem: 'Dados inválidos.', detalhes: [{ campo, mensagem }] } }, 400)

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

const lista = { 'GET /config': CONFIG_PADRAO, 'GET /meta': meta }

describe('/admin/configuracoes', () => {
  it('(a) renderiza as seções com os valores da configuração', async () => {
    montar('/admin/configuracoes', lista)
    expect(await screen.findByRole('heading', { level: 2, name: 'Geral' })).toBeInTheDocument()
    expect(screen.getByRole('form', { name: 'Sessão' })).toBeInTheDocument()
    expect(screen.getByRole('form', { name: 'Chamados' })).toBeInTheDocument()
    expect(screen.getByRole('form', { name: 'Anexos e SLA' })).toBeInTheDocument()
    expect(screen.getByLabelText(/^Nome do sistema/)).toHaveValue('Vinimon')
    expect(screen.getByLabelText(/^Duração máxima da sessão/)).toHaveValue(12)
    expect(screen.getByRole('switch', { name: 'Anexos habilitados' })).toBeChecked()
  })

  it('(b) salvar "Anexos habilitados = não" faz o PATCH só com as chaves da seção e invalida o meta', async () => {
    const { falsa } = montar('/admin/configuracoes', {
      ...lista,
      'PATCH /config': () => json({ ...CONFIG_PADRAO, 'anexos.habilitados': false }),
    })
    const interruptor = await screen.findByRole('switch', { name: 'Anexos habilitados' })
    const contarMeta = () => falsa.chamadas.filter((c) => c.metodo === 'GET' && c.url === '/api/v1/meta').length
    const metaAntes = contarMeta()
    fireEvent.click(interruptor)
    fireEvent.click(screen.getByRole('button', { name: 'Salvar anexos e sla' }))
    await waitFor(() =>
      expect(falsa.chamadas).toContainEqual({
        metodo: 'PATCH',
        url: '/api/v1/config',
        corpo: {
          'anexos.habilitados': false,
          'anexos.tamanhoMaxMb': 10,
          'anexos.maxPorEnvio': 5,
          'sla.jornadaPadraoId': null,
          'sla.alertaPct': 80,
        },
      }),
    )
    expect(await screen.findByText('Configurações de anexos e SLA salvas')).toBeInTheDocument()
    await waitFor(() => expect(contarMeta()).toBeGreaterThan(metaAntes))
  })

  it('(c) 400 com detalhes aparece no campo', async () => {
    montar('/admin/configuracoes', {
      ...lista,
      'PATCH /config': () => erro400('sessao.horasAbsoluta', 'Valor fora do limite.'),
    })
    await screen.findByRole('heading', { level: 2, name: 'Sessão' })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar sessão' }))
    expect(await screen.findByText('Valor fora do limite.')).toBeInTheDocument()
  })

  it.each([
    [403, 'Você não tem acesso a este conteúdo'],
    [404, 'Não encontrado'],
  ] as const)('(d) %i ao carregar mostra o ErrorState', async (status, titulo) => {
    montar('/admin/configuracoes', {
      'GET /config': () => json({ erro: { codigo: 'ERRO', mensagem: 'Negado.' } }, status),
      'GET /meta': meta,
    })
    expect(await screen.findByText(titulo)).toBeInTheDocument()
  })
})
