import { useQuery } from '@tanstack/react-query'
import type { ChamadoDetalhe } from '@vinimon/shared'
import { CalendarClock } from 'lucide-react'
import { useId, useState } from 'react'
import { z } from 'zod'
import { CampoForm } from '@/components/form/campo-form'
import { DateTimePicker } from '@/components/form/date-time-picker'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { aplicarErrosDoServidor, useZodForm } from '@/lib/form'
import { metaConsulta, temErroDeCampos, useAgendarChamado } from '../queries'
import { CaixaPrimeiraResposta } from './encaminhar-dialog'
import { OperadorSelect } from './operador-select'

const MINUTO = 60_000
const UMA_HORA = 60 * MINUTO
const ANO = 365 * 24 * UMA_HORA

const FormAgendar = z.strictObject({
  para: z.date({ error: 'Escolha a data e a hora.' }),
  marcarPrimeiraResposta: z.boolean(),
})

/** Próximo quarto de hora, a partir de uma hora à frente (a API exige ao menos 1 min e no máximo 365 dias). */
function horarioSugerido(): Date {
  const data = new Date(Date.now() + UMA_HORA)
  data.setSeconds(0, 0)
  const resto = data.getMinutes() % 15
  if (resto !== 0) data.setMinutes(data.getMinutes() + 15 - resto)
  return data
}

export interface AgendarPopoverProps {
  detalhe: ChamadoDetalhe
}

/**
 * Agendar o chamado para depois (papel AGENDADO, com `agendadoPara`). O retorno é automático pelo job.
 * Operador opcional; a caixa de primeira resposta aparece quando a config é ESCOLHA.
 */
export function AgendarPopover({ detalhe }: AgendarPopoverProps) {
  const meta = useQuery(metaConsulta())
  const agendar = useAgendarChamado(detalhe.id)
  const [aberto, setAberto] = useState(false)
  const [operador, setOperador] = useState<{ id: number; nome: string } | null>(null)
  const idOperador = useId()
  const form = useZodForm(FormAgendar, { defaultValues: { para: horarioSugerido(), marcarPrimeiraResposta: true } })
  const { control, handleSubmit, setError, watch, setValue, reset } = form
  const mostrarPrimeiraResposta = meta.data?.config['chamado.primeiraRespostaAoEncaminhar'] === 'ESCOLHA'

  function fechar(proximo: boolean) {
    if (!proximo) {
      reset({ para: horarioSugerido(), marcarPrimeiraResposta: true })
      setOperador(null)
    }
    setAberto(proximo)
  }

  const enviar = handleSubmit(async (valores) => {
    try {
      await agendar.mutateAsync({
        versao: detalhe.versao,
        para: valores.para.toISOString(),
        ...(operador ? { operadorId: operador.id } : {}),
        ...(mostrarPrimeiraResposta ? { marcarPrimeiraResposta: valores.marcarPrimeiraResposta } : {}),
      })
      fechar(false)
    } catch (erro) {
      if (temErroDeCampos(erro)) aplicarErrosDoServidor(setError, erro)
    }
  })

  return (
    <Popover open={aberto} onOpenChange={fechar}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline">
          <CalendarClock aria-hidden="true" />
          Agendar
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
          <CampoForm control={control} name="para" rotulo="Data e hora" obrigatorio>
            {(field, controle) => (
              <DateTimePicker
                id={controle.id}
                valor={field.value ?? null}
                aoMudar={(d) => field.onChange(d)}
                min={new Date(Date.now() + MINUTO)}
                max={new Date(Date.now() + ANO)}
                aria-invalid={controle['aria-invalid']}
              />
            )}
          </CampoForm>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={idOperador} className="text-sm font-medium">
              Operador (opcional)
            </label>
            <OperadorSelect
              id={idOperador}
              operador={operador}
              aoEscolher={(operadorId, nome) => setOperador({ id: operadorId, nome })}
              desabilitado={agendar.isPending}
            />
          </div>
          {mostrarPrimeiraResposta ? (
            <CaixaPrimeiraResposta
              marcada={watch('marcarPrimeiraResposta')}
              aoMudar={(v) => setValue('marcarPrimeiraResposta', v)}
            />
          ) : null}
          <Button type="submit" disabled={agendar.isPending}>
            Agendar
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}
