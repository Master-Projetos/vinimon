import { CalendarIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { FUSO_PADRAO, formatarData } from '@/lib/datas'
import { cn } from '@/lib/utils'

export interface DatePickerProps {
  valor: Date | null
  aoMudar: (d: Date | null) => void
  min?: Date
  max?: Date
  id?: string
  desabilitado?: boolean
  'aria-invalid'?: boolean
}

/** Relógio de parede de um instante no fuso (campos do calendário, não do navegador). */
export interface CamposFuso {
  ano: number
  mes: number
  dia: number
  hora: number
  minuto: number
}

export function camposNoFuso(d: Date, fuso: string = FUSO_PADRAO): CamposFuso {
  const formatador = new Intl.DateTimeFormat('en-US', {
    timeZone: fuso,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
  const p: Record<string, string> = {}
  for (const parte of formatador.formatToParts(d)) p[parte.type] = parte.value
  return {
    ano: Number(p.year),
    mes: Number(p.month),
    dia: Number(p.day),
    hora: Number(p.hour),
    minuto: Number(p.minute),
  }
}

/** Chave ordenável do dia (AAAAMMDD), para comparar dias sem hora. */
export function chaveDia(c: { ano: number; mes: number; dia: number }): number {
  return c.ano * 10000 + c.mes * 100 + c.dia
}

/** Date local com o mesmo dia de calendário do instante no fuso (o Calendar trabalha em hora local). */
export function diaDoCalendario(d: Date, fuso: string = FUSO_PADRAO): Date {
  const c = camposNoFuso(d, fuso)
  return new Date(c.ano, c.mes - 1, c.dia)
}

/** Instante em que o relógio de parede `c` ocorre no fuso. */
export function instanteNoFuso(c: CamposFuso, fuso: string = FUSO_PADRAO): Date {
  const alvo = Date.UTC(c.ano, c.mes - 1, c.dia, c.hora, c.minuto)
  const real = camposNoFuso(new Date(alvo), fuso)
  const relogio = Date.UTC(real.ano, real.mes - 1, real.dia, real.hora, real.minuto)
  return new Date(alvo - (relogio - alvo))
}

export function DatePicker({
  valor,
  aoMudar,
  min,
  max,
  id,
  desabilitado = false,
  'aria-invalid': invalido,
}: DatePickerProps) {
  const [aberto, setAberto] = useState(false)
  const minDia = min ? chaveDia(camposNoFuso(min)) : undefined
  const maxDia = max ? chaveDia(camposNoFuso(max)) : undefined
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
          {valor ? formatarData(valor) : 'Selecione uma data'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={valor ? diaDoCalendario(valor) : undefined}
          defaultMonth={valor ? diaDoCalendario(valor) : undefined}
          disabled={(dia) => {
            const k = chaveDia({ ano: dia.getFullYear(), mes: dia.getMonth() + 1, dia: dia.getDate() })
            return (minDia !== undefined && k < minDia) || (maxDia !== undefined && k > maxDia)
          }}
          onSelect={(dia) => {
            if (!dia) return
            aoMudar(
              instanteNoFuso({
                ano: dia.getFullYear(),
                mes: dia.getMonth() + 1,
                dia: dia.getDate(),
                hora: 0,
                minuto: 0,
              }),
            )
            setAberto(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
