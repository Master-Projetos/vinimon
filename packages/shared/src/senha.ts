import { z } from 'zod'

// Sem zxcvbn aqui: o shared só depende de zod. A força é calculada na API (T-2.1) e no front (chunk sob demanda).
export const SenhaSchema = z
  .string()
  .min(12, { error: 'Use ao menos 12 caracteres.' })
  .max(128, { error: 'Use no máximo 128 caracteres.' })

/** Entradas que a senha não pode conter (login, nome, e-mail, nome do sistema e da organização). */
export interface EntradasForca {
  login: string
  nome: string
  email: string | null
  organizacao: string
}
