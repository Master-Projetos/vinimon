import type { ZxcvbnFactory } from '@zxcvbn-ts/core'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

// Mesma construção da API (apps/api/src/lib/forca-senha.ts, T-2.1): fábrica criada uma vez, dicionários pt-BR + comuns.
// Os pacotes só são baixados quando o medidor é usado (chunk sob demanda).
let fabrica: Promise<ZxcvbnFactory> | undefined

const obterFabrica = (): Promise<ZxcvbnFactory> => {
  fabrica ??= (async () => {
    const { ZxcvbnFactory } = await import('@zxcvbn-ts/core')
    const common = await import('@zxcvbn-ts/language-common')
    const ptBr = await import('@zxcvbn-ts/language-pt-br')
    return new ZxcvbnFactory({
      dictionary: { ...common.dictionary, ...ptBr.dictionary },
      graphs: common.adjacencyGraphs,
      translations: ptBr.translations,
    })
  })()
  return fabrica
}

const ROTULOS = ['Muito fraca', 'Fraca', 'Razoável', 'Boa', 'Forte'] as const
const SEPARADOR = '\u001f'

export interface PasswordStrengthProps {
  senha: string
  /** Dados que a senha não deve conter (login, nome, e-mail). */
  entradas?: string[]
}

export function PasswordStrength({ senha, entradas = [] }: PasswordStrengthProps) {
  const chave = entradas.join(SEPARADOR)
  const [score, setScore] = useState<number | null>(null)

  useEffect(() => {
    if (senha.length === 0) {
      setScore(null)
      return
    }
    let cancelado = false
    const temporizador = setTimeout(() => {
      void obterFabrica()
        .then((f) => f.checkAsync(senha.slice(0, 256), chave ? chave.split(SEPARADOR) : []))
        .then((r) => {
          if (!cancelado) setScore(r.score)
        })
    }, 150)
    return () => {
      cancelado = true
      clearTimeout(temporizador)
    }
  }, [senha, chave])

  if (senha.length === 0 || score === null) return null
  const rotulo = ROTULOS[score] ?? ROTULOS[0]
  return (
    <div className="flex flex-col gap-1" role="status" aria-live="polite">
      <div className="flex gap-1" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            data-slot="barra-forca"
            className={cn(
              'h-1 flex-1 rounded-full bg-muted',
              i < score && (score <= 1 ? 'bg-destructive' : score === 2 ? 'bg-amber-500' : 'bg-emerald-600'),
            )}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Força da senha: {rotulo}</p>
    </div>
  )
}
