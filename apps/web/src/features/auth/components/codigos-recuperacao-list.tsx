import { Check, Copy, Download } from 'lucide-react'
import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { useCopiar } from '@/hooks/use-copiar'

/** Baixa os códigos como `.txt` (Blob local: nada vai ao servidor nem ao armazenamento do navegador). */
function baixarTxt(codigos: readonly string[]): void {
  const blob = new Blob([`Vinimon: códigos de recuperação do 2FA\n\n${codigos.join('\n')}\n`], {
    type: 'text/plain;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'vinimon-codigos-recuperacao.txt'
  link.click()
  URL.revokeObjectURL(url)
}

/**
 * Mostra os códigos de recuperação uma única vez (S29). "Concluir" só habilita depois de marcar que foram guardados.
 */
export function CodigosRecuperacaoList({
  codigos,
  aoConcluir,
}: {
  codigos: readonly string[]
  aoConcluir: () => void
}) {
  const { copiado, copiar } = useCopiar()
  const [guardei, setGuardei] = useState(false)
  const idGuardei = useId()
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Guarde estes códigos em um lugar seguro. Cada um vale uma vez e serve para entrar se você perder o aplicativo.
        Eles não serão mostrados de novo.
      </p>
      <ul className="grid grid-cols-1 gap-1 rounded-md border bg-muted/40 p-3 font-mono text-sm sm:grid-cols-2">
        {codigos.map((codigo) => (
          <li key={codigo}>{codigo}</li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => void copiar(codigos.join('\n'))}>
          {copiado ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copiado ? 'Copiado' : 'Copiar'}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => baixarTxt(codigos)}>
          <Download aria-hidden="true" />
          Baixar .txt
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id={idGuardei} checked={guardei} onCheckedChange={(v) => setGuardei(v === true)} />
        <label htmlFor={idGuardei} className="text-sm">
          Guardei meus códigos
        </label>
      </div>
      <Button type="button" className="w-full" disabled={!guardei} onClick={aoConcluir}>
        Concluir
      </Button>
    </div>
  )
}
