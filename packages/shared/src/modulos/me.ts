import { z } from 'zod'
import { DENSIDADES, TEMAS } from '../enums'
import { contrato } from '../http'
import { zEmail, zNome, zTelefone } from '../limites'
import { UsuarioMeSchema } from './auth'

/** PATCH /me: só os campos do próprio perfil. `perfil`, `ativo` e demais campos são chave desconhecida = 400. */
export const AtualizarMeSchema = z
  .strictObject({
    nome: zNome().optional(),
    email: zEmail()
      .transform((e) => e.toLowerCase())
      .optional(),
    telefone: zTelefone()
      .transform((t) => t || null)
      .optional(),
    tema: z.enum(TEMAS).optional(),
    densidade: z.enum(DENSIDADES).optional(),
    enviarComEnter: z.boolean().optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), 'Informe ao menos um campo.')
export type AtualizarMe = z.output<typeof AtualizarMeSchema>

export const meApi = {
  atualizar: contrato({ metodo: 'PATCH', caminho: '/me', body: AtualizarMeSchema, resposta: UsuarioMeSchema }),
}
