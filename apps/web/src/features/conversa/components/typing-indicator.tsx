export interface TypingIndicatorProps {
  nomes: string[]
}

/** "Ana está digitando…" em região `aria-live`; fica montada (vazia) para o leitor de tela anunciar a mudança. */
export function TypingIndicator({ nomes }: TypingIndicatorProps) {
  const texto =
    nomes.length === 0
      ? ''
      : nomes.length === 1
        ? `${nomes[0]} está digitando…`
        : `${nomes.slice(0, 2).join(' e ')}${nomes.length > 2 ? ` e mais ${nomes.length - 2}` : ''} estão digitando…`
  return (
    <p aria-live="polite" className="min-h-4 px-1 text-xs text-muted-foreground">
      {texto}
    </p>
  )
}
