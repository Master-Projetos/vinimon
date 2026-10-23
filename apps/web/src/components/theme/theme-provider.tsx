import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ModoTema } from '@/lib/cores'
import { gravar, ler } from '@/lib/storage'

export type Tema = 'claro' | 'escuro' | 'sistema'

/** Aceita a grafia do design ('escuro') e a maiúscula usada em testes ('ESCURO'). Ambas são normalizadas para minúsculas. */
export type EntradaTema = Tema | Uppercase<Tema>

export interface ThemeContextValue {
  tema: Tema
  temaEfetivo: ModoTema
  definirTema: (tema: EntradaTema) => void
}

const CHAVE_TEMA = 'tema'
const TEMA_PADRAO: Tema = 'sistema'
const CONSULTA_ESCURO = '(prefers-color-scheme: dark)'
const TEMAS: readonly string[] = ['claro', 'escuro', 'sistema']

const ThemeContext = createContext<ThemeContextValue | null>(null)

function normalizarTema(valor: string): Tema | null {
  const minusculo = valor.toLowerCase()
  return TEMAS.includes(minusculo) ? (minusculo as Tema) : null
}

function sistemaEscuro(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(CONSULTA_ESCURO).matches
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [tema, setTema] = useState<Tema>(() => {
    const salvo = ler<unknown>(CHAVE_TEMA, TEMA_PADRAO)
    return (typeof salvo === 'string' ? normalizarTema(salvo) : null) ?? TEMA_PADRAO
  })
  const [escuroDoSistema, setEscuroDoSistema] = useState<boolean>(sistemaEscuro)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const consulta = window.matchMedia(CONSULTA_ESCURO)
    const aoMudar = () => setEscuroDoSistema(consulta.matches)
    consulta.addEventListener('change', aoMudar)
    return () => consulta.removeEventListener('change', aoMudar)
  }, [])

  const temaEfetivo: ModoTema = tema === 'sistema' ? (escuroDoSistema ? 'escuro' : 'claro') : tema

  useEffect(() => {
    const raiz = document.documentElement
    raiz.classList.toggle('dark', temaEfetivo === 'escuro')
    raiz.style.colorScheme = temaEfetivo === 'escuro' ? 'dark' : 'light'
  }, [temaEfetivo])

  const definirTema = useCallback((entrada: EntradaTema) => {
    const novo = normalizarTema(entrada)
    if (novo === null) return
    setTema(novo)
    gravar(CHAVE_TEMA, novo)
  }, [])

  const valor = useMemo(() => ({ tema, temaEfetivo, definirTema }), [tema, temaEfetivo, definirTema])

  return <ThemeContext.Provider value={valor}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const contexto = useContext(ThemeContext)
  if (contexto === null) throw new Error('useTheme deve ser usado dentro de ThemeProvider')
  return contexto
}
