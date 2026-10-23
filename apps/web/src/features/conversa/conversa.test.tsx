import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { SessaoResposta, UsuarioMe } from '@vinimon/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiFalsa } from '@/test/api-falsa'
import { renderRota } from '@/test/render-rota'

// Radix (Switch, Popper) usa ResizeObserver, que o jsdom não tem.
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

let falsaAtual: ApiFalsa | undefined
const rolar = vi.fn()

beforeEach(() => {
  // Tela larga: o trilho fica fixo, sem Sheet. O jsdom não implementa scrollIntoView.
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
  rolar.mockClear()
  Element.prototype.scrollIntoView = rolar
})

afterEach(() => {
  cleanup()
  falsaAtual?.restaurar()
  falsaAtual = undefined
  vi.unstubAllGlobals()
})

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

const MEDIA = { id: 2, nome: 'Média', cor: '#2563eb', ordem: 2 }
const _ALTA = { id: 3, nome: 'Alta', cor: '#dc2626', ordem: 3 }
const EM_ATENDIMENTO = {
  id: 2,
  nome: 'Em atendimento',
  tipo: 'EM_ATENDIMENTO',
  papel: 'EM_ATENDIMENTO',
  cor: '#16a34a',
}
const SLA_PRAZO = {
  meta: 480,
  prazo: '2099-01-01T12:00:00.000Z',
  alerta: '2098-12-31T12:00:00.000Z',
  cumprido: null,
  finalizado: false,
}

function detalhe(sobrescrever: Record<string, unknown> = {}) {
  return {
    id: 5,
    assunto: 'Impressora parada',
    novo: false,
    cancelado: false,
    status: EM_ATENDIMENTO,
    prioridade: MEDIA,
    area: { id: 1, nome: 'Suporte' },
    problema: { id: 4, nome: 'Impressão' },
    solicitante: { id: 20, nome: 'Carla Dias' },
    operador: { id: 8, nome: 'Bruno Lima' },
    abertoEm: '2026-10-01T10:00:00.000Z',
    agendadoPara: null,
    ultimaAtividadeEm: '2026-10-01T11:00:00.000Z',
    ultimaInteracao: null,
    naoLido: false,
    qtdAnexos: 0,
    sla: { resposta: { ...SLA_PRAZO, finalizado: true, cumprido: true }, solucao: SLA_PRAZO },
    descricao: 'A impressora do setor não imprime.',
    solucao: null,
    contato: null,
    contatoEmail: null,
    telefone: null,
    abertoPor: { id: 9, nome: 'Diego Reis' },
    canal: { id: 1, nome: 'Telefone' },
    departamento: { id: 3, nome: 'Financeiro' },
    ativo: null,
    primeiraRespostaEm: '2026-10-01T10:30:00.000Z',
    concluidoEm: null,
    encerradoEm: null,
    validacaoLimiteEm: null,
    statusDesde: '2026-10-01T10:30:00.000Z',
    rejeicoes: 1,
    versao: 3,
    participantes: [
      { id: 20, nome: 'Carla Dias', papel: 'SOLICITANTE' },
      { id: 8, nome: 'Bruno Lima', papel: 'OPERADOR' },
    ],
    tags: [],
    avaliacao: null,
    seguindo: false,
    acoes: {
      assumir: true,
      encaminhar: true,
      status: true,
      prioridade: true,
      classificar: true,
      tags: true,
      agendar: true,
      concluir: true,
      aprovar: false,
      rejeitar: false,
      reabrir: false,
      cancelar: true,
      comentar: true,
      comentarInterno: true,
      anexar: true,
    },
    ...sobrescrever,
  }
}

const CARLA = { id: 20, nome: 'Carla Dias' }
const BRUNO = { id: 8, nome: 'Bruno Lima' }

function msg(
  id: number,
  texto: string,
  autor: { id: number; nome: string } | null,
  quando: string,
  extra: Record<string, unknown> = {},
) {
  return {
    id,
    chamadoId: 5,
    tipo: autor ? 'COMENTARIO' : 'SISTEMA',
    interno: false,
    texto,
    evento: null,
    dados: null,
    autor,
    criadoEm: quando,
    clienteId: null,
    ...extra,
  }
}

const pagina = (itens: unknown[], proximoCursor: number | null = null) => ({ itens, proximoCursor })

const MENSAGENS = [
  msg(10, 'Bom dia, a impressora parou.', CARLA, '2026-10-01T13:00:00.000Z'),
  msg(11, 'Já tentei reiniciar.', CARLA, '2026-10-01T13:02:00.000Z'),
  msg(12, 'Chamado assumido por Bruno Lima.', null, '2026-10-01T13:05:00.000Z'),
  msg(13, 'Vou verificar agora.', BRUNO, '2026-10-02T13:00:00.000Z'),
]

function montar(caminho: string, respostas: Parameters<typeof renderRota>[1]['respostas']) {
  const r = renderRota(caminho, { sessao: sessaoDe('OPERADOR'), respostas })
  falsaAtual = r.falsa
  return r
}

const base = { 'GET /chamados/5': detalhe(), 'GET /chamados/5/assentamentos': pagina(MENSAGENS) }

describe('/chamados/$chamadoId (conversa)', () => {
  it('(a) mostra a descrição, as mensagens em um log, o evento do sistema e os separadores de data', async () => {
    montar('/chamados/5', base)
    const log = await screen.findByRole('log', { name: 'Mensagens do chamado' })
    expect(within(log).getAllByRole('article')).toHaveLength(4)
    expect(within(log).getByText('Chamado assumido por Bruno Lima.')).toBeInTheDocument()
    expect(screen.getByLabelText('Descrição inicial do chamado')).toHaveTextContent(
      'A impressora do setor não imprime.',
    )
    expect(
      within(log)
        .getAllByRole('separator')
        .map((s) => s.getAttribute('aria-label')),
    ).toEqual(['01/10/2026', '02/10/2026'])
  })

  it('agrupa mensagens seguidas do mesmo autor: o nome aparece uma vez', async () => {
    montar('/chamados/5', base)
    const log = await screen.findByRole('log')
    expect(within(log).getAllByText('Carla Dias')).toHaveLength(1)
    expect(within(log).getAllByText('Bruno Lima')).toHaveLength(1)
  })

  it('nota interna usa bg-private e menção a quem lê usa bg-mention', async () => {
    montar('/chamados/5', {
      'GET /chamados/5': detalhe(),
      'GET /chamados/5/assentamentos': pagina([
        msg(20, 'Só a equipe vê isto.', BRUNO, '2026-10-01T13:00:00.000Z', { interno: true }),
        msg(21, '@[Ana Souza](usuario:7) pode olhar?', BRUNO, '2026-10-01T13:10:00.000Z'),
      ]),
    })
    const log = await screen.findByRole('log')
    const interna = within(log).getByText('Só a equipe vê isto.').closest('div.rounded-lg')
    expect(interna?.className).toContain('bg-private')
    expect(within(log).getByText('Nota interna')).toBeInTheDocument()
    const mencao = within(log)
      .getByText(/pode olhar/)
      .closest('div.rounded-lg')
    expect(mencao?.className).toContain('bg-mention')
  })

  it('?foco= centraliza, destaca a mensagem e remove o parâmetro da URL', async () => {
    const { router } = montar('/chamados/5?foco=12', base)
    await screen.findByRole('log')
    await waitFor(() => expect(rolar).toHaveBeenCalledWith({ block: 'center' }))
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty('foco'))
  })

  it('?foco= numa mensagem de bolha adiciona animate-destaque', async () => {
    montar('/chamados/5?foco=11', base)
    const log = await screen.findByRole('log')
    await waitFor(() => {
      const alvo = log.querySelector('[data-assentamento-id="11"] div.rounded-lg')
      expect(alvo?.className).toContain('animate-destaque')
    })
  })

  it('"Carregar anteriores" busca com antesDe e mostra as mais antigas antes das atuais', async () => {
    const { falsa } = montar('/chamados/5', {
      'GET /chamados/5': detalhe(),
      'GET /chamados/5/assentamentos': (req: Request) =>
        new URL(req.url).searchParams.get('antesDe') === '30'
          ? json(pagina([msg(25, 'Mensagem antiga.', CARLA, '2026-09-30T13:00:00.000Z')]))
          : json(pagina([msg(30, 'Mensagem recente.', BRUNO, '2026-10-01T13:00:00.000Z')], 30)),
    })
    expect(screen.queryByLabelText('Descrição inicial do chamado')).not.toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'Carregar anteriores' }))
    await screen.findByText('Mensagem antiga.')
    expect(falsa.chamadas.some((c) => c.url.includes('antesDe=30'))).toBe(true)
    const textos = screen.getAllByRole('article').map((a) => a.textContent ?? '')
    const iAntiga = textos.findIndex((t) => t.includes('Mensagem antiga.'))
    const iRecente = textos.findIndex((t) => t.includes('Mensagem recente.'))
    expect(iAntiga).toBeGreaterThanOrEqual(0)
    expect(iAntiga).toBeLessThan(iRecente)
    // com tudo carregado, a descrição inicial aparece no topo
    expect(await screen.findByLabelText('Descrição inicial do chamado')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Carregar anteriores' })).not.toBeInTheDocument()
  })

  it.each([
    [403, 'Você não tem acesso a este conteúdo'],
    [404, 'Não encontrado'],
  ] as const)('(d) %i ao carregar as mensagens mostra o ErrorState', async (status, titulo) => {
    montar('/chamados/5', {
      'GET /chamados/5': detalhe(),
      'GET /chamados/5/assentamentos': () => json({ erro: { codigo: 'ERRO', mensagem: 'Negado.' } }, status),
    })
    expect(await screen.findByText(titulo)).toBeInTheDocument()
  })
})
