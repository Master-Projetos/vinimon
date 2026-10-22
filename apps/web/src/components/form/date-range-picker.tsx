import { CalendarIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { FUSO_PADRAO, formatarData } from '@/lib/datas'
import { cn } from '@/lib/utils'
import { type CamposFuso, camposNoFuso, diaDoCalendario, instanteNoFuso } from './date-picker'

export interface IntervaloDatas {
  de?: Date
  ate?: Date
}

export interface DateRangePickerProps {
  valor: IntervaloDatas
  aoMudar: (v: IntervaloDatas) => void
  atalhos?: boolean
  id?: string
}

type Atalho = 'hoje' | 'sete' | 'trinta' | 'mesAtual' | 'mesPassado'

const ATALHOS: { id: Atalho; rotulo: string }[] = [
  { id: 'hoje', rotulo: 'Hoje' },
  { id: 'sete', rotulo: '7 dias' },
  { id: 'trinta', rotulo: '30 dias' },
  { id: 'mesAtual', rotulo: 'Este mês' },
  { id: 'mesPassado', rotulo: 'Mês passado' },
]

/** Soma dias de calendário a um dia (Date.UTC normaliza meses e anos). */
function somarDias(c: CamposFuso, n: number): CamposFuso {
  const u = new Date(Date.UTC(c.ano, c.mes - 1, c.dia + n))
  return { ...c, ano: u.getUTCFullYear(), mes: u.getUTCMonth() + 1, dia: u.getUTCDate() }
}

/** Último dia de um mês (mes de 1 a 12). */
function ultimoDia(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate()
}

/** Início do dia 00:00 no fuso; fim do dia 23:59:59.999 no fuso. */
function inicioDoDia(c: CamposFuso): Date {
  return instanteNoFuso({ ...c, hora: 0, minuto: 0 })
}
function fimDoDia(c: CamposFuso): Date {
  return new Date(instanteNoFuso({ ...c, hora: 23, minuto: 59 }).getTime() + 59_999)
}

/** Atalhos: "7 dias" e "30 dias" terminam hoje; "Este mês" cobre o mês inteiro. */
export function intervaloDoAtalho(atalho: Atalho, agora: Date, fuso: string = FUSO_PADRAO): IntervaloDatas {
  const hoje = { ...camposNoFuso(agora, fuso), hora: 0, minuto: 0 }
  switch (atalho) {
    case 'hoje':
      return { de: inicioDoDia(hoje), ate: fimDoDia(hoje) }
    case 'sete':
      return { de: inicioDoDia(somarDias(hoje, -6)), ate: fimDoDia(hoje) }
    case 'trinta':
      return { de: inicioDoDia(somarDias(hoje, -29)), ate: fimDoDia(hoje) }
    case 'mesAtual': {
      const inicio = { ...hoje, dia: 1 }
      const fim = { ...hoje, dia: ultimoDia(hoje.ano, hoje.mes) }
      return { de: inicioDoDia(inicio), ate: fimDoDia(fim) }
    }
    case 'mesPassado': {
      const anterior = somarDias({ ...hoje, dia: 1 }, -1)
      const inicio = { ...anterior, dia: 1 }
      const fim = { ...anterior, dia: ultimoDia(anterior.ano, anterior.mes) }
      return { de: inicioDoDia(inicio), ate: fimDoDia(fim) }
    }
  }
}

function rotuloIntervalo({ de, ate }: IntervaloDatas): string {
  if (de && ate) return `${formatarData(de)} – ${formatarData(ate)}`
  if (de) return `A partir de ${formatarData(de)}`
  if (ate) return `Até ${formatarData(ate)}`
  return 'Selecione o período'
}

export function DateRangePicker({ valor, aoMudar, atalhos = true, id }: DateRangePickerProps) {
  const [aberto, setAberto] = useState(false)
  const vazio = !valor.de && !valor.ate
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          aria-haspopup="dialog"
          aria-expanded={aberto}
          className={cn('w-full justify-start font-normal', vazio && 'text-muted-foreground')}
        >
          <CalendarIcon aria-hidden="true" />
          {rotuloIntervalo(valor)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex w-auto flex-col gap-3 p-3 sm:flex-row" align="start">
        {atalhos && (
          <fieldset className="flex flex-col gap-1">
            <legend className="text-muted-foreground px-2 text-xs">Atalhos</legend>
            {ATALHOS.map((a) => (
              <Button
                key={a.id}
                type="button"
                variant="ghost"
                size="sm"
                className="justify-start"
                onClick={() => aoMudar(intervaloDoAtalho(a.id, new Date()))}
              >
                {a.rotulo}
              </Button>
            ))}
          </fieldset>
        )}
        <Calendar
          mode="range"
          numberOfMonths={1}
          selected={{
            from: valor.de ? diaDoCalendario(valor.de) : undefined,
            to: valor.ate ? diaDoCalendario(valor.ate) : undefined,
          }}
          onSelect={(intervalo) => {
            aoMudar({
              de: intervalo?.from ? inicioDoDia(calendarioParaCampos(intervalo.from)) : undefined,
              ate: intervalo?.to ? fimDoDia(calendarioParaCampos(intervalo.to)) : undefined,
            })
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

/** Dia escolhido no Calendar (Date local com o dia certo) como campos do relógio. */
function calendarioParaCampos(d: Date): CamposFuso {
  return { ano: d.getFullYear(), mes: d.getMonth() + 1, dia: d.getDate(), hora: 0, minuto: 0 }
}
