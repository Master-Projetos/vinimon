import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { CHAVES_CONFIG_PUBLICAS, CONFIG_PADRAO, type SessaoResposta, type UsuarioMe } from '@vinimon/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderRota } from '@/test/render-rota'

let restaurar: (() => void) | null = null

beforeEach(() => {
  // Tela larga (xl): o trilho fica fixo ao lado, sem Sheet.
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

const MEDIA = { id: 2, nome: 'Média', cor: '#2563eb', ordem: 2 }
const ALTA = { id: 3, nome: 'Alta', cor: '#dc2626', ordem: 3 }
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

const META = {
  areas: [{ id: 1, nome: 'Suporte', atende: true }],
  prioridades: [
    { id: 1, nome: 'Baixa', cor: '#64748b', ordem: 1, padrao: false },
    { ...MEDIA, padrao: true },
    { ...ALTA, padrao: false },
  ],
  status: [
    { id: 1, nome: 'Aberto', tipo: 'ABERTO', papel: 'INICIAL', cor: '#2563eb', ignorado: false },
    { ...EM_ATENDIMENTO, ignorado: false },
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

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } })
}

function montar(respostas: Record<string, unknown>, caminho = '/chamados/5/detalhes') {
  const r = renderRota(caminho, {
    sessao: sessaoDe('OPERADOR'),
    respostas: { 'GET /meta': META, ...respostas },
  })
  restaurar = r.falsa.restaurar
  return r
}

describe('/chamados/$chamadoId (cabeçalho, trilho e aba Detalhes)', () => {
  it('renderiza cabeçalho, trilho e a aba Detalhes com o detalhe', async () => {
    montar({ 'GET /chamados/5': detalhe() })

    const cabecalho = await screen.findByRole('region', { name: 'Cabeçalho do chamado' })
    expect(within(cabecalho).getByRole('heading', { level: 1 })).toHaveTextContent('#5 Impressora parada')
    expect(within(cabecalho).getByText('Em atendimento')).toBeInTheDocument()
    expect(within(cabecalho).getByText('Média')).toBeInTheDocument()
    expect(within(cabecalho).getByRole('button', { name: 'Seguir' })).toBeInTheDocument()

    const trilho = screen.getByRole('complementary', { name: 'Propriedades e ações' })
    expect(within(trilho).getByLabelText('Prioridade')).toHaveValue('2')
    expect(within(trilho).getByLabelText('Status')).toHaveValue('2')
    expect(within(trilho).getByRole('button', { name: 'Assumir' })).toBeInTheDocument()

    const abas = screen.getByRole('navigation', { name: 'Seções do chamado' })
    expect(within(abas).getByRole('link', { name: 'Detalhes' })).toHaveAttribute('aria-current', 'page')

    expect(await screen.findByText('Aberto por Diego Reis em nome de Carla Dias')).toBeInTheDocument()
    expect(screen.getByText('Prazos de SLA')).toBeInTheDocument()
    expect(screen.getAllByRole('progressbar')).toHaveLength(2)
  })

  it('não mostra controles de edição quando acoes.* não permite', async () => {
    montar({
      'GET /chamados/5': detalhe({
        acoes: { ...detalhe().acoes, status: false, prioridade: false, encaminhar: false, assumir: false },
      }),
    })
    const trilho = await screen.findByRole('complementary', { name: 'Propriedades e ações' })
    expect(within(trilho).queryByLabelText('Prioridade')).not.toBeInTheDocument()
    expect(within(trilho).queryByLabelText('Status')).not.toBeInTheDocument()
    expect(within(trilho).queryByRole('button', { name: 'Assumir' })).not.toBeInTheDocument()
    expect(within(trilho).getByText('Média')).toBeInTheDocument()
  })

  it('trocar a prioridade envia a versão e atualiza o cabeçalho', async () => {
    const r = montar({
      'GET /chamados/5': detalhe(),
      'POST /chamados/5/prioridade': () => json(detalhe({ prioridade: ALTA, versao: 4 })),
    })
    const trilho = await screen.findByRole('complementary', { name: 'Propriedades e ações' })
    const select = within(trilho).getByLabelText('Prioridade')
    await waitFor(() => expect(within(select).getByRole('option', { name: 'Alta' })).toBeInTheDocument())

    fireEvent.change(select, { target: { value: '3' } })

    const cabecalho = screen.getByRole('region', { name: 'Cabeçalho do chamado' })
    await waitFor(() => expect(within(cabecalho).getByText('Alta')).toBeInTheDocument())
    expect(within(cabecalho).queryByText('Média')).not.toBeInTheDocument()
    const chamada = r.falsa.chamadas.find((c) => c.metodo === 'POST')
    expect(chamada?.url).toBe('/api/v1/chamados/5/prioridade')
    expect(chamada?.corpo).toEqual({ versao: 3, prioridadeId: 3 })
  })

  it('Seguir chama o contrato e alterna para "Deixar de seguir"', async () => {
    const r = montar({
      'GET /chamados/5': detalhe(),
      'PUT /chamados/5/seguir': () => new Response(null, { status: 204 }),
      'DELETE /chamados/5/seguir': () => new Response(null, { status: 204 }),
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Seguir' }))
    const botao = await screen.findByRole('button', { name: 'Deixar de seguir' })
    expect(r.falsa.chamadas.some((c) => c.metodo === 'PUT' && c.url === '/api/v1/chamados/5/seguir')).toBe(true)

    fireEvent.click(botao)
    expect(await screen.findByRole('button', { name: 'Seguir' })).toBeInTheDocument()
    expect(r.falsa.chamadas.some((c) => c.metodo === 'DELETE' && c.url === '/api/v1/chamados/5/seguir')).toBe(true)
  })

  it('409 por versão mostra o aviso "Recarregue"', async () => {
    montar({
      'GET /chamados/5': detalhe(),
      'POST /chamados/5/prioridade': () =>
        json({ erro: { codigo: 'CONFLITO', mensagem: 'O chamado foi alterado por outra pessoa. Recarregue.' } }, 409),
    })
    const trilho = await screen.findByRole('complementary', { name: 'Propriedades e ações' })
    const select = within(trilho).getByLabelText('Prioridade')
    await waitFor(() => expect(within(select).getByRole('option', { name: 'Alta' })).toBeInTheDocument())
    fireEvent.change(select, { target: { value: '3' } })
    expect(await screen.findByText(/Recarregue/)).toBeInTheDocument()
  })

  it('403 e 404 do detalhe mostram ErrorState', async () => {
    montar({
      'GET /chamados/5': () => json({ erro: { codigo: 'SEM_PERMISSAO', mensagem: 'Sem permissão.' } }, 403),
    })
    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('Você não tem acesso a este conteúdo')
    cleanup()
    restaurar?.()

    montar({
      'GET /chamados/5': () => json({ erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Chamado não encontrado.' } }, 404),
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('Não encontrado')
  })

  it('/chamados/abc mostra NotFoundState', async () => {
    montar({}, '/chamados/abc')
    expect(await screen.findByText('Chamado não encontrado')).toBeInTheDocument()
  })
})
