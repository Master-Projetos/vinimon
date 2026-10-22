import { z } from 'zod'
import { DENSIDADES, ESTADOS_SESSAO, TEMAS } from '../enums'
import { contrato } from '../http'
import { PERFIS, PERMISSOES } from '../permissoes'

export const EntrarBodySchema = z.strictObject({
  login: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._@-]{3,64}$/, 'Login inválido.'),
  senha: z.string().min(1).max(128),
})
export type EntrarBody = z.output<typeof EntrarBodySchema>

export const UsuarioMeSchema = z.object({
  id: z.int(),
  nome: z.string(),
  login: z.string(),
  email: z.string().nullable(),
  telefone: z.string().nullable(),
  perfil: z.enum(PERFIS),
  areaId: z.int().nullable(),
  areaIds: z.array(z.int()),
  permissoes: z.array(z.enum(PERMISSOES)),
  mfaAtivo: z.boolean(),
  deveTrocarSenha: z.boolean(),
  tema: z.enum(TEMAS),
  densidade: z.enum(DENSIDADES).nullable(),
  enviarComEnter: z.boolean(),
})
export type UsuarioMe = z.output<typeof UsuarioMeSchema>

export const SessaoRespostaSchema = z.object({
  estado: z.enum(ESTADOS_SESSAO),
  csrf: z.string(),
  usuario: UsuarioMeSchema.nullable(),
})
export type SessaoResposta = z.output<typeof SessaoRespostaSchema>

export const authApi = {
  entrar: contrato({ metodo: 'POST', caminho: '/auth/login', body: EntrarBodySchema, resposta: SessaoRespostaSchema }),
  sessao: contrato({ metodo: 'GET', caminho: '/auth/sessao', resposta: SessaoRespostaSchema }),
  sair: contrato({ metodo: 'POST', caminho: '/auth/logout', resposta: z.undefined(), status: 204 }),
}
