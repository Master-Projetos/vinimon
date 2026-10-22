import { useAgora } from '@/hooks/use-agora'
import { formatarDataHora, formatarRelativo } from '@/lib/datas'

export interface RelativeTimeProps {
  valor: Date
  /** Instante de referência; sem ele, usa o relógio atualizado a cada minuto. */
  agora?: Date
}

export function RelativeTime({ valor, agora }: RelativeTimeProps) {
  const relogio = useAgora(60_000)
  const referencia = agora ?? relogio
  return (
    <time dateTime={valor.toISOString()} title={formatarDataHora(valor)}>
      {formatarRelativo(valor, referencia)}
    </time>
  )
}
