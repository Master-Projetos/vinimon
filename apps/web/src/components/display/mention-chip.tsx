export interface MentionChipProps {
  id: number
  nome: string
}

/** Menção renderizada no texto: mostra `@Nome` destacado. O id fica em `data-mencao`. */
export function MentionChip({ id, nome }: MentionChipProps) {
  return (
    <span
      data-mencao={id}
      className="inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 text-sm font-medium text-primary"
    >
      @{nome}
    </span>
  )
}
