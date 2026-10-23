import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import {
  CHAVES_CONFIG_PUBLICAS,
  type ChamadoEvento,
  CONFIG_PADRAO,
  type SessaoResposta,
  type UsuarioMe,
} from '@vinimon/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderRota } from '@/test/render-rota'
import { eventosDoFiltro } from './components/historico-timeline'
import { textoEvento } from './textos'

let restaurar: (() => void) | null = null

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
})

afterEach(() => {
  cleanup()
  restaurar?.()
  restaurar = null
  vi.unstubAllGlobals()
})

const sessao: SessaoResposta = {
  estado: 'ATIVA',
  csrf: 'csrf-teste',
  usuario: {
    id: 7,
    nome: 'Ana Souza',
    login: 'ana',
    email: null,
    telefone: null,
    perfil: 'OPERADOR',
    areaId: null,
    areaIds: [],
    permissoes: [],
    mfaAtivo: true,
    deveTrocarSenha: false,
    tema: 'SISTEMA',
    densidade: null,
    enviarComEnter: true,
  } satisfies UsuarioMe,
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
    status: { id: 2, nome: 'Em atendimento', tipo: 'EM_ATENDIMENTO', papel: 'EM_ATENDIMENTO', cor: '#16a34a' },
    prioridade: { id: 2, nome: 'Média', cor: '#2563eb', ordem: 2 },
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
    solucao: 'Trocado o cabo de rede.',
    contato: null,
    contatoEmail: null,
    telefone: null,
    abertoPor: { id: 9, nome: 'Diego Reis' },
    canal: { id: 1, nome: 'Telefone' },
    departamento: null,
    ativo: null,
    primeiraRespostaEm: '2026-10-01T10:30:00.000Z',
    concluidoEm: null,
    encerradoEm: null,
    validacaoLimiteEm: null,
    statusDesde: '2026-10-01T10:30:00.000Z',
    rejeicoes: 0,
    versao: 3,
    participantes: [{ id: 8, nome: 'Bruno Lima', papel: 'OPERADOR' }],
    tags: [],
    avaliacao: null,
    seguindo: false,
    acoes: {
      assumir: false,
      encaminhar: false,
      status: false,
      prioridade: false,
      classificar: false,
      tags: false,
      agendar: false,
      concluir: false,
      aprovar: false,
      rejeitar: false,
      reabrir: false,
      cancelar: false,
      comentar: false,
      comentarInterno: false,
      anexar: false,
    },
    ...sobrescrever,
  }
}

const META = {
  areas: [{ id: 1, nome: 'Suporte', atende: true }],
  prioridades: [{ id: 2, nome: 'Média', cor: '#2563eb', ordem: 2, padrao: true }],
  status: [
    { id: 2, nome: 'Em atendimento', tipo: 'EM_ATENDIMENTO', papel: 'EM_ATENDIMENTO', cor: '#16a34a', ignorado: false },
  ],
  problemas: [],
  canais: [],
  departamentos: [],
  unidades: [],
  tiposAtivo: [],
  jornadas: [],
  categorias: [],
  config: Object.fromEntries(CHAVES_CONFIG_PUBLICAS.map((chave) => [chave, CONFIG_PADRAO[chave]])),
}

const EVENTOS: ChamadoEvento[] = [
  {
    id: 1,
    tipo: 'STATUS_ALTERADO',
    ator: { id: 8, nome: 'Bruno Lima' },
    dados: { de: { id: 1, nome: 'Aberto' }, para: { id: 2, nome: 'Em atendimento' } },
    criadoEm: new Date('2026-10-01T10:30:00.000Z'),
  },
  {
    id: 2,
    tipo: 'SLA_RISCO',
    ator: null,
    dados: {},
    criadoEm: new Date('2026-10-01T11:00:00.000Z'),
  },
  {
    id: 3,
    tipo: 'ANEXO_ADICIONADO',
    ator: { id: 9, nome: 'Diego Reis' },
    dados: {},
    criadoEm: new Date('2026-10-01T11:30:00.000Z'),
  },
]

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } })
}

function montar(respostas: Record<string, unknown>, caminho: string) {
  const r = renderRota(caminho, {
    sessao,
    respostas: { 'GET /meta': META, 'GET /chamados/5': detalhe(), ...respostas },
  })
  restaurar = r.falsa.restaurar
  return r
}

const assentamento = (sobrescrever: Record<string, unknown>) => ({
  id: 1,
  chamadoId: 5,
  tipo: 'COMENTARIO',
  interno: false,
  texto: 'Comentário padrão',
  evento: null,
  dados: null,
  autor: { id: 8, nome: 'Bruno Lima' },
  criadoEm: '2026-10-01T10:45:00.000Z',
  clienteId: null,
  ...sobrescrever,
})

describe('textoEvento e filtros do histórico', () => {
  it('monta o texto a partir de dados', () => {
    expect(
      textoEvento({
        tipo: 'STATUS_ALTERADO',
        dados: { de: { id: 1, nome: 'Aberto' }, para: { id: 2, nome: 'Em atendimento' } },
      }),
    ).toBe('Status alterado de Aberto para Em atendimento')
    expect(textoEvento({ tipo: 'TAGS_ALTERADAS', dados: { de: [], para: ['rede', 'wifi'] } })).toBe(
      'Tags alteradas: nenhuma → rede, wifi',
    )
  })

  it('filtra por grupo e mantém tudo em Tudo', () => {
    expect(eventosDoFiltro(EVENTOS, 'TUDO')).toHaveLength(3)
    expect(eventosDoFiltro(EVENTOS, 'SLA').map((e) => e.tipo)).toEqual(['SLA_RISCO'])
    expect(eventosDoFiltro(EVENTOS, 'ANEXOS').map((e) => e.tipo)).toEqual(['ANEXO_ADICIONADO'])
    expect(eventosDoFiltro(EVENTOS, 'ATRIBUICAO')).toHaveLength(0)
  })
})

describe('/chamados/$chamadoId/historico', () => {
  it('renderiza a linha do tempo e filtra por SLA', async () => {
    montar({ 'GET /chamados/5/historico': EVENTOS }, '/chamados/5/historico')

    const linha = await screen.findByRole('list', { name: 'Linha do tempo do chamado' })
    expect(within(linha).getByText('Status alterado de Aberto para Em atendimento')).toBeInTheDocument()
    expect(within(linha).getByText('SLA de solução em risco')).toBeInTheDocument()
    expect(within(linha).getByText(/Sistema/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: 'SLA' }))
    await waitFor(() => expect(screen.queryByText('Status alterado de Aberto para Em atendimento')).toBeNull())
    expect(screen.getByText('SLA de solução em risco')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: 'Atribuição' }))
    expect(await screen.findByText('Nenhum evento neste filtro.')).toBeInTheDocument()
  })

  it('mostra ErrorState quando a API recusa o histórico', async () => {
    montar(
      { 'GET /chamados/5/historico': () => json({ erro: { codigo: 'SEM_ACESSO', mensagem: 'Sem acesso' } }, 403) },
      '/chamados/5/historico',
    )
    expect(await screen.findByText('Você não tem acesso a este conteúdo')).toBeInTheDocument()
  })
})

describe('/chamados/$chamadoId/imprimir', () => {
  it('mostra só comentários públicos e aciona window.print no botão', async () => {
    const imprimir = vi.fn()
    vi.stubGlobal('print', imprimir)
    montar(
      {
        'GET /chamados/5/assentamentos': {
          itens: [
            assentamento({ id: 3, texto: 'Comentário público' }),
            assentamento({ id: 2, texto: 'Segredo interno', interno: true }),
            assentamento({ id: 1, tipo: 'SISTEMA', texto: 'Mensagem de sistema' }),
          ],
          proximoCursor: null,
        },
      },
      '/chamados/5/imprimir',
    )

    expect(await screen.findByText('Comentário público')).toBeInTheDocument()
    expect(screen.queryByText('Segredo interno')).not.toBeInTheDocument()
    expect(screen.queryByText('Mensagem de sistema')).not.toBeInTheDocument()
    expect(screen.getByText('Trocado o cabo de rede.')).toBeInTheDocument()
    expect(screen.getByText('Sem avaliação.')).toBeInTheDocument()

    const area = document.querySelector('[data-print-area]')
    expect(area).not.toBeNull()
    expect(area?.parentElement).toBe(document.body)

    fireEvent.click(screen.getByRole('button', { name: 'Imprimir' }))
    expect(imprimir).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })
})
