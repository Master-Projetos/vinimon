import { type ChamadoDetalhe, ReabrirChamadoSchema } from '@vinimon/shared'
import { CampoForm } from '@/components/form/campo-form'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { aplicarErrosDoServidor, useZodForm } from '@/lib/form'
import { temErroDeCampos, useReabrirChamado } from '../queries'

const FormReabrir = ReabrirChamadoSchema.omit({ versao: true })

export interface ReabrirDialogProps {
  detalhe: ChamadoDetalhe
  aberto: boolean
  aoMudarAberto: (aberto: boolean) => void
}

/** Reabrir um chamado encerrado. A justificativa é obrigatória; prazo e permissão são validados pela API. */
export function ReabrirDialog({ detalhe, aberto, aoMudarAberto }: ReabrirDialogProps) {
  const reabrir = useReabrirChamado(detalhe.id)
  const form = useZodForm(FormReabrir, { defaultValues: { justificativa: '' } })
  const { control, handleSubmit, setError, reset } = form

  function fechar(proximo: boolean) {
    if (!proximo) reset()
    aoMudarAberto(proximo)
  }

  const enviar = handleSubmit(async (valores) => {
    try {
      await reabrir.mutateAsync({ versao: detalhe.versao, justificativa: valores.justificativa })
      fechar(false)
    } catch (erro) {
      if (temErroDeCampos(erro)) aplicarErrosDoServidor(setError, erro)
    }
  })

  return (
    <Dialog open={aberto} onOpenChange={fechar}>
      <DialogContent>
        <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Reabrir chamado</DialogTitle>
            <DialogDescription>Esta ação fica registrada no histórico do chamado.</DialogDescription>
          </DialogHeader>
          <CampoForm control={control} name="justificativa" rotulo="Justificativa" obrigatorio>
            {(field, controle) => (
              <Textarea
                {...field}
                id={controle.id}
                aria-invalid={controle['aria-invalid']}
                aria-describedby={controle['aria-describedby']}
              />
            )}
          </CampoForm>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => fechar(false)}>
              Voltar
            </Button>
            <Button type="submit" disabled={reabrir.isPending}>
              Reabrir
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
