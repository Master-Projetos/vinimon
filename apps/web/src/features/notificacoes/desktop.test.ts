import type { NotificacaoDTO } from '@vinimon/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  apresentarNotificacao,
  corpoDaNotificacao,
  type DepsDesktop,
  type GerenciadorLocks,
  tituloDaNotificacao,
} from './desktop'

const base: NotificacaoDTO = {
  id: 1,
  tipo: 'COMENTARIO',
  chamado: { id: 123, assunto: 'Impressora parada' },
  atores: [{ id: 2, nome: 'Bia Lima' }],
  contagem: 1,
  interno: false,
  trecho: 'senha do wifi é 12345',
  assentamentoId: 9,
  dados: null,
  criadoEm: new Date(),
  atualizadoEm: new Date(),
  lida: false,
}

const construtor = vi.fn()
class NotificacaoFalsa {
  static permission: NotificationPermission = 'granted'
  constructor(titulo: string, opcoes?: NotificationOptions) {
    construtor(titulo, opcoes)
  }
}

function deps(extra: Partial<DepsDesktop> = {}): DepsDesktop {
  return {
    comFoco: () => false,
    ocupado: false,
    desktopLigado: () => true,
    toast: vi.fn(),
    Notificacao: NotificacaoFalsa,
    ...extra,
  }
}

beforeEach(() => {
  construtor.mockClear()
  window.localStorage.clear()
  NotificacaoFalsa.permission = 'granted'
})

describe('notificações na área de trabalho', () => {
  it('o body nunca contém o texto do comentário', async () => {
    await apresentarNotificacao(base, deps())
    expect(construtor).toHaveBeenCalledTimes(1)
    const [titulo, opcoes] = construtor.mock.calls[0] as [string, NotificationOptions]
    expect(titulo).toBe('Chamado #123 · Impressora parada')
    expect(opcoes.body).toBe('Bia Lima comentou')
    expect(opcoes.body).not.toContain('senha')
    expect(opcoes.tag).toBe('chamado-123')
  })

  it('menção diz "mencionou você" e o título corta o assunto em 60 caracteres', () => {
    const n = { ...base, tipo: 'MENCAO' as const, chamado: { id: 5, assunto: 'x'.repeat(80) } }
    expect(corpoDaNotificacao(n)).toBe('Bia Lima mencionou você')
    expect(tituloDaNotificacao(n)).toBe(`Chamado #5 · ${'x'.repeat(60)}`)
  })

  it('com foco vira toast, sem Notification', async () => {
    const d = deps({ comFoco: () => true })
    await apresentarNotificacao(base, d)
    expect(d.toast).toHaveBeenCalledWith('Bia Lima comentou')
    expect(construtor).not.toHaveBeenCalled()
  })

  it('OCUPADO suprime COMENTARIO, mas não MENCAO nem SLA', async () => {
    await apresentarNotificacao(base, deps({ ocupado: true }))
    expect(construtor).not.toHaveBeenCalled()
    await apresentarNotificacao({ ...base, id: 2, tipo: 'MENCAO' }, deps({ ocupado: true }))
    await apresentarNotificacao({ ...base, id: 3, tipo: 'SLA', dados: { marco: 'RISCO' } }, deps({ ocupado: true }))
    expect(construtor).toHaveBeenCalledTimes(2)
  })

  it('não repete a mesma notificação (deduplicação entre abas)', async () => {
    await apresentarNotificacao(base, deps())
    await apresentarNotificacao(base, deps())
    expect(construtor).toHaveBeenCalledTimes(1)
  })

  it('respeita a preferência e a permissão, e engole erro do construtor', async () => {
    await apresentarNotificacao(base, deps({ desktopLigado: () => false }))
    NotificacaoFalsa.permission = 'denied'
    await apresentarNotificacao({ ...base, id: 4 }, deps())
    expect(construtor).not.toHaveBeenCalled()
    NotificacaoFalsa.permission = 'granted'
    construtor.mockImplementationOnce(() => {
      throw new Error('Illegal constructor')
    })
    await expect(apresentarNotificacao({ ...base, id: 5 }, deps())).resolves.toBeUndefined()
  })

  it('só uma aba entrega quando navigator.locks nega o segundo pedido', async () => {
    let ocupado = false
    const locks: GerenciadorLocks = {
      request: async (_nome, _opcoes, callback) => {
        const lock: Lock | null = ocupado ? null : { name: 'n', mode: 'exclusive' }
        ocupado = true
        callback(lock)
      },
    }
    await apresentarNotificacao(base, deps({ locks }))
    await apresentarNotificacao({ ...base }, deps({ locks }))
    expect(construtor).toHaveBeenCalledTimes(1)
  })
})
