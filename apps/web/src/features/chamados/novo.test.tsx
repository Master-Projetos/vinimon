import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { CHAVES_CONFIG_PUBLICAS, CONFIG_PADRAO, type Meta, type SessaoResposta, type UsuarioMe } from '@vinimon/shared'
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

let restaurar: (() => void) | null = null

afterEach(() => {
  cleanup()
  restaurar?.()
  restaurar = null
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
    mfaAtivo: perfil !== 'USUARIO',
    deveTrocarSenha: false,
    tema: 'SISTEMA',
    densidade: null,
    enviarComEnter: true,
  }
  return { estado: 'ATIVA', csrf: 'csrf-teste', usuario }
}

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

/** Detalhe completo: a resposta do POST passa pelo contrato (`parse`), então precisa ser válida. */
function detalhe(sobrescrever: Record<string, unknown> = {}) {
  return {
    id: 42,
    assunto: 'Impressora parada',
    novo: true,
    cancelado: false,
    status: EM_ATENDIMENTO,
    prioridade: { id: 2, nome: 'Média', cor: '#2563eb', ordem: 2 },
    area: { id: 1, nome: 'Suporte' },
    problema: { id: 4, nome: 'Impressão' },
    solicitante: { id: 7, nome: 'Ana Souza' },
    operador: null,
    abertoEm: '2026-10-01T10:00:00.000Z',
    agendadoPara: null,
    ultimaAtividadeEm: '2026-10-01T10:00:00.000Z',
    ultimaInteracao: null,
    naoLido: false,
    qtdAnexos: 0,
    sla: { resposta: SLA_PRAZO, solucao: SLA_PRAZO },
    descricao: 'A impressora do setor não imprime.',
    solucao: null,
    contato: 'Ana Souza',
    contatoEmail: null,
    telefone: null,
    abertoPor: { id: 7, nome: 'Ana Souza' },
    canal: { id: 1, nome: 'Telefone' },
    departamento: null,
    ativo: null,
    primeiraRespostaEm: null,
    concluidoEm: null,
    encerradoEm: null,
    validacaoLimiteEm: null,
    statusDesde: '2026-10-01T10:00:00.000Z',
    rejeicoes: 0,
    versao: 1,
    participantes: [{ id: 7, nome: 'Ana Souza', papel: 'SOLICITANTE' }],
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

const META: Meta = {
  areas: [
    { id: 1, nome: 'Suporte', atende: true },
    { id: 2, nome: 'Redes', atende: true },
  ],
  prioridades: [
    { id: 1, nome: 'Baixa', cor: '#64748b', ordem: 1, padrao: false },
    { id: 2, nome: 'Média', cor: '#2563eb', ordem: 2, padrao: true },
    { id: 3, nome: 'Alta', cor: '#dc2626', ordem: 3, padrao: false },
  ],
  status: [],
  problemas: [
    { id: 4, nome: 'Impressão', descricao: 'Impressoras e scanners.', areaPadraoId: 1, areaIds: [1] },
    { id: 5, nome: 'Rede', descricao: null, areaPadraoId: null, areaIds: [1, 2] },
  ],
  canais: [{ id: 1, nome: 'Telefone' }],
  departamentos: [{ id: 3, nome: 'Financeiro', unidadeId: 1 }],
  unidades: [{ id: 1, nome: 'Matriz' }],
  tiposAtivo: [],
  jornadas: [],
  categorias: [],
  config: Object.fromEntries(CHAVES_CONFIG_PUBLICAS.map((chave) => [chave, CONFIG_PADRAO[chave]])),
  tags: [{ id: 1, nome: 'urgente' }],
}

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } })
}

function montar(perfil: UsuarioMe['perfil'], caminho: string, respostas: Record<string, unknown> = {}) {
  const r = renderRota(caminho, {
    sessao: sessaoDe(perfil),
    respostas: { 'GET /meta': META, ...respostas },
  })
  restaurar = r.falsa.restaurar
  return r
}

function preencherAssuntoEDescricao() {
  fireEvent.change(screen.getByLabelText(/Assunto/), { target: { value: 'Impressora parada' } })
  fireEvent.change(screen.getByLabelText(/Descrição/), { target: { value: 'A impressora do setor não imprime.' } })
}

function chamadaPost(falsa: ApiFalsa) {
  return falsa.chamadas.find((c) => c.metodo === 'POST' && c.url === '/api/v1/chamados')
}

describe('/chamados/novo (formulário)', () => {
  it('renderiza o formulário com o meta: tipo, assunto, descrição e prioridade padrão marcada', async () => {
    montar('OPERADOR', '/chamados/novo')
    expect(await screen.findByRole('heading', { name: 'Novo chamado' })).toBeInTheDocument()
    expect(screen.getByLabelText(/Tipo de problema/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Assunto/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Descrição/)).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Média' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Alta' })).not.toBeChecked()
  })

  it('submit faz POST /chamados com o body esperado e leva ao detalhe com o toast', async () => {
    const { falsa, router } = montar('USUARIO', '/chamados/novo?problema=4', {
      'POST /chamados': detalhe(),
      'GET /chamados/42': detalhe(),
    })
    await screen.findByLabelText(/Assunto/)
    preencherAssuntoEDescricao()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir chamado' }))

    await waitFor(() => expect(chamadaPost(falsa)).toBeDefined())
    expect(chamadaPost(falsa)?.corpo).toEqual({
      assunto: 'Impressora parada',
      descricao: 'A impressora do setor não imprime.',
      problemaId: 4,
      prioridadeId: 2,
      contato: 'Ana Souza',
    })
    expect(await screen.findByText('Chamado #42 aberto')).toBeInTheDocument()
    await waitFor(() => expect(router.state.location.pathname).toBe('/chamados/42'))
  })

  it('400 com detalhes mostra a mensagem no campo', async () => {
    const { falsa } = montar('USUARIO', '/chamados/novo?problema=4', {
      'POST /chamados': () =>
        json(
          {
            erro: {
              codigo: 'VALIDACAO',
              mensagem: 'Dados inválidos.',
              detalhes: [{ campo: 'assunto', mensagem: 'Já existe um chamado com este assunto hoje.' }],
            },
          },
          400,
        ),
    })
    await screen.findByLabelText(/Assunto/)
    preencherAssuntoEDescricao()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir chamado' }))

    expect(await screen.findByText('Já existe um chamado com este assunto hoje.')).toBeInTheDocument()
    expect(chamadaPost(falsa)).toBeDefined()
  })

  it('403 ao carregar o formulário mostra ErrorState', async () => {
    montar('USUARIO', '/chamados/novo', {
      'GET /meta': () => json({ erro: { codigo: 'SEM_PERMISSAO', mensagem: 'Negado.' } }, 403),
    })
    expect(await screen.findByText('Você não tem acesso a este conteúdo')).toBeInTheDocument()
  })

  it('USUARIO não vê área, canal, em nome de nem tags', async () => {
    montar('USUARIO', '/chamados/novo?problema=4')
    await screen.findByLabelText(/Tipo de problema/)
    expect(screen.queryByLabelText(/^Área/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Canal/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Abrir em nome de/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Tags/)).not.toBeInTheDocument()
  })
})
