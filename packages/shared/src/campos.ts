import { z } from 'zod'
import type { TipoCampo, VisibilidadeCampo } from './enums'

/** Parte da definição de um campo personalizado que o validador dos valores precisa. */
export interface DefinicaoCampo {
  chave: string
  rotulo: string
  tipo: TipoCampo
  opcoes: string[]
  obrigatorio: boolean
  regex: string | null
  visibilidade: VisibilidadeCampo
}

export type EtapaCampos = 'abertura' | 'edicao'

export const REGEX_CHAVE_CAMPO = /^[a-z][a-z0-9_]{1,59}$/
const LIMITE_REGEX = 500
const REGEX_DATA = /^\d{4}-\d{2}-\d{2}$/
const REGEX_HORA = /^([01]\d|2[0-3]):[0-5]\d$/

/** Compila a regex da definição; null se inválida. */
export function compilarRegexCampo(regex: string): RegExp | null {
  try {
    return new RegExp(regex, 'u')
  } catch {
    return null
  }
}

function esquemaDoTipo(c: DefinicaoCampo): z.ZodType {
  switch (c.tipo) {
    case 'TEXTO':
    case 'AREA_TEXTO': {
      const max = c.tipo === 'TEXTO' ? 500 : 5000
      const base = z.string().trim().max(max, `Use no máximo ${max} caracteres.`)
      const re = c.regex === null ? null : compilarRegexCampo(c.regex)
      if (re === null) return base
      return base.refine((v) => v === '' || v.length > LIMITE_REGEX || re.test(v), 'Formato inválido.')
    }
    case 'NUMERO':
      return z.number().finite()
    case 'SELECAO':
      return z.string().refine((v) => c.opcoes.includes(v), 'Opção inválida.')
    case 'SELECAO_MULTIPLA':
      return z
        .array(z.string().refine((v) => c.opcoes.includes(v), 'Opção inválida.'))
        .max(50)
        .refine((a) => new Set(a).size === a.length, 'Há opções repetidas.')
    case 'DATA':
      return z
        .string()
        .regex(REGEX_DATA, 'Data inválida.')
        .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), 'Data inválida.')
    case 'HORA':
      return z.string().regex(REGEX_HORA, 'Hora inválida.')
    case 'DATA_HORA':
      return z.iso.datetime({ offset: true, error: 'Data e hora inválidas.' })
    case 'CHECKBOX':
      return z.boolean()
  }
}

function vazioPara(c: DefinicaoCampo, v: unknown): boolean {
  if (v === undefined || v === null) return true
  if (typeof v === 'string' && v.trim() === '') return true
  if (c.tipo === 'SELECAO_MULTIPLA' && Array.isArray(v) && v.length === 0) return true
  return false
}

/**
 * Monta o `z.strictObject` dos valores, uma entrada por `chave`.
 * Na abertura, campos SO_EDICAO não existem (chave extra = 400). Obrigatório exige valor preenchido.
 */
export function schemaDosCampos(campos: readonly DefinicaoCampo[], etapa: EtapaCampos) {
  const forma: Record<string, z.ZodType> = {}
  for (const c of campos) {
    if (etapa === 'abertura' && c.visibilidade === 'SO_EDICAO') continue
    const base = esquemaDoTipo(c)
    forma[c.chave] = c.obrigatorio
      ? z
          .unknown()
          .superRefine((v, ctx) => {
            if (vazioPara(c, v)) ctx.addIssue({ code: 'custom', message: 'Campo obrigatório.' })
          })
          .pipe(base)
      : base.optional()
  }
  return z.strictObject(forma)
}
