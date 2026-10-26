import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { SessaoResposta, UsuarioMe } from '@vinimon/shared'
import { afterEach, describe, expect, it } from 'vitest'
import { ChamadoBuscaSchema, visaoEfetiva } from '@/features/chamados/filtros'
import { renderRota } from '@/test/render-rota'

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

const CONTAGENS = {
  'minha-fila': 3,
  'fila-aberta': 12,
  'minha-area': 20,
  agendados: 1,
  'abertos-por-mim': 4,
  'aguardando-validacao': 2,
  encerrados: 30,
  todos: 50,
}

function montar(perfil: UsuarioMe['perfil'], caminho = '/chamados') {
  const r = renderRota(caminho, {
    sessao: sessaoDe(perfil),
    respostas: { 'GET /chamados/contagens': CONTAGENS },
  })
  restaurar = r.falsa.restaurar
  return r
}

describe('/chamados (layout e visões)', () => {
  it('trocar a visão atualiza a URL, o item ativo e mostra a contagem', async () => {
    const { router } = montar('OPERADOR')
    const nav = await screen.findByRole('navigation', { name: 'Visões de chamados' })
    const link = await within(nav).findByRole('link', { name: /Fila aberta/ })
    expect(await within(link).findByText('12')).toBeInTheDocument()
    // Sem ?visao=, a visão padrão da equipe fica marcada.
    expect(within(nav).getByRole('link', { name: /Minha fila/ })).toHaveAttribute('aria-current', 'page')

    fireEvent.click(link)

    await waitFor(() => expect(router.state.location.search).toMatchObject({ visao: 'fila-aberta' }))
    expect(link).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: /Minha fila/ })).not.toHaveAttribute('aria-current')
    expect(within(link).getByText('12')).toBeInTheDocument()
  })

  it('lê a visão da URL e preserva outros filtros ao trocar', async () => {
    const { router } = montar('OPERADOR', '/chamados?visao=agendados&sla=ESTOURADO')
    const nav = await screen.findByRole('navigation', { name: 'Visões de chamados' })
    expect(await within(nav).findByRole('link', { name: /Agendados/ })).toHaveAttribute('aria-current', 'page')
    fireEvent.click(within(nav).getByRole('link', { name: /Encerrados/ }))
    await waitFor(() => expect(router.state.location.search).toMatchObject({ visao: 'encerrados', sla: 'ESTOURADO' }))
  })

  it('USUARIO não vê fila aberta, minha área, agendados nem minha fila', async () => {
    montar('USUARIO')
    const nav = await screen.findByRole('navigation', { name: 'Visões de chamados' })
    expect(await within(nav).findByRole('link', { name: /Abertos por mim/ })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: /Aguardando validação/ })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: /Encerrados/ })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: /Todos/ })).toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: /Fila aberta/ })).not.toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: /Minha área/ })).not.toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: /Agendados/ })).not.toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: /Minha fila/ })).not.toBeInTheDocument()
  })

  it('mostra erro com "Tentar novamente" quando as contagens falham', async () => {
    const r = renderRota('/chamados', {
      sessao: sessaoDe('OPERADOR'),
      respostas: {},
    })
    restaurar = r.falsa.restaurar
    expect(await screen.findByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument()
  })

  it('não mostra o painel de visões em /chamados/novo', async () => {
    montar('OPERADOR', '/chamados/novo')
    await screen.findByRole('navigation', { name: 'Aplicativos' })
    expect(screen.queryByRole('navigation', { name: 'Visões de chamados' })).not.toBeInTheDocument()
  })
})

describe('filtros de /chamados', () => {
  it('aceita URL vazia sem preencher defaults', () => {
    expect(ChamadoBuscaSchema.parse({})).toEqual({})
  })

  it('aceita busca numérica e teveRejeicao booleano vindos do router', () => {
    expect(ChamadoBuscaSchema.parse({ busca: 123, teveRejeicao: true })).toEqual({ busca: '123', teveRejeicao: true })
  })

  it('rejeita visão desconhecida', () => {
    expect(ChamadoBuscaSchema.safeParse({ visao: 'outra' }).success).toBe(false)
  })

  it('USUARIO não herda visão de equipe', () => {
    expect(visaoEfetiva('fila-aberta', 'USUARIO')).toBe('abertos-por-mim')
    expect(visaoEfetiva('fila-aberta', 'OPERADOR')).toBe('fila-aberta')
  })
})
