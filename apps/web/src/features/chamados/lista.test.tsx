import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { CHAVES_CONFIG_PUBLICAS, CONFIG_PADRAO, type Meta, type SessaoResposta, type UsuarioMe } from '@vinimon/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiFalsa } from '@/test/api-falsa'
import { renderRota } from '@/test/render-rota'

// Radix (Popover, Select) usa ResizeObserver e APIs de rolagem/ponteiro que o jsdom não tem.
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

let falsaAtual: ApiFalsa | undefined

function telaLarga(larga: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: larga,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
}

beforeEach(() => {
  telaLarga(true)
  Element.prototype.scrollIntoView = () => undefined
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.releasePointerCapture = () => undefined
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

const SLA = {
  meta: 480,
  prazo: '2099-01-01T12:00:00.000Z',
  alerta: '2098-12-31T12:00:00.000Z',
  cumprido: null,
  finalizado: false,
}

function resumo(id: number, assunto: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    assunto,
    novo: false,
    cancelado: false,
    status: { id: 2, nome: 'Em atendimento', tipo: 'EM_ATENDIMENTO', papel: 'EM_ATENDIMENTO', cor: '#16a34a' },
    prioridade: { id: 3, nome: 'Alta', cor: '#dc2626', ordem: 3 },
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
    sla: { resposta: { ...SLA, finalizado: true, cumprido: true }, solucao: SLA },
    ...extra,
  }
}

const pagina = (itens: unknown[], total = itens.length) => ({ itens, total, pagina: 1, porPagina: 25 })

const meta: Meta = {
  areas: [{ id: 1, nome: 'Suporte', atende: true }],
  prioridades: [{ id: 3, nome: 'Alta', cor: '#dc2626', ordem: 3, padrao: false }],
  status: [
    { id: 1, nome: 'Aberto', tipo: 'ABERTO', papel: 'INICIAL', cor: '#2563eb', ignorado: false },
    { id: 2, nome: 'Em atendimento', tipo: 'EM_ATENDIMENTO', papel: 'EM_ATENDIMENTO', cor: '#16a34a', ignorado: false },
  ],
  problemas: [],
  canais: [],
  departamentos: [],
  unidades: [],
  tiposAtivo: [],
  jornadas: [],
  categorias: [],
  config: Object.fromEntries(CHAVES_CONFIG_PUBLICAS.map((c) => [c, CONFIG_PADRAO[c]])) as Meta['config'],
}

const LISTA = pagina([
  resumo(5, 'Impressora parada', { naoLido: true, novo: true, qtdAnexos: 2 }),
  resumo(6, 'Sem acesso à rede', { operador: null }),
])

function montar(
  caminho: string,
  respostas: Parameters<typeof renderRota>[1]['respostas'] = {},
  perfil: UsuarioMe['perfil'] = 'OPERADOR',
) {
  const r = renderRota(caminho, {
    sessao: sessaoDe(perfil),
    respostas: { 'GET /chamados': LISTA, 'GET /chamados/contagens': {}, 'GET /meta': meta, ...respostas },
  })
  falsaAtual = r.falsa
  return r
}

const getsDaLista = (falsa: ApiFalsa) =>
  falsa.chamadas.filter((c) => c.metodo === 'GET' && c.url.startsWith('/api/v1/chamados?'))
const ultimaConsulta = (falsa: ApiFalsa) => new URL(getsDaLista(falsa).at(-1)?.url ?? '', 'http://x').searchParams

describe('/chamados (tabela)', () => {
  it('(a) renderiza as linhas com assunto, selos, prioridade, status, operador e SLA', async () => {
    montar('/chamados')
    const tabela = await screen.findByRole('table', { name: 'Chamados' })
    expect(await within(tabela).findByRole('link', { name: 'Impressora parada' })).toHaveAttribute(
      'href',
      '/chamados/5',
    )
    expect(within(tabela).getByRole('link', { name: 'Sem acesso à rede' })).toBeInTheDocument()
    expect(within(tabela).getByLabelText('Não lido')).toBeInTheDocument()
    expect(within(tabela).getByText('Novo')).toBeInTheDocument()
    expect(within(tabela).getByText('Com anexos')).toBeInTheDocument()
    expect(within(tabela).getAllByText('Em atendimento').length).toBeGreaterThan(0)
    expect(within(tabela).getByText('Sem responsável')).toBeInTheDocument()
    expect(within(tabela).getByText('#5')).toBeInTheDocument()
  })

  it('a visão padrão vai na consulta: equipe em "minha-fila" e solicitante em "abertos-por-mim"', async () => {
    const equipe = montar('/chamados')
    await screen.findByRole('link', { name: 'Impressora parada' })
    expect(ultimaConsulta(equipe.falsa).get('visao')).toBe('minha-fila')
    cleanup()
    falsaAtual?.restaurar()
    const usuario = montar('/chamados', {}, 'USUARIO')
    await screen.findByRole('link', { name: 'Impressora parada' })
    expect(ultimaConsulta(usuario.falsa).get('visao')).toBe('abertos-por-mim')
  })

  it('filtrar por status entra na URL e na consulta, e volta para a página 1', async () => {
    const { falsa, router } = montar('/chamados?pagina=3')
    await screen.findByRole('link', { name: 'Impressora parada' })
    await waitFor(() => expect(screen.getByRole('button', { name: /Status/ })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Status/ }))
    fireEvent.click(await screen.findByRole('option', { name: /Em atendimento/ }))
    await waitFor(() => expect(router.state.location.search).toMatchObject({ statusIds: [2] }))
    expect(router.state.location.search).not.toHaveProperty('pagina')
    await waitFor(() => expect(ultimaConsulta(falsa).getAll('statusIds')).toEqual(['2']))
  })

  it('SLA é escolha única e "Mais filtros" mostra Problema, Canal e Departamento', async () => {
    const { falsa, router } = montar('/chamados')
    await screen.findByRole('link', { name: 'Impressora parada' })
    expect(screen.queryByRole('button', { name: /^Canal/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Mais filtros/ }))
    expect(await screen.findByRole('button', { name: /^Canal/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Problema/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Departamento/ })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^SLA/ }))
    const opcoes = await screen.findAllByRole('option')
    const primeira = opcoes[0]
    if (!primeira) throw new Error('sem opções de SLA')
    fireEvent.click(primeira)
    await waitFor(() => expect(router.state.location.search).toHaveProperty('sla'))
    await waitFor(() => expect(ultimaConsulta(falsa).get('sla')).not.toBeNull())
  })

  it('ordenar por # entra na URL e na consulta', async () => {
    const { falsa, router } = montar('/chamados')
    await screen.findByRole('link', { name: 'Impressora parada' })
    fireEvent.click(screen.getByRole('button', { name: 'Ordenar por #' }))
    await waitFor(() => expect(router.state.location.search).toMatchObject({ ordem: 'id', direcao: 'asc' }))
    await waitFor(() => expect(ultimaConsulta(falsa).get('direcao')).toBe('asc'))
    expect(ultimaConsulta(falsa).get('ordem')).toBe('id')
  })

  it('mudar de página entra na URL e na consulta', async () => {
    const { falsa, router } = montar('/chamados', { 'GET /chamados': pagina([resumo(5, 'Impressora parada')], 60) })
    await screen.findByRole('link', { name: 'Impressora parada' })
    fireEvent.click(screen.getByRole('button', { name: 'Próxima página' }))
    await waitFor(() => expect(router.state.location.search).toMatchObject({ pagina: 2 }))
    await waitFor(() => expect(ultimaConsulta(falsa).get('pagina')).toBe('2'))
  })

  it('renderizar de novo com a mesma URL mantém filtros, ordem e página', async () => {
    const { falsa } = montar(
      '/chamados?visao=todos&statusIds=%5B2%5D&ordem=prioridade&direcao=asc&pagina=2&de=2026-10-01',
      {
        'GET /chamados': pagina([resumo(5, 'Impressora parada')], 60),
      },
    )
    await screen.findByRole('link', { name: 'Impressora parada' })
    const q = ultimaConsulta(falsa)
    expect(q.get('visao')).toBe('todos')
    expect(q.getAll('statusIds')).toEqual(['2'])
    expect(q.get('ordem')).toBe('prioridade')
    expect(q.get('direcao')).toBe('asc')
    expect(q.get('pagina')).toBe('2')
    expect(q.get('de')).toBe('2026-10-01')
    expect(screen.getByRole('button', { name: /A partir de 01\/10\/2026/ })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Prioridade/ })).toHaveAttribute('aria-sort', 'ascending')
    expect(screen.getByText('Página 2 de 3')).toBeInTheDocument()
  })

  it('a busca espera 300 ms e vai para a URL e para a consulta', async () => {
    const { falsa, router } = montar('/chamados')
    await screen.findByRole('link', { name: 'Impressora parada' })
    fireEvent.change(screen.getByLabelText('Buscar chamados'), { target: { value: 'impressora' } })
    expect(router.state.location.search).not.toHaveProperty('busca')
    await waitFor(() => expect(router.state.location.search).toMatchObject({ busca: 'impressora' }))
    await waitFor(() => expect(ultimaConsulta(falsa).get('busca')).toBe('impressora'))
  })

  it('(d) 403 mostra o ErrorState', async () => {
    montar('/chamados', {
      'GET /chamados': () => json({ erro: { codigo: 'SEM_PERMISSAO', mensagem: 'Negado.' } }, 403),
    })
    expect(await screen.findByText('Você não tem acesso a este conteúdo')).toBeInTheDocument()
  })

  it('sem filtros e sem chamados: "Tudo em dia" com atalho para abrir chamado', async () => {
    montar('/chamados', { 'GET /chamados': pagina([]) })
    expect(await screen.findByText('Tudo em dia')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Abrir chamado/ })).toHaveAttribute('href', '/chamados/novo')
  })

  it('com filtros e sem resultado: mensagem própria e "Limpar filtros" limpa a URL', async () => {
    const { router } = montar('/chamados?statusIds=%5B2%5D&visao=todos', { 'GET /chamados': pagina([]) })
    expect(await screen.findByText('Nenhum chamado encontrado')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Limpar filtros' })[0] as HTMLElement)
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty('statusIds'))
    expect(router.state.location.search).toMatchObject({ visao: 'todos' })
  })

  it('o CSV só aparece para quem tem relatorio.ver e leva os filtros sem a paginação', async () => {
    montar('/chamados?statusIds=%5B2%5D&pagina=2&visao=todos')
    const link = await screen.findByRole('link', { name: /Exportar CSV/ })
    const href = link.getAttribute('href') ?? ''
    expect(href.startsWith('/api/v1/chamados/exportar?')).toBe(true)
    expect(href).toContain('statusIds=2')
    expect(href).toContain('visao=todos')
    expect(href).not.toContain('pagina')
    cleanup()
    falsaAtual?.restaurar()
    montar('/chamados', {}, 'USUARIO')
    await screen.findByRole('link', { name: 'Impressora parada' })
    expect(screen.queryByRole('link', { name: /Exportar CSV/ })).not.toBeInTheDocument()
  })

  it('no celular, os chamados viram cartões', async () => {
    telaLarga(false)
    montar('/chamados')
    const lista = await screen.findByRole('list', { name: 'Chamados' })
    expect(await within(lista).findAllByRole('link')).toHaveLength(2)
    expect(screen.queryByRole('table', { name: 'Chamados' })).not.toBeInTheDocument()
  })
})
