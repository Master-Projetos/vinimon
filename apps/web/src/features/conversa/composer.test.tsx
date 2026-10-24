import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { CHAVES_CONFIG_PUBLICAS, CONFIG_PADRAO, type Meta, type SessaoResposta, type UsuarioMe } from '@vinimon/shared'
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

/** XMLHttpRequest falso: `enviarArquivo` usa XHR (com progresso), não `fetch`. */
class XhrFalso {
  static enviados: { url: string; campos: Record<string, string>; arquivos: File[] }[] = []
  withCredentials = false
  status = 201
  responseText = '[]'
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = {
    onprogress: null,
  }
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
    queueMicrotask(() => {
      this.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 })
      this.onload?.()
    })
  }
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
  vi.stubGlobal('XMLHttpRequest', XhrFalso)
  XhrFalso.enviados = []
  Element.prototype.scrollIntoView = () => undefined
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

const ANA = { id: 7, nome: 'Ana Souza' }

function msg(id: number, texto: string, autor: { id: number; nome: string }, extra: Record<string, unknown> = {}) {
  return {
    id,
    chamadoId: 5,
    tipo: 'COMENTARIO',
    interno: false,
    texto,
    evento: null,
    dados: null,
    autor,
    criadoEm: '2026-10-01T13:00:00.000Z',
    clienteId: null,
    ...extra,
  }
}

const meta = (anexos = true): Meta => ({
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
  config: {
    ...(Object.fromEntries(CHAVES_CONFIG_PUBLICAS.map((c) => [c, CONFIG_PADRAO[c]])) as Meta['config']),
    'anexos.habilitados': anexos,
  },
})

type Corpo = { texto: string; interno: boolean; clienteId: string }
async function ecoComentario(req: Request, id = 40, ignoradas: { id: number; nome: string }[] = []) {
  const b = (await req.json()) as Corpo
  return json(
    {
      assentamento: msg(id, b.texto, ANA, { interno: b.interno, clienteId: b.clienteId }),
      mencoesIgnoradas: ignoradas,
    },
    201,
  )
}

function montar(
  respostas: Parameters<typeof renderRota>[1]['respostas'],
  opcoes: { acoes?: Record<string, boolean>; anexos?: boolean } = {},
) {
  const d = detalhe()
  d.acoes = { ...d.acoes, ...opcoes.acoes }
  const r = renderRota('/chamados/5', {
    sessao: sessaoDe('OPERADOR'),
    respostas: {
      'GET /chamados/5': d,
      'GET /chamados/5/assentamentos': {
        itens: [msg(10, 'Bom dia.', { id: 20, nome: 'Carla Dias' })],
        proximoCursor: null,
      },
      'GET /meta': meta(opcoes.anexos ?? true),
      ...respostas,
    },
  })
  falsaAtual = r.falsa
  return r
}

const posts = (falsa: ApiFalsa) =>
  falsa.chamadas.filter((c) => c.metodo === 'POST' && c.url === '/api/v1/chamados/5/assentamentos')

/** Corpo do n-ésimo POST de comentário. */
const corpoDoPost = (falsa: ApiFalsa, n = 0): Partial<Corpo> => (posts(falsa)[n]?.corpo ?? {}) as Partial<Corpo>

const escrever = async (texto: string) => {
  const campo = await screen.findByLabelText('Mensagem')
  fireEvent.change(campo, { target: { value: texto } })
  return campo
}

describe('compositor da conversa', () => {
  it('Enter envia: POST do comentário com clienteId, a mensagem aparece confirmada e o campo limpa', async () => {
    const { falsa } = montar({ 'POST /chamados/5/assentamentos': (req: Request) => ecoComentario(req) })
    const campo = await escrever('Olá, equipe')
    fireEvent.keyDown(campo, { key: 'Enter' })
    await waitFor(() => expect(posts(falsa)).toHaveLength(1))
    expect(posts(falsa)[0]?.corpo).toEqual({ texto: 'Olá, equipe', interno: false, clienteId: expect.any(String) })
    const log = screen.getByRole('log')
    expect(await within(log).findByText('Olá, equipe')).toBeInTheDocument()
    await waitFor(() => expect(within(log).getByLabelText('Enviada')).toBeInTheDocument())
    expect(campo).toHaveValue('')
  })

  it('Shift+Enter quebra linha e não envia', async () => {
    const { falsa } = montar({})
    const campo = await escrever('linha 1')
    fireEvent.keyDown(campo, { key: 'Enter', shiftKey: true })
    expect(posts(falsa)).toHaveLength(0)
  })

  it('@ abre as pessoas, Enter escolhe e o envio serializa a menção', async () => {
    const { falsa } = montar({
      'GET /chamados/5/mencionaveis': [{ id: 8, nome: 'Bruno Lima', perfil: 'OPERADOR' }],
      'POST /chamados/5/assentamentos': (req: Request) => ecoComentario(req),
    })
    const campo = await escrever('@Br')
    const lista = await screen.findByRole('list', { name: 'Pessoas para mencionar' })
    expect(await within(lista).findByRole('button', { name: 'Bruno Lima' })).toBeInTheDocument()
    fireEvent.keyDown(campo, { key: 'Enter' })
    await waitFor(() => expect(campo).toHaveValue('@Bruno Lima '))
    expect(screen.queryByRole('list', { name: 'Pessoas para mencionar' })).not.toBeInTheDocument()
    fireEvent.change(campo, { target: { value: '@Bruno Lima pode ver?' } })
    fireEvent.keyDown(campo, { key: 'Enter' })
    await waitFor(() => expect(posts(falsa)).toHaveLength(1))
    expect(corpoDoPost(falsa).texto).toBe('@[Bruno Lima](usuario:8) pode ver?')
    expect(
      falsa.chamadas.some(
        (c) => c.url.startsWith('/api/v1/chamados/5/mencionaveis') && c.url.includes('interno=false'),
      ),
    ).toBe(true)
  })

  it('Esc fecha a lista de menções sem alterar o texto', async () => {
    montar({ 'GET /chamados/5/mencionaveis': [{ id: 8, nome: 'Bruno Lima', perfil: 'OPERADOR' }] })
    const campo = await escrever('oi @Br')
    await screen.findByRole('list', { name: 'Pessoas para mencionar' })
    fireEvent.keyDown(campo, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Pessoas para mencionar' })).not.toBeInTheDocument())
    expect(campo).toHaveValue('oi @Br')
  })

  it('toggle Interno envia interno: true e a nota aparece como interna', async () => {
    const { falsa } = montar({ 'POST /chamados/5/assentamentos': (req: Request) => ecoComentario(req) })
    const campo = await escrever('Só a equipe')
    fireEvent.click(screen.getByRole('switch', { name: 'Interno' }))
    fireEvent.keyDown(campo, { key: 'Enter' })
    await waitFor(() => expect(posts(falsa)).toHaveLength(1))
    expect(corpoDoPost(falsa).interno).toBe(true)
    expect(await within(screen.getByRole('log')).findByText('Nota interna')).toBeInTheDocument()
  })

  it('sem permissão de comentário interno, o toggle não aparece', async () => {
    montar({}, { acoes: { comentarInterno: false } })
    await screen.findByLabelText('Mensagem')
    expect(screen.queryByRole('switch', { name: 'Interno' })).not.toBeInTheDocument()
  })

  it('chamado que não aceita comentário não mostra o compositor', async () => {
    montar({}, { acoes: { comentar: false } })
    await screen.findByRole('log')
    expect(screen.queryByLabelText('Mensagem')).not.toBeInTheDocument()
  })

  it('erro de rede (status 0): "Não enviada"; Tentar novamente reenvia com o mesmo clienteId', async () => {
    let chamadas = 0
    const { falsa } = montar({
      'POST /chamados/5/assentamentos': (req: Request) => {
        chamadas += 1
        if (chamadas === 1) throw new TypeError('Failed to fetch')
        return ecoComentario(req) as unknown as Response
      },
    })
    const campo = await escrever('Vai falhar')
    fireEvent.keyDown(campo, { key: 'Enter' })
    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('Não enviada.')
    fireEvent.click(within(alerta).getByRole('button', { name: 'Tentar novamente' }))
    await waitFor(() => expect(posts(falsa)).toHaveLength(2))
    const [a, b] = posts(falsa).map((p) => (p.corpo as Corpo).clienteId)
    expect(a).toBeTruthy()
    expect(a).toBe(b)
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(within(screen.getByRole('log')).getAllByText('Vai falhar')).toHaveLength(1)
  })

  it('Descartar remove a mensagem que não foi enviada', async () => {
    montar({ 'POST /chamados/5/assentamentos': () => json({ erro: { codigo: 'ERRO', mensagem: 'Falhou.' } }, 500) })
    const campo = await escrever('Será descartada')
    fireEvent.keyDown(campo, { key: 'Enter' })
    const alerta = await screen.findByRole('alert')
    fireEvent.click(within(alerta).getByRole('button', { name: 'Descartar' }))
    await waitFor(() => expect(screen.queryByText('Será descartada')).not.toBeInTheDocument())
  })

  it('mencoesIgnoradas gera o aviso "Fulano não tem acesso a este chamado"', async () => {
    montar({ 'POST /chamados/5/assentamentos': (req: Request) => ecoComentario(req, 41, [{ id: 9, nome: 'Fulano' }]) })
    const campo = await escrever('oi')
    fireEvent.keyDown(campo, { key: 'Enter' })
    expect(await screen.findByText('Fulano não tem acesso a este chamado')).toBeInTheDocument()
  })

  it('colar imagem + Enter: POST do comentário e depois o POST dos anexos com o assentamentoId devolvido', async () => {
    const { falsa } = montar({ 'POST /chamados/5/assentamentos': (req: Request) => ecoComentario(req, 55) })
    const campo = await screen.findByLabelText('Mensagem')
    await screen.findByRole('button', { name: 'Anexar arquivo' }) // o meta (anexos habilitados) já carregou
    const imagem = new File(['x'], 'print.png', { type: 'image/png' })
    fireEvent.paste(campo, { clipboardData: { items: [{ kind: 'file', type: 'image/png', getAsFile: () => imagem }] } })
    expect(await screen.findByText('print.png')).toBeInTheDocument()
    fireEvent.keyDown(campo, { key: 'Enter' })
    await waitFor(() => expect(XhrFalso.enviados).toHaveLength(1))
    expect(posts(falsa)).toHaveLength(1)
    expect(XhrFalso.enviados[0]).toMatchObject({
      url: '/api/v1/chamados/5/anexos',
      campos: { assentamentoId: '55', interno: 'false' },
    })
    expect(XhrFalso.enviados[0]?.arquivos[0]?.name).toBe('print.png')
    // o chip some depois do envio
    await waitFor(() => expect(screen.queryByText('print.png')).not.toBeInTheDocument())
  })

  it('o botão Anexar existe com anexos habilitados e some quando estão desligados', async () => {
    montar({})
    expect(await screen.findByRole('button', { name: 'Anexar arquivo' })).toBeInTheDocument()
    cleanup()
    falsaAtual?.restaurar()
    montar({}, { anexos: false })
    await screen.findByLabelText('Mensagem')
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Anexar arquivo' })).not.toBeInTheDocument())
  })
})
