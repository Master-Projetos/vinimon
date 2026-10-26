import { useQuery } from '@tanstack/react-query'
import type { ChamadoDetalhe } from '@vinimon/shared'
import { useId, useState } from 'react'
import { z } from 'zod'
import { CampoForm } from '@/components/form/campo-form'
import { ComboboxField } from '@/components/form/combobox-field'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { aplicarErrosDoServidor, useZodForm } from '@/lib/form'
import { metaConsulta, temErroDeCampos, useEncaminharChamado } from '../queries'
import { OperadorSelect } from './operador-select'

const FormEncaminhar = z.strictObject({
  areaId: z.coerce.number({ error: 'Escolha a área de destino.' }).int().positive(),
  comentario: z.string().trim().max(10_000, { error: 'Máximo de 10.000 caracteres.' }),
  marcarPrimeiraResposta: z.boolean(),
})

/** Caixa "Marcar como primeira resposta", mostrada quando a config é ESCOLHA (encaminhar e agendar). */
export function CaixaPrimeiraResposta({ marcada, aoMudar }: { marcada: boolean; aoMudar: (v: boolean) => void }) {
  const idCaixa = useId()
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={idCaixa} checked={marcada} onCheckedChange={(v) => aoMudar(v === true)} />
      <Label htmlFor={idCaixa} className="font-normal">
        Marcar como primeira resposta
      </Label>
    </div>
  )
}

export interface EncaminharDialogProps {
  detalhe: ChamadoDetalhe
  aberto: boolean
  aoMudarAberto: (aberto: boolean) => void
}

/**
 * Encaminhar para outra área (§3.5). Só áreas que atendem; operador opcional. Com operador o chamado vai para
 * o papel ENCAMINHADO; sem operador, volta ao papel INICIAL. A API valida a equipe da área destino.
 */
export function EncaminharDialog({ detalhe, aberto, aoMudarAberto }: EncaminharDialogProps) {
  const meta = useQuery(metaConsulta())
  const encaminhar = useEncaminharChamado(detalhe.id)
  const [operador, setOperador] = useState<{ id: number; nome: string } | null>(null)
  const idOperador = useId()
  const form = useZodForm(FormEncaminhar, {
    defaultValues: { areaId: undefined, comentario: '', marcarPrimeiraResposta: true },
  })
  const { control, handleSubmit, setError, watch, setValue, reset } = form
  const areas = (meta.data?.areas ?? []).filter((a) => a.atende)
  const mostrarPrimeiraResposta = meta.data?.config['chamado.primeiraRespostaAoEncaminhar'] === 'ESCOLHA'

  function fechar(proximo: boolean) {
    if (!proximo) {
      reset()
      setOperador(null)
    }
    aoMudarAberto(proximo)
  }

  const enviar = handleSubmit(async (valores) => {
    try {
      await encaminhar.mutateAsync({
        versao: detalhe.versao,
        areaId: valores.areaId,
        ...(operador ? { operadorId: operador.id } : {}),
        ...(valores.comentario ? { comentario: valores.comentario } : {}),
        ...(mostrarPrimeiraResposta ? { marcarPrimeiraResposta: valores.marcarPrimeiraResposta } : {}),
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
            <DialogTitle>Encaminhar chamado</DialogTitle>
            <DialogDescription>O chamado muda de área. Quem recebe é avisado.</DialogDescription>
          </DialogHeader>
          <CampoForm control={control} name="areaId" rotulo="Área de destino" obrigatorio>
            {(field, controle) => (
              <ComboboxField
                id={controle.id}
                valor={field.value == null ? null : String(field.value)}
                aoMudar={(v) => field.onChange(v === null ? undefined : Number(v))}
                opcoes={areas.map((a) => ({ valor: String(a.id), rotulo: a.nome }))}
                placeholder="Escolha a área"
                placeholderBusca="Buscar área..."
                aria-invalid={controle['aria-invalid']}
                aria-describedby={controle['aria-describedby']}
              />
            )}
          </CampoForm>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={idOperador}>Operador (opcional)</Label>
            <OperadorSelect
              id={idOperador}
              operador={operador}
              aoEscolher={(operadorId, nome) => setOperador({ id: operadorId, nome })}
              desabilitado={encaminhar.isPending}
            />
          </div>
          <CampoForm control={control} name="comentario" rotulo="Comentário (opcional)">
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
          {mostrarPrimeiraResposta ? (
            <CaixaPrimeiraResposta
              marcada={watch('marcarPrimeiraResposta')}
              aoMudar={(v) => setValue('marcarPrimeiraResposta', v)}
            />
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => fechar(false)}>
              Voltar
            </Button>
            <Button type="submit" disabled={encaminhar.isPending}>
              Encaminhar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
