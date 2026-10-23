import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { EstadoPresenca } from '@vinimon/shared'
import { useEffect, useMemo, useRef } from 'react'
import { useOcioso } from '@/hooks/use-ocioso'
import { tempoRealAtual } from '@/lib/socket'
import { type MapaPresenca, mesclarPresencas, OCIOSO_MS, presencaChaves } from './queries'

const MAX_ASSINATURAS = 200

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

/**
 * Presença dos usuários `ids` (§3.7): assina com `presenca:assinar` (a resposta traz o estado atual), reassina a cada
 * `connect` e aplica `presenca:mudou`. Devolve só os ids pedidos; quem ainda não chegou fica fora do mapa.
 * O contrato não tem `presenca:cancelar`: ao desmontar o hook só deixa de ouvir (o servidor limita por conexão).
 */
export function usePresenca(ids: readonly number[]): Record<number, EstadoPresenca> {
  const queryClient = useQueryClient()
  const chave = useMemo(
    () =>
      [...new Set(ids)]
        .filter((id) => Number.isInteger(id) && id > 0)
        .sort((a, b) => a - b)
        .slice(0, MAX_ASSINATURAS)
        .join(','),
    [ids],
  )

  const { data } = useQuery<MapaPresenca, Error, Record<number, EstadoPresenca>>({
    queryKey: presencaChaves.mapa,
    queryFn: ({ client }) => client.getQueryData<MapaPresenca>(presencaChaves.mapa) ?? {},
    initialData: {},
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    // A seleção mantém a mesma referência enquanto os estados dos ids pedidos não mudam (compartilhamento estrutural).
    select: (mapa) => {
      const recorte: Record<number, EstadoPresenca> = {}
      if (chave === '') return recorte
      for (const id of chave.split(',').map(Number)) {
        const estado = mapa[id]
        if (estado !== undefined) recorte[id] = estado
      }
      return recorte
    },
  })

  useEffect(() => {
    const tempoReal = tempoRealAtual()
    if (!tempoReal || chave === '') return
    const usuarioIds = chave.split(',').map(Number)
    const pedidos = new Set(usuarioIds)
    const assinar = () => {
      tempoReal.socket.emitir('presenca:assinar', { usuarioIds }, (resposta) => {
        if (resposta.ok) mesclarPresencas(queryClient, resposta.presencas)
      })
    }
    if (tempoReal.socket.conectado) assinar()
    const cancelarReenvio = tempoReal.registrarReenvio(assinar)
    const cancelarOuvinte = tempoReal.socket.ouvir('presenca:mudou', (p) => {
      if (pedidos.has(p.usuarioId)) mesclarPresencas(queryClient, [p])
    })
    return () => {
      cancelarReenvio()
      cancelarOuvinte()
    }
  }, [chave, queryClient])

  return data
}
