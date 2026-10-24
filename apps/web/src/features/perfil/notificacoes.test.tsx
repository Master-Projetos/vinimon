import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import {
  type PreferenciasNotificacao,
  type SessaoResposta,
  TIPOS_INAPP_FIXOS,
  TIPOS_NOTIFICACAO,
  type UsuarioMe,
} from '@vinimon/shared'
import { afterEach, describe, expect, it } from 'vitest'
import { renderRota } from '@/test/render-rota'

// Radix (Checkbox, Popper) usa ResizeObserver, que o jsdom não tem.
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

function sessao(): SessaoResposta {
  const usuario: UsuarioMe = {
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
  }
  return { estado: 'ATIVA', csrf: 'csrf-teste', usuario }
}

const preferencias = (
  sobrescrever: Partial<Record<string, { inApp: boolean; desktop: boolean }>> = {},
): PreferenciasNotificacao => ({
  itens: TIPOS_NOTIFICACAO.map((tipo) => ({
    tipo,
    inApp: sobrescrever[tipo]?.inApp ?? true,
    desktop: sobrescrever[tipo]?.desktop ?? true,
    fixo: (TIPOS_INAPP_FIXOS as readonly string[]).includes(tipo),
  })),
})

function montar(respostas: Record<string, unknown>) {
  const r = renderRota('/perfil/notificacoes', { sessao: sessao(), respostas })
  restaurar = r.falsa.restaurar
  return r
}

const caixa = (nome: string) => screen.findByRole('checkbox', { name: nome })

describe('/perfil/notificacoes', () => {
  it('salvar envia as preferências esperadas e o GET seguinte mostra os mesmos valores', async () => {
    const { falsa } = montar({
      'GET /me/preferencias-notificacao': preferencias(),
      'PUT /me/preferencias-notificacao': preferencias({ COMENTARIO: { inApp: true, desktop: false } }),
    })
    fireEvent.click(await caixa('Comentário, na área de trabalho'))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar preferências' }))
    await waitFor(() => expect(falsa.chamadas.some((c) => c.metodo === 'PUT')).toBe(true))
    const corpo = falsa.chamadas.find((c) => c.metodo === 'PUT')?.corpo as {
      itens: { tipo: string; inApp: boolean; desktop: boolean }[]
    }
    expect(corpo.itens).toHaveLength(TIPOS_NOTIFICACAO.length)
    expect(corpo.itens.find((i) => i.tipo === 'COMENTARIO')).toEqual({
      tipo: 'COMENTARIO',
      inApp: true,
      desktop: false,
    })
    expect(corpo.itens.find((i) => i.tipo === 'MENCAO')).toEqual({ tipo: 'MENCAO', inApp: true, desktop: true })
    expect(await screen.findByText('Preferências salvas')).toBeInTheDocument()

    cleanup()
    restaurar?.()
    montar({ 'GET /me/preferencias-notificacao': preferencias({ COMENTARIO: { inApp: true, desktop: false } }) })
    expect(await caixa('Comentário, na área de trabalho')).not.toBeChecked()
    expect(await caixa('Menção, na área de trabalho')).toBeChecked()
  })

  it('desligar o aviso no aplicativo desliga o da área de trabalho', async () => {
    montar({ 'GET /me/preferencias-notificacao': preferencias() })
    fireEvent.click(await caixa('Comentário, no aplicativo'))
    const desktop = await caixa('Comentário, na área de trabalho')
    expect(desktop).not.toBeChecked()
    expect(desktop).toBeDisabled()
  })

  it('tipos fixos ficam travados no aplicativo', async () => {
    montar({ 'GET /me/preferencias-notificacao': preferencias() })
    const fixo = await caixa('Menção, no aplicativo')
    expect(fixo).toBeChecked()
    expect(fixo).toBeDisabled()
  })

  it('403 mostra ErrorState', async () => {
    montar({
      'GET /me/preferencias-notificacao': () =>
        new Response(JSON.stringify({ erro: { codigo: 'SEM_PERMISSAO', mensagem: 'Negado.' } }), {
          status: 403,
          headers: { 'content-type': 'application/json' },
        }),
    })
    expect(await screen.findByText('Você não tem acesso a este conteúdo')).toBeInTheDocument()
  })
})
