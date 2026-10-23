import { useEffect, useRef } from 'react'
import { useOcioso } from '@/hooks/use-ocioso'
import { tempoRealAtual } from '@/lib/socket'
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
