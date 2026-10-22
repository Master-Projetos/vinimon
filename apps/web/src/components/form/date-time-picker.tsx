import { CalendarIcon } from 'lucide-react'
import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { FUSO_PADRAO, formatarDataHora } from '@/lib/datas'
import { cn } from '@/lib/utils'
import { camposNoFuso, chaveDia, type DatePickerProps, diaDoCalendario, instanteNoFuso } from './date-picker'

export interface DateTimePickerProps extends DatePickerProps {
  passoMinutos?: 5 | 15 | 30
}

const HORA = /^(\d{2}):(\d{2})$/

/** Dia com hora: calendário à esquerda da hora (input type="time", com passo configurável). */
export function DateTimePicker({
  valor,
  aoMudar,
  min,
  max,
  id,
  desabilitado = false,
  passoMinutos = 15,
  'aria-invalid': invalido,
}: DateTimePickerProps) {
  const gerado = useId()
  const idBase = id ?? gerado
  const idHora = `${idBase}-hora`
  const [aberto, setAberto] = useState(false)
  const minDia = min ? chaveDia(camposNoFuso(min)) : undefined
  const maxDia = max ? chaveDia(camposNoFuso(max)) : undefined
  const atual = valor ? camposNoFuso(valor) : null
  const horaAtual = atual ? `${String(atual.hora).padStart(2, '0')}:${String(atual.minuto).padStart(2, '0')}` : ''

  function escolherDia(dia: Date) {
    aoMudar(
      instanteNoFuso({
        ano: dia.getFullYear(),
        mes: dia.getMonth() + 1,
        dia: dia.getDate(),
        hora: atual?.hora ?? 0,
        minuto: atual?.minuto ?? 0,
      }),
    )
  }

  function escolherHora(texto: string) {
    const casa = HORA.exec(texto)
    if (!casa) return
    const hora = Number(casa[1])
    const minuto = Number(casa[2])
    const base = atual ?? camposNoFuso(new Date())
    aoMudar(instanteNoFuso({ ano: base.ano, mes: base.mes, dia: base.dia, hora, minuto }))
  }

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={desabilitado}
          aria-invalid={invalido}
          aria-haspopup="dialog"
          aria-expanded={aberto}
          className={cn('w-full justify-start font-normal', !valor && 'text-muted-foreground')}
        >
          <CalendarIcon aria-hidden="true" />
          {valor ? formatarDataHora(valor, FUSO_PADRAO) : 'Selecione data e hora'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto space-y-3 p-3" align="start">
        <Calendar
          mode="single"
          selected={valor ? diaDoCalendario(valor) : undefined}
          defaultMonth={valor ? diaDoCalendario(valor) : undefined}
          disabled={(dia) => {
            const k = chaveDia({ ano: dia.getFullYear(), mes: dia.getMonth() + 1, dia: dia.getDate() })
            return (minDia !== undefined && k < minDia) || (maxDia !== undefined && k > maxDia)
          }}
          onSelect={(dia) => {
            if (dia) escolherDia(dia)
          }}
        />
        <div className="flex items-center gap-2">
          <Label htmlFor={idHora}>Hora</Label>
          <Input
            id={idHora}
            type="time"
            step={passoMinutos * 60}
            value={horaAtual}
            disabled={desabilitado}
            aria-invalid={invalido}
            className="w-32"
            onChange={(e) => escolherHora(e.target.value)}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
