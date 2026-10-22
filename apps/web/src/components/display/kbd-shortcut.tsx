export interface KbdShortcutProps {
  teclas: string[]
}

export function ehMac(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)
}

// 'mod' vira ⌘ no Mac e Ctrl nos demais (§6.2: ['mod','K'] → "⌘ K" ou "Ctrl K").
export function rotuloTecla(tecla: string, mac: boolean): string {
  if (tecla === 'mod') return mac ? '⌘' : 'Ctrl'
  return tecla
}

export function KbdShortcut({ teclas }: KbdShortcutProps) {
  const mac = ehMac()
  return (
    <span className="inline-flex items-center gap-1">
      {teclas.map((tecla) => (
        <kbd
          key={tecla}
          className="min-w-6 rounded border bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground"
        >
          {rotuloTecla(tecla, mac)}
        </kbd>
      ))}
    </span>
  )
}
