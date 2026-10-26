import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
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

const jornada = (id: number, nome: string, extra: Record<string, unknown> = {}) => ({
  id,
  nome,
  timezone: 'America/Sao_Paulo',
  ininterrupta: false,
  ativo: true,
  horarios: [{ diaSemana: 1, inicioMin: 480, fimMin: 1080 }],
  criadoEm: '2026-10-01T10:00:00.000Z',
  atualizadoEm: '2026-10-01T10:00:00.000Z',
  ...extra,
})

const lista = {
  'GET /jornadas': pagina([jornada(1, 'Comercial'), jornada(2, 'Plantão', { ininterrupta: true, horarios: [] })]),
  'GET /meta': meta,
}

describe('/admin/jornadas', () => {
  it('(a) lista as jornadas', async () => {
    montar('/admin/jornadas', lista)
    expect(await screen.findByText('Comercial')).toBeInTheDocument()
    expect(screen.getByText('1 janela(s)')).toBeInTheDocument()
    expect(screen.getByText('24x7')).toBeInTheDocument()
  })

  it('(b) criar a jornada Comercial faz POST /jornadas com as janelas em minutos', async () => {
    const { falsa } = montar('/admin/jornadas', {
      ...lista,
      'POST /jornadas': () => json(jornada(3, 'Comercial'), 201),
    })
    fireEvent.click(await screen.findByRole('button', { name: /Nova jornada/ }))
    fireEvent.change(await screen.findByLabelText(/^Nome/), { target: { value: 'Comercial' } })
    fireEvent.click(screen.getByRole('button', { name: /Adicionar horário/ }))
    fireEvent.change(screen.getByLabelText('Início da janela 1'), { target: { value: '09:00' } })
    fireEvent.change(screen.getByLabelText('Fim da janela 1'), { target: { value: '17:30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(falsa.chamadas).toContainEqual({
        metodo: 'POST',
        url: '/api/v1/jornadas',
        corpo: {
          nome: 'Comercial',
          timezone: 'America/Sao_Paulo',
          ininterrupta: false,
          ativo: true,
          horarios: [{ diaSemana: 1, inicioMin: 540, fimMin: 1050 }],
        },
      }),
    )
    expect(await screen.findByText('Jornada criada')).toBeInTheDocument()
  })

  it('(b) o Switch 24x7 esconde os horários e envia horarios vazio', async () => {
    const { falsa } = montar('/admin/jornadas', { ...lista, 'PUT /jornadas/1': () => json(jornada(1, 'Comercial')) })
    fireEvent.click(await screen.findByRole('button', { name: 'Editar Comercial' }))
    expect(await screen.findByLabelText('Início da janela 1')).toHaveValue('08:00')
    fireEvent.click(screen.getByRole('switch', { name: '24x7' }))
    expect(screen.queryByLabelText('Início da janela 1')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(falsa.chamadas).toContainEqual({
        metodo: 'PUT',
        url: '/api/v1/jornadas/1',
        corpo: { nome: 'Comercial', timezone: 'America/Sao_Paulo', ininterrupta: true, ativo: true, horarios: [] },
      }),
    )
  })

  it('(b) remover uma janela a tira do formulário', async () => {
    montar('/admin/jornadas', lista)
    fireEvent.click(await screen.findByRole('button', { name: 'Editar Comercial' }))
    const dialogo = await screen.findByRole('dialog')
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Remover janela 1' }))
    expect(within(dialogo).queryByLabelText('Início da janela 1')).not.toBeInTheDocument()
  })

  it('(b) excluir confirma e faz DELETE /jornadas/:id', async () => {
    const { falsa } = montar('/admin/jornadas', {
      ...lista,
      'DELETE /jornadas/1': () => new Response(null, { status: 204 }),
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir Comercial' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir' }))
    await waitFor(() =>
      expect(falsa.chamadas).toContainEqual({ metodo: 'DELETE', url: '/api/v1/jornadas/1', corpo: null }),
    )
    expect(await screen.findByText('Jornada excluída')).toBeInTheDocument()
  })

  it('(c) 409 ao excluir mostra a mensagem do servidor', async () => {
    montar('/admin/jornadas', {
      ...lista,
      'DELETE /jornadas/1': () =>
        json({ erro: { codigo: 'REGISTRO_EM_USO', mensagem: 'Registro em uso e não pode ser excluído.' } }, 409),
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir Comercial' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir' }))
    expect(await screen.findByText('Registro em uso e não pode ser excluído.')).toBeInTheDocument()
  })

  it('(c) 400 com detalhes de sobreposição aparece no campo', async () => {
    montar('/admin/jornadas', {
      ...lista,
      'PUT /jornadas/1': () => erro400('horarios', 'Há horários sobrepostos no mesmo dia.'),
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Editar Comercial' }))
    await screen.findByLabelText('Início da janela 1')
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Há horários sobrepostos no mesmo dia.')).toBeInTheDocument()
  })

  it.each([
    [403, 'Você não tem acesso a este conteúdo'],
    [404, 'Não encontrado'],
  ] as const)('(d) %i ao listar mostra o ErrorState', async (status, titulo) => {
    montar('/admin/jornadas', {
      'GET /jornadas': () => json({ erro: { codigo: 'ERRO', mensagem: 'Negado.' } }, status),
    })
    expect(await screen.findByText(titulo)).toBeInTheDocument()
  })
})
