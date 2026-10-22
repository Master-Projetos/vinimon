import { useEffect, useId, useState } from 'react'
import { Input } from '@/components/ui/input'
import { contraste, obterCores } from '@/lib/cores'

export interface ColorFieldProps {
  valor: string
  aoMudar: (hex: string) => void
  id?: string
  textoAmostra: string
  sugestoes?: string[]
  'aria-invalid'?: boolean
}

/** 12 sugestões de cor, todas com contraste AA na prévia do badge. */
export const SUGESTOES_COR: string[] = [
  '#dc2626',
  '#ea580c',
  '#d97706',
  '#ca8a04',
  '#65a30d',
  '#16a34a',
  '#059669',
  '#0891b2',
  '#2563eb',
  '#4f46e5',
  '#7c3aed',
  '#db2777',
]

const HEX = /^#?[0-9a-f]{6}$/i

/** Razão de contraste no formato pt-BR: 7,1 vira "7,1:1 · AA"; abaixo de 4,5 não passa em AA. */
export function formatarRazao(razao: number): string {
  const nivel = razao >= 4.5 ? 'AA' : 'abaixo de AA'
  return `${razao.toFixed(1).replace('.', ',')}:1 · ${nivel}`
}

/** Input de cor nativo, campo hex, sugestões e prévia do badge nos temas claro e escuro. */
export function ColorField({
  valor,
  aoMudar,
  id,
  textoAmostra,
  sugestoes = SUGESTOES_COR,
  'aria-invalid': invalido,
}: ColorFieldProps) {
  const gerado = useId()
  const idBase = id ?? gerado
  const idHex = `${idBase}-hex`
  const idErro = `${idBase}-erro`
  const valido = HEX.test(valor)
  const [rascunho, setRascunho] = useState(valor)
  useEffect(() => {
    setRascunho(valor)
  }, [valor])
  const rascunhoValido = HEX.test(rascunho)
  const cores = valido ? obterCores(valor.startsWith('#') ? valor : `#${valor}`) : null
  const hexAtual = valido ? `#${valor.replace('#', '').toLowerCase()}` : '#000000'

  function digitar(texto: string) {
    setRascunho(texto)
    if (HEX.test(texto)) aoMudar(`#${texto.replace('#', '').toLowerCase()}`)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          id={idBase}
          type="color"
          value={hexAtual}
          aria-invalid={invalido || undefined}
          onChange={(e) => aoMudar(e.target.value.toLowerCase())}
          className="border-input bg-transparent h-9 w-12 cursor-pointer rounded-md border p-1"
        />
        <Input
          id={idHex}
          value={rascunho}
          maxLength={7}
          spellCheck={false}
          aria-label="Cor em hexadecimal"
          aria-invalid={invalido || (rascunho !== '' && !rascunhoValido) || undefined}
          aria-describedby={!rascunhoValido ? idErro : undefined}
          onChange={(e) => digitar(e.target.value)}
          className="w-28 font-mono"
        />
      </div>
      {!rascunhoValido && (
        <p id={idErro} className="text-destructive text-sm">
          Use o formato #rrggbb.
        </p>
      )}
      <fieldset className="flex flex-wrap gap-1.5">
        <legend className="sr-only">Sugestões de cor</legend>
        {sugestoes.map((hex) => (
          <button
            key={hex}
            type="button"
            aria-label={`Usar a cor ${hex}`}
            aria-pressed={hexAtual === hex.toLowerCase()}
            onClick={() => aoMudar(hex.toLowerCase())}
            className="border-border size-6 rounded-full border-2 aria-pressed:border-foreground"
            style={{ backgroundColor: hex }}
          />
        ))}
      </fieldset>
      {cores && (
        <div className="grid gap-3 sm:grid-cols-2" aria-live="polite">
          <Previa titulo="Prévia clara" fundo="#ffffff" cor={cores.claro} texto={textoAmostra} />
          <Previa titulo="Prévia escura" fundo="#202226" cor={cores.escuro} texto={textoAmostra} />
        </div>
      )}
    </div>
  )
}

interface PreviaProps {
  titulo: string
  fundo: string
  cor: ReturnType<typeof obterCores>['claro']
  texto: string
}

function Previa({ titulo, fundo, cor, texto }: PreviaProps) {
  const razao = contraste(cor.texto, cor.fundo)
  return (
    <div className="space-y-1.5">
      <p className="text-muted-foreground text-xs">{titulo}</p>
      <div className="rounded-md p-3" style={{ backgroundColor: fundo }}>
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium"
          style={{ backgroundColor: cor.fundo, color: cor.texto, borderColor: cor.borda }}
        >
          <span aria-hidden="true" className="size-1.5 rounded-full" style={{ backgroundColor: cor.ponto }} />
          {texto}
        </span>
      </div>
      <p className="text-muted-foreground text-xs">{formatarRazao(razao)}</p>
    </div>
  )
}
