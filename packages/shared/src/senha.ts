import { z } from 'zod'

/** S10: de 12 a 128 caracteres. A força (zxcvbn) é calculada na API (T-2.1) e no front. */
export const SenhaSchema = z.string().min(12, 'Use ao menos 12 caracteres.').max(128)

/** Entradas usadas no cálculo de força: a senha não pode repetir dados do próprio usuário. */
export type EntradasForca = {
  login: string
  nome: string
  email: string | null
  organizacao: string
}
