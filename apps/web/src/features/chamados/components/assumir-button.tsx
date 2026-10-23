import type { ChamadoDetalhe } from '@vinimon/shared'
import { UserCheck } from 'lucide-react'
import { useState } from 'react'
import { ConfirmDialog } from '@/components/feedback/confirm-dialog'
import { Button } from '@/components/ui/button'
import { useAssumirChamado } from '../queries'

export interface AssumirButtonProps {
  detalhe: ChamadoDetalhe
  usuarioId: number
}

/**
 * Assumir o chamado. Se outra pessoa é a responsável, pede confirmação e reenvia com `confirmarTroca: true`
 * (sem ele a API responde 409). A `versao` é a do detalhe que o cliente viu.
 */
export function AssumirButton({ detalhe, usuarioId }: AssumirButtonProps) {
  const [confirmando, setConfirmando] = useState(false)
  const assumir = useAssumirChamado(detalhe.id)
  const trocaDeOperador = detalhe.operador !== null && detalhe.operador.id !== usuarioId

  function enviar(confirmarTroca: boolean) {
    assumir.mutate(confirmarTroca ? { versao: detalhe.versao, confirmarTroca: true } : { versao: detalhe.versao })
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={assumir.isPending}
        onClick={() => (trocaDeOperador ? setConfirmando(true) : enviar(false))}
      >
        <UserCheck aria-hidden="true" />
        Assumir
      </Button>
      <ConfirmDialog
        aberto={confirmando}
        aoMudarAberto={setConfirmando}
        titulo="Assumir este chamado?"
        descricao={`${detalhe.operador?.nome ?? 'Outra pessoa'} é a responsável atual. O chamado passará para você e ela será avisada.`}
        rotuloConfirmar="Assumir"
        aoConfirmar={() => {
          setConfirmando(false)
          enviar(true)
        }}
      />
    </>
  )
}
