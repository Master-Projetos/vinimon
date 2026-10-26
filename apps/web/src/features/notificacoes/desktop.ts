import { type NotificacaoDTO, type TipoNotificacao, textoNotificacao } from '@vinimon/shared'
import { gravar, ler } from '@/lib/storage'

const CHAVE_APRESENTADAS = 'notifs-apresentadas'
const MAX_APRESENTADAS = 100

/** Parte de `Notification` que o app usa (e que os testes simulam sem molde). */
export interface ConstrutorNotificacao {
  readonly permission: NotificationPermission
  new (titulo: string, opcoes?: NotificationOptions): unknown
}

/** Parte de `navigator.locks` que o app usa. */
export interface GerenciadorLocks {
  request: (nome: string, opcoes: { ifAvailable: true }, callback: (lock: Lock | null) => void) => Promise<unknown>
}

export interface DepsDesktop {
  /** Aba em primeiro plano com foco: vira toast em vez de notificação do sistema. */
  comFoco: () => boolean
  /** Estado manual OCUPADO: suprime tudo, exceto MENCAO e SLA. */
  ocupado: boolean
  /** O usuário mantém o desktop ligado para este tipo (preferência). */
  desktopLigado: (tipo: TipoNotificacao) => boolean
  toast: (mensagem: string) => void
  Notificacao?: ConstrutorNotificacao | undefined
  locks?: GerenciadorLocks | undefined
}

/** Texto curto de cada notificação. Nunca leva o texto da mensagem do usuário (§3.8). */
export function corpoDaNotificacao(n: NotificacaoDTO): string {
  const autor = n.atores[0]?.nome ?? 'Alguém'
  if (n.tipo === 'MENCAO') return `${autor} mencionou você`
  if (n.tipo === 'COMENTARIO') return `${autor} comentou`
  return textoNotificacao(n)
}

export function tituloDaNotificacao(n: NotificacaoDTO): string {
  return `Chamado #${n.chamado.id} · ${n.chamado.assunto.slice(0, 60)}`
}

function jaApresentada(id: number): boolean {
  return ler<number[]>(CHAVE_APRESENTADAS, []).includes(id)
}

function registrarApresentada(id: number): void {
  gravar(CHAVE_APRESENTADAS, [...ler<number[]>(CHAVE_APRESENTADAS, []), id].slice(-MAX_APRESENTADAS))
}

function entregar(n: NotificacaoDTO, deps: DepsDesktop): void {
  if (jaApresentada(n.id)) return
  registrarApresentada(n.id)
  const corpo = corpoDaNotificacao(n)
  if (deps.comFoco()) {
    deps.toast(corpo)
    return
  }
  const Ctor = deps.Notificacao
  if (Ctor?.permission !== 'granted') return
  try {
    new Ctor(tituloDaNotificacao(n), { body: corpo, tag: `chamado-${n.chamado.id}`, icon: '/icon-192.png' })
  } catch {
    // Alguns navegadores (Android) proíbem o construtor: o aviso fica só no sino.
  }
}

/**
 * Apresenta uma notificação nova na área de trabalho (§3.8). Deduplica entre abas por `navigator.locks` e pelo
 * registro `vinimon:notifs-apresentadas`. Só considera o desktop quando a preferência está ligada.
 */
export async function apresentarNotificacao(n: NotificacaoDTO, deps: DepsDesktop): Promise<void> {
  if (!deps.desktopLigado(n.tipo)) return
  if (deps.ocupado && n.tipo !== 'MENCAO' && n.tipo !== 'SLA') return
  const locks = deps.locks
  if (!locks) {
    entregar(n, deps)
    return
  }
  await locks.request(`vinimon:notif:${n.id}`, { ifAvailable: true }, (lock) => {
    if (lock) entregar(n, deps)
  })
}
