import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { CHAVES_CONFIG_PUBLICAS, CONFIG_PADRAO, type Meta, type SessaoResposta, type UsuarioMe } from '@vinimon/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

/** XMLHttpRequest falso: `enviarArquivo` usa XHR, não `fetch`. */
class XhrFalso {
  static enviados: { url: string; campos: Record<string, string>; arquivos: File[] }[] = []
  static corpoDaResposta = '[]'
  static status = 201
  withCredentials = false
  status = 201
  responseText = '[]'
  upload = { onprogress: null as ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  onabort: (() => void) | null = null
  private url = ''
  open(_metodo: string, url: string) {
    this.url = url
  }
  setRequestHeader() {}
  getResponseHeader() {
    return null
  }
  abort() {}
  send(formulario: FormData) {
    const campos: Record<string, string> = {}
    for (const [k, v] of formulario.entries()) if (typeof v === 'string') campos[k] = v
    XhrFalso.enviados.push({ url: this.url, campos, arquivos: formulario.getAll('arquivos') as File[] })
    this.status = XhrFalso.status
    this.responseText = XhrFalso.corpoDaResposta
    queueMicrotask(() => this.onload?.())
  }
}

const ID_IMG = '11111111-1111-4111-8111-111111111111'
const ID_PDF = '22222222-2222-4222-8222-222222222222'
const anexo = (id: string, nomeOriginal: string, mime: string, interno = false) => ({
  id,
  chamadoId: 42,
  assentamentoId: null,
  nomeOriginal,
  mime,
  tamanho: 2048,
  interno,
  enviadoPor: { id: 7, nome: 'Ana Souza' },
  criadoEm: '2026-10-01T10:00:00.000Z',
})
const LISTA = [anexo(ID_IMG, 'foto.png', 'image/png'), anexo(ID_PDF, 'laudo.pdf', 'application/pdf', true)]

function montar(perfil: UsuarioMe['perfil'], respostas: Record<string, unknown> = {}) {
  const r = renderRota('/chamados/42/anexos', {
    sessao: sessaoDe(perfil),
    respostas: { 'GET /meta': META, 'GET /chamados/42': detalhe(), 'GET /chamados/42/anexos': LISTA, ...respostas },
  })
  restaurar = r.falsa.restaurar
  return r
}

describe('/chamados/:id/anexos', () => {
  beforeEach(() => {
    vi.stubGlobal('XMLHttpRequest', XhrFalso)
    XhrFalso.enviados = []
    XhrFalso.corpoDaResposta = '[]'
    XhrFalso.status = 201
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renderiza os cards com o link de download em /api/v1/anexos/:id', async () => {
    montar('ADMIN')
    expect(await screen.findByText('foto.png')).toBeInTheDocument()
    expect(screen.getByText('laudo.pdf')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Baixar foto.png' })).toHaveAttribute('href', `/api/v1/anexos/${ID_IMG}`)
    expect(screen.getByRole('link', { name: 'Baixar laudo.pdf' })).toHaveAttribute('href', `/api/v1/anexos/${ID_PDF}`)
  })

  it('imagem abre a prévia por <img>; PDF só tem "Baixar"', async () => {
    montar('ADMIN')
    await screen.findByText('foto.png')
    expect(screen.getAllByRole('button', { name: /Pré-visualizar/ })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: /Pré-visualizar/ }))
    const img = await screen.findByRole('img', { name: 'foto.png' })
    expect(img).toHaveAttribute('src', `/api/v1/anexos/${ID_IMG}`)
    expect(document.querySelector('iframe, embed, object')).toBeNull()
  })

  it('enviar manda o arquivo com interno=false; a equipe marca Interno e manda interno=true', async () => {
    montar('OPERADOR')
    const entrada = await screen.findByLabelText('Anexar arquivos')
    fireEvent.change(entrada, { target: { files: [new File(['x'], 'a.txt', { type: 'text/plain' })] } })
    await waitFor(() => expect(XhrFalso.enviados).toHaveLength(1))
    expect(XhrFalso.enviados[0]?.url).toBe('/api/v1/chamados/42/anexos')
    expect(XhrFalso.enviados[0]?.campos).toEqual({ interno: 'false' })

    fireEvent.click(screen.getByRole('switch', { name: /Interno/ }))
    fireEvent.change(screen.getByLabelText('Anexar arquivos'), {
      target: { files: [new File(['y'], 'b.txt', { type: 'text/plain' })] },
    })
    await waitFor(() => expect(XhrFalso.enviados).toHaveLength(2))
    expect(XhrFalso.enviados[1]?.campos).toEqual({ interno: 'true' })
  })

  it('400 com detalhes aparece na tela', async () => {
    XhrFalso.status = 400
    XhrFalso.corpoDaResposta = JSON.stringify({
      erro: {
        codigo: 'VALIDACAO',
        mensagem: 'Dados inválidos.',
        detalhes: [{ campo: 'arquivos', mensagem: 'Tipo de arquivo não permitido.' }],
      },
    })
    montar('USUARIO')
    const entrada = await screen.findByLabelText('Anexar arquivos')
    fireEvent.change(entrada, { target: { files: [new File(['x'], 'a.exe')] } })
    expect(await screen.findByText('Tipo de arquivo não permitido.')).toBeInTheDocument()
  })

  it('só ADMIN vê "Excluir", com confirmação, e exclui com DELETE', async () => {
    const { falsa } = montar('ADMIN', {
      'DELETE /anexos/11111111-1111-4111-8111-111111111111': () => new Response(null, { status: 204 }),
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir foto.png' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(falsa.chamadas.some((c) => c.metodo === 'DELETE' && c.url.endsWith(ID_IMG))).toBe(true))
  })

  it('OPERADOR não vê "Excluir"', async () => {
    montar('OPERADOR')
    await screen.findByText('foto.png')
    expect(screen.queryByRole('button', { name: /^Excluir/ })).not.toBeInTheDocument()
  })

  it('403 ao listar mostra ErrorState', async () => {
    montar('USUARIO', {
      'GET /chamados/42/anexos': () => json({ erro: { codigo: 'SEM_PERMISSAO', mensagem: 'Negado.' } }, 403),
    })
    expect(await screen.findByText('Você não tem acesso a este conteúdo')).toBeInTheDocument()
  })
})
