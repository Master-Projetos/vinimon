import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { gravar, ler } from '@/lib/storage'

export type Densidade = 'confortavel' | 'compacta'

export interface DensityContextValue {
  densidade: Densidade
  definirDensidade: (densidade: Densidade) => void
}

const CHAVE_DENSIDADE = 'densidade'
const DENSIDADE_PADRAO: Densidade = 'confortavel'
const DENSIDADES: readonly string[] = ['confortavel', 'compacta']

const DensityContext = createContext<DensityContextValue | null>(null)

function normalizarDensidade(valor: unknown): Densidade | null {
  return typeof valor === 'string' && DENSIDADES.includes(valor) ? (valor as Densidade) : null
}

export function DensityProvider({ children }: { children: ReactNode }) {
  const [densidade, setDensidade] = useState<Densidade>(
    () => normalizarDensidade(ler<unknown>(CHAVE_DENSIDADE, DENSIDADE_PADRAO)) ?? DENSIDADE_PADRAO,
  )

  useEffect(() => {
    document.documentElement.dataset.densidade = densidade
  }, [densidade])

  const definirDensidade = useCallback((nova: Densidade) => {
    const valida = normalizarDensidade(nova)
    if (valida === null) return
    setDensidade(valida)
    gravar(CHAVE_DENSIDADE, valida)
  }, [])

  const valor = useMemo(() => ({ densidade, definirDensidade }), [densidade, definirDensidade])

  return <DensityContext.Provider value={valor}>{children}</DensityContext.Provider>
}

export function useDensidade(): DensityContextValue {
  const contexto = useContext(DensityContext)
  if (contexto === null) throw new Error('useDensidade deve ser usado dentro de DensityProvider')
  return contexto
}
