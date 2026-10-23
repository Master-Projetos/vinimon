import { Markdown } from '@/components/display/markdown'
import { formatarDataHora } from '@/lib/datas'

export interface DescricaoInicialCardProps {
  descricao: string
  abertoPor: string
  solicitante: string
  abertoEm: Date
}

/** Primeiro item da conversa: a descrição com que o chamado foi aberto. */
export function DescricaoInicialCard({ descricao, abertoPor, solicitante, abertoEm }: DescricaoInicialCardProps) {
  const emNomeDe = abertoPor !== solicitante
  return (
    <section aria-label="Descrição inicial do chamado" className="rounded-lg border bg-card p-4 text-card-foreground">
      <header className="mb-2 text-xs text-muted-foreground">
        {emNomeDe ? `Aberto por ${abertoPor} em nome de ${solicitante}` : `Aberto por ${solicitante}`} em{' '}
        {formatarDataHora(abertoEm)}
      </header>
      <Markdown texto={descricao} />
    </section>
  )
}
