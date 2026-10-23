import { z } from 'zod'
import { DENSIDADES, ESTADOS_SESSAO, TEMAS } from '../enums'
import { contrato, UuidParamsSchema, zDataHora } from '../http'
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

const CodigoTotpSchema = z.string().regex(/^\d{6}$/, 'Informe o código de 6 dígitos.')

export const Verificar2faBodySchema = z
  .strictObject({ codigo: CodigoTotpSchema })
  .or(z.strictObject({ codigoRecuperacao: z.string().trim().max(19) }))
export type Verificar2faBody = z.output<typeof Verificar2faBodySchema>

export const Iniciar2faRespostaSchema = z.object({ otpauthUri: z.string(), segredo: z.string() })
export const Confirmar2faBodySchema = z.strictObject({ codigo: CodigoTotpSchema })
export const Confirmar2faRespostaSchema = z.object({ codigos: z.array(z.string()), sessao: SessaoRespostaSchema })
export const NovosCodigosBodySchema = z.strictObject({ senha: z.string().min(1).max(128) })
export const NovosCodigosRespostaSchema = z.object({ codigos: z.array(z.string()) })
export const Desativar2faBodySchema = z.strictObject({ senha: z.string().min(1).max(128), codigo: CodigoTotpSchema })
export const TrocarSenhaBodySchema = z.strictObject({
  senhaAtual: z.string().min(1).max(128),
  novaSenha: z.string().min(1).max(128),
})
export type TrocarSenhaBody = z.output<typeof TrocarSenhaBodySchema>

export const EsqueciSenhaBodySchema = z.strictObject({
  login: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._@-]{3,64}$/, 'Login inválido.'),
})
export type EsqueciSenhaBody = z.output<typeof EsqueciSenhaBodySchema>
export const EsqueciSenhaRespostaSchema = z.object({ mensagem: z.string() })

export const RedefinirSenhaBodySchema = z.strictObject({
  token: z.string().min(1).max(128),
  novaSenha: z.string().min(1).max(128),
})
export type RedefinirSenhaBody = z.output<typeof RedefinirSenhaBodySchema>

export const SessaoDispositivoSchema = z.object({
  id: z.uuid(),
  criadaEm: zDataHora(),
  ultimoUsoEm: zDataHora(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  atual: z.boolean(),
})
export type SessaoDispositivo = z.output<typeof SessaoDispositivoSchema>

export const authApi = {
  entrar: contrato({ metodo: 'POST', caminho: '/auth/login', body: EntrarBodySchema, resposta: SessaoRespostaSchema }),
  sessao: contrato({ metodo: 'GET', caminho: '/auth/sessao', resposta: SessaoRespostaSchema }),
  sair: contrato({ metodo: 'POST', caminho: '/auth/logout', resposta: z.undefined(), status: 204 }),
  verificar2fa: contrato({
    metodo: 'POST',
    caminho: '/auth/2fa/verificar',
    body: Verificar2faBodySchema,
    resposta: SessaoRespostaSchema,
  }),
  iniciar2fa: contrato({ metodo: 'POST', caminho: '/auth/2fa/iniciar', resposta: Iniciar2faRespostaSchema }),
  confirmar2fa: contrato({
    metodo: 'POST',
    caminho: '/auth/2fa/confirmar',
    body: Confirmar2faBodySchema,
    resposta: Confirmar2faRespostaSchema,
  }),
  codigos2fa: contrato({
    metodo: 'POST',
    caminho: '/auth/2fa/codigos',
    body: NovosCodigosBodySchema,
    resposta: NovosCodigosRespostaSchema,
  }),
  desativar2fa: contrato({
    metodo: 'POST',
    caminho: '/auth/2fa/desativar',
    body: Desativar2faBodySchema,
    resposta: z.undefined(),
    status: 204,
  }),
  sessoes: contrato({ metodo: 'GET', caminho: '/auth/sessoes', resposta: z.array(SessaoDispositivoSchema) }),
  revogarSessao: contrato({
    metodo: 'DELETE',
    caminho: '/auth/sessoes/:id',
    params: UuidParamsSchema,
    resposta: z.undefined(),
    status: 204,
  }),
  encerrarTodas: contrato({
    metodo: 'POST',
    caminho: '/auth/sessoes/encerrar-todas',
    resposta: z.undefined(),
    status: 204,
  }),
  trocarSenha: contrato({
    metodo: 'POST',
    caminho: '/auth/trocar-senha',
    body: TrocarSenhaBodySchema,
    resposta: SessaoRespostaSchema,
  }),
  esqueciSenha: contrato({
    metodo: 'POST',
    caminho: '/auth/esqueci-senha',
    body: EsqueciSenhaBodySchema,
    resposta: EsqueciSenhaRespostaSchema,
  }),
  redefinirSenha: contrato({
    metodo: 'POST',
    caminho: '/auth/redefinir-senha',
    body: RedefinirSenhaBodySchema,
    resposta: z.undefined(),
    status: 204,
  }),
}
