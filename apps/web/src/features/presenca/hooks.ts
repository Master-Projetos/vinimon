import type { EstadoPresenca } from '@vinimon/shared'
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { useOcioso } from '@/hooks/use-ocioso'
import { type TempoReal, tempoRealAtual } from '@/lib/socket'
import { OCIOSO_MS } from './queries'

/**
 * Avisa o servidor quando o usuário passa de ativo para ocioso (ou volta), só quando o valor muda (§3.7).
 * Ativo = aba visível e entrada há menos de 5 min. A conexão nasce ativa no servidor, então só se reenvia ao
 * reconectar se o estado atual for ocioso.
 */
export function usePresencaAtividade(): void {
  const ocioso = useOcioso(OCIOSO_MS)
  const ultimoEnviado = useRef(true)

  useEffect(() => {
    const tempoReal = tempoRealAtual()
    if (!tempoReal) return
    const ativo = !ocioso
    const enviar = () => {
      ultimoEnviado.current = ativo
      tempoReal.socket.emitir('presenca:atividade', { ativo })
    }
    if (ativo !== ultimoEnviado.current && tempoReal.socket.conectado) enviar()
    // Conexão nova começa ativa no servidor: só repete o aviso se o usuário estiver ocioso.
    return tempoReal.registrarReenvio(() => {
      ultimoEnviado.current = true
      if (!ativo) enviar()
    })
  }, [ocioso])
}

// O servidor SUBSTITUI as assinaturas a cada `presenca:assinar` (S97). Por isso há um único conjunto de ids para
// o app todo: a união do que cada tela pede. Cada tela soma e retira os seus ids; o conjunto inteiro é reenviado.
const LIMITE_ASSINATURA = 200
const referencias = new Map<number, number>()
let estados: Readonly<Record<number, EstadoPresenca>> = {}
let ligadoA: TempoReal | null = null
let desligar: (() => void) | null = null
const avisos = new Set<() => void>()

function avisarTodos(): void {
  for (const aviso of avisos) aviso()
}

function assinarNoServidor(tempoReal: TempoReal): void {
  if (!tempoReal.socket.conectado) return
  const usuarioIds = [...referencias.keys()].slice(0, LIMITE_ASSINATURA)
  tempoReal.socket.emitir('presenca:assinar', { usuarioIds }, (resposta) => {
    if (!resposta.ok) return
    const novos: Record<number, EstadoPresenca> = {}
    for (const p of resposta.presencas) novos[p.usuarioId] = p.estado
    estados = novos
    avisarTodos()
  })
}

function ligar(tempoReal: TempoReal): void {
  if (ligadoA === tempoReal) return
  desligar?.()
  const cancelarMudou = tempoReal.socket.ouvir('presenca:mudou', ({ usuarioId, estado }) => {
    if (!referencias.has(usuarioId)) return
    estados = { ...estados, [usuarioId]: estado }
    avisarTodos()
  })
  const cancelarReenvio = tempoReal.registrarReenvio(() => assinarNoServidor(tempoReal))
  ligadoA = tempoReal
  desligar = () => {
    cancelarMudou()
    cancelarReenvio()
    ligadoA = null
    desligar = null
  }
}

function adicionar(ids: readonly number[]): () => void {
  const tempoReal = tempoRealAtual()
  for (const id of ids) referencias.set(id, (referencias.get(id) ?? 0) + 1)
  if (tempoReal) {
    ligar(tempoReal)
    assinarNoServidor(tempoReal)
  }
  return () => {
    for (const id of ids) {
      const restantes = (referencias.get(id) ?? 1) - 1
      if (restantes <= 0) referencias.delete(id)
      else referencias.set(id, restantes)
    }
    if (referencias.size === 0) {
      desligar?.()
      estados = {}
      return
    }
    const atual = tempoRealAtual()
    if (atual) assinarNoServidor(atual)
  }
}

function assinarEstados(aviso: () => void): () => void {
  avisos.add(aviso)
  return () => {
    avisos.delete(aviso)
  }
}

/**
 * Presença das pessoas em `ids`, por id (`OFFLINE` enquanto o servidor não respondeu). Assina com `presenca:assinar`,
 * reassina a cada `connect` e acompanha `presenca:mudou`. O servidor só confirma o que o perfil pode ver (S97).
 */
export function usePresenca(ids: readonly number[]): Readonly<Record<number, EstadoPresenca>> {
  const chave = [...new Set(ids)].sort((a, b) => a - b).join(',')
  const unicos = useMemo(() => (chave === '' ? [] : chave.split(',').map(Number)), [chave])
  useEffect(() => (unicos.length === 0 ? undefined : adicionar(unicos)), [unicos])
  const todos = useSyncExternalStore(
    assinarEstados,
    () => estados,
    () => estados,
  )
  return useMemo(() => {
    const doGrupo: Record<number, EstadoPresenca> = {}
    for (const id of unicos) doGrupo[id] = todos[id] ?? 'OFFLINE'
    return doGrupo
  }, [todos, unicos])
}
