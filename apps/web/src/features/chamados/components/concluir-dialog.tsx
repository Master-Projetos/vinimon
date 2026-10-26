import { type ChamadoDetalhe, ConcluirChamadoSchema } from '@vinimon/shared'
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
import { temErroDeCampos, useConcluirChamado } from '../queries'

const FormConcluir = ConcluirChamadoSchema.omit({ versao: true })

export interface ConcluirDialogProps {
  detalhe: ChamadoDetalhe
  aberto: boolean
  aoMudarAberto: (aberto: boolean) => void
}

/** Concluir com a solução aplicada. A API decide se vai direto para ENCERRADO ou para CONCLUIDO (validação). */
export function ConcluirDialog({ detalhe, aberto, aoMudarAberto }: ConcluirDialogProps) {
  const concluir = useConcluirChamado(detalhe.id)
  const form = useZodForm(FormConcluir, { defaultValues: { solucao: '', descricaoTecnica: '' } })
  const { control, handleSubmit, setError, reset } = form

  function fechar(proximo: boolean) {
    if (!proximo) reset()
    aoMudarAberto(proximo)
  }

  const enviar = handleSubmit(async (valores) => {
    try {
      await concluir.mutateAsync({
        versao: detalhe.versao,
        solucao: valores.solucao,
        ...(valores.descricaoTecnica ? { descricaoTecnica: valores.descricaoTecnica } : {}),
      })
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
            <DialogTitle>Concluir chamado</DialogTitle>
            <DialogDescription>Esta ação fica registrada no histórico do chamado.</DialogDescription>
          </DialogHeader>
          <CampoForm control={control} name="solucao" rotulo="Solução aplicada" obrigatorio>
            {(field, controle) => (
              <Textarea
                {...field}
                id={controle.id}
                aria-invalid={controle['aria-invalid']}
                aria-describedby={controle['aria-describedby']}
              />
            )}
          </CampoForm>
          <CampoForm control={control} name="descricaoTecnica" rotulo="Descrição técnica (opcional)">
            {(field, controle) => (
              <Textarea
                {...field}
                id={controle.id}
                value={field.value ?? ''}
                aria-invalid={controle['aria-invalid']}
                aria-describedby={controle['aria-describedby']}
              />
            )}
          </CampoForm>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => fechar(false)}>
              Voltar
            </Button>
            <Button type="submit" disabled={concluir.isPending}>
              Concluir
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
