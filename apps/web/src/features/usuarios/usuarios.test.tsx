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
  areas: [
    { id: 1, nome: 'TI', atende: true },
    { id: 2, nome: 'Financeiro', atende: true },
  ],
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

const usuario = (id: number, login: string, nome: string, extra: Record<string, unknown> = {}) => ({
  id,
  login,
  nome,
  email: null,
  telefone: null,
  perfil: 'OPERADOR',
  areaId: 1,
  area: { id: 1, nome: 'TI' },
  areaSecundariaIds: [],
  departamentoId: null,
  ativo: true,
  deveTrocarSenha: false,
  mfaAtivo: true,
  ultimoLoginEm: '2026-10-01T10:00:00.000Z',
  criadoEm: '2026-09-01T10:00:00.000Z',
  atualizadoEm: '2026-09-01T10:00:00.000Z',
  ...extra,
})

const lista = {
  'GET /usuarios': pagina([
    usuario(1, 'ana', 'Ana Souza'),
    usuario(2, 'bia', 'Bia Lima', {
      perfil: 'USUARIO',
      mfaAtivo: false,
      ultimoLoginEm: null,
      ativo: false,
      area: null,
      areaId: null,
    }),
  ]),
  'GET /meta': meta,
}

const abrirMenu = (nome: string) =>
  fireEvent.pointerDown(screen.getByRole('button', { name: `Ações de ${nome}` }), {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse',
  })

describe('/admin/usuarios', () => {
  it('(a) lista os usuários com perfil, área, 2FA, último acesso e situação', async () => {
    montar('/admin/usuarios', lista)
    expect(await screen.findByText('Ana Souza')).toBeInTheDocument()
    const linhaBia = screen.getByText('Bia Lima').closest('tr') as HTMLElement
    expect(within(linhaBia).getByText('bia')).toBeInTheDocument()
    expect(within(linhaBia).getByText('Usuário')).toBeInTheDocument()
    expect(within(linhaBia).getByText('Nunca')).toBeInTheDocument()
    expect(within(linhaBia).getByText('Inativo')).toBeInTheDocument()
    const linhaAna = screen.getByText('Ana Souza').closest('tr') as HTMLElement
    expect(within(linhaAna).getByText('Operador')).toBeInTheDocument()
    expect(within(linhaAna).getByText('TI')).toBeInTheDocument()
    expect(within(linhaAna).getByText('Ativo', { selector: 'td' })).toBeInTheDocument()
  })

  it('(b) criar faz POST /usuarios e mostra a senha temporária uma vez (fechar remove do DOM)', async () => {
    const { falsa } = montar('/admin/usuarios', {
      ...lista,
      'POST /usuarios': () =>
        json({ usuario: usuario(3, 'maria', 'Maria Souza'), senhaTemporaria: 'Temp-Senha-123' }, 201),
    })
    fireEvent.click(await screen.findByRole('button', { name: /Novo usuário/ }))
    fireEvent.change(await screen.findByLabelText(/^Login/), { target: { value: 'maria' } })
    fireEvent.change(screen.getByLabelText(/^Nome/), { target: { value: 'Maria Souza' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(falsa.chamadas).toContainEqual({
        metodo: 'POST',
        url: '/api/v1/usuarios',
        corpo: { login: 'maria', nome: 'Maria Souza', perfil: 'USUARIO', areaSecundariaIds: [], ativo: true },
      }),
    )
    expect(await screen.findByText('Temp-Senha-123')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    await waitFor(() => expect(screen.queryByText('Temp-Senha-123')).not.toBeInTheDocument())
  })

  it('(b) editar faz PATCH /usuarios/:id com o body esperado (campos apagados vão como null)', async () => {
    const { falsa } = montar('/admin/usuarios', {
      ...lista,
      'PATCH /usuarios/1': () => json(usuario(1, 'ana', 'Ana Maria')),
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Editar Ana Souza' }))
    const nome = await screen.findByLabelText(/^Nome/)
    expect(nome).toHaveValue('Ana Souza')
    fireEvent.change(nome, { target: { value: 'Ana Maria' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(falsa.chamadas).toContainEqual({
        metodo: 'PATCH',
        url: '/api/v1/usuarios/1',
        corpo: {
          login: 'ana',
          nome: 'Ana Maria',
          email: null,
          telefone: null,
          perfil: 'OPERADOR',
          areaId: 1,
          areaSecundariaIds: [],
          departamentoId: null,
          ativo: true,
        },
      }),
    )
    expect(await screen.findByText('Usuário atualizado')).toBeInTheDocument()
  })

  it('(b) Redefinir senha: confirma, chama o contrato e mostra a senha devolvida uma vez', async () => {
    const { falsa } = montar('/admin/usuarios', {
      ...lista,
      'POST /usuarios/2/redefinir-senha': () => json({ senhaTemporaria: 'Nova-Senha-9' }),
    })
    await screen.findByText('Bia Lima')
    abrirMenu('Bia Lima')
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Redefinir senha' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Redefinir' }))
    await waitFor(() =>
      expect(falsa.chamadas).toContainEqual({ metodo: 'POST', url: '/api/v1/usuarios/2/redefinir-senha', corpo: {} }),
    )
    expect(await screen.findByText('Nova-Senha-9')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    await waitFor(() => expect(screen.queryByText('Nova-Senha-9')).not.toBeInTheDocument())
  })

  it('Resetar 2FA pede a senha do admin e envia { senhaAdmin }', async () => {
    const { falsa } = montar('/admin/usuarios', { ...lista, 'POST /usuarios/1/resetar-2fa': () => json({ ok: true }) })
    await screen.findByText('Ana Souza')
    abrirMenu('Ana Souza')
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Resetar 2FA' }))
    const botao = await screen.findByRole('button', { name: 'Resetar 2FA' })
    fireEvent.click(botao)
    expect(await screen.findByText('Informe a sua senha.')).toBeInTheDocument()
    expect(falsa.chamadas.some((c) => c.url.endsWith('/resetar-2fa'))).toBe(false)
    fireEvent.change(screen.getByLabelText('Sua senha'), { target: { value: 'minha-senha-forte' } })
    fireEvent.click(screen.getByRole('button', { name: 'Resetar 2FA' }))
    await waitFor(() =>
      expect(falsa.chamadas).toContainEqual({
        metodo: 'POST',
        url: '/api/v1/usuarios/1/resetar-2fa',
        corpo: { senhaAdmin: 'minha-senha-forte' },
      }),
    )
  })

  it('Resetar 2FA fica desabilitado para quem não tem 2FA', async () => {
    montar('/admin/usuarios', lista)
    await screen.findByText('Bia Lima')
    abrirMenu('Bia Lima')
    expect(await screen.findByRole('menuitem', { name: 'Resetar 2FA' })).toHaveAttribute('aria-disabled', 'true')
  })

  it.each([
    ['Encerrar sessões', 'Encerrar', 'encerrar-sessoes'],
    ['Desbloquear login', 'Desbloquear', 'desbloquear-login'],
    ['Anonimizar', 'Anonimizar', 'anonimizar'],
  ] as const)('%s confirma e chama o contrato', async (item, confirmar, rota) => {
    const { falsa } = montar('/admin/usuarios', { ...lista, [`POST /usuarios/2/${rota}`]: () => json({ ok: true }) })
    await screen.findByText('Bia Lima')
    abrirMenu('Bia Lima')
    fireEvent.click(await screen.findByRole('menuitem', { name: item }))
    fireEvent.click(await screen.findByRole('button', { name: confirmar }))
    await waitFor(() =>
      expect(falsa.chamadas).toContainEqual({ metodo: 'POST', url: `/api/v1/usuarios/2/${rota}`, corpo: {} }),
    )
  })

  it('(c) 400 com detalhes aparece no campo', async () => {
    montar('/admin/usuarios', { ...lista, 'POST /usuarios': () => erro400('login', 'Login já existe.') })
    fireEvent.click(await screen.findByRole('button', { name: /Novo usuário/ }))
    fireEvent.change(await screen.findByLabelText(/^Login/), { target: { value: 'ana' } })
    fireEvent.change(screen.getByLabelText(/^Nome/), { target: { value: 'Outra Ana' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Login já existe.')).toBeInTheDocument()
  })

  it.each([
    [403, 'Você não tem acesso a este conteúdo'],
    [404, 'Não encontrado'],
  ] as const)('(d) %i ao listar mostra o ErrorState', async (status, titulo) => {
    montar('/admin/usuarios', {
      'GET /usuarios': () => json({ erro: { codigo: 'ERRO', mensagem: 'Negado.' } }, status),
      'GET /meta': meta,
    })
    expect(await screen.findByText(titulo)).toBeInTheDocument()
  })
})
