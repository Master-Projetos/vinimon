import { z } from 'zod'
import { contrato, IdParamsSchema, PaginacaoQuerySchema, paginaDe, zDataHora, zId } from '../http'
import { zEmail, zNome, zTelefone } from '../limites'
import { PERFIS } from '../permissoes'

/** Login normalizado (S14): trim, minúsculas e ^[a-z0-9._@-]{3,64}$. */
const zLogin = () =>
  z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._@-]{3,64}$/, {
      error: 'Login inválido. Use de 3 a 64 caracteres: letras, números, ponto, hífen, _ e @.',
    })
/** E-mail normalizado em minúsculas (S14). */
const zEmailNormalizado = () => z.string().trim().toLowerCase().pipe(zEmail())
const zIds = (limite: number, mensagem: string) =>
  z
    .array(z.int().positive().max(2_147_483_647))
    .max(limite, { error: mensagem })
    .refine((ids) => new Set(ids).size === ids.length, { error: 'Áreas repetidas.' })
const zAreasSecundarias = () =>
  z
    .array(z.int().positive().max(2_147_483_647))
    .max(20, { error: 'Informe no máximo 20 áreas secundárias.' })
    .refine((ids) => new Set(ids).size === ids.length, { error: 'Áreas secundárias repetidas.' })

export const UsuarioAreaSchema = z.object({ id: z.int(), nome: z.string() })

export const UsuarioSchema = z.object({
  id: z.int(),
  login: z.string(),
  nome: z.string(),
  email: z.string().nullable(),
  telefone: z.string().nullable(),
  perfil: z.enum(PERFIS),
  areaId: z.int().nullable(),
  area: UsuarioAreaSchema.nullable(),
  areaSecundariaIds: z.array(z.int()),
  /** Áreas que o usuário gerencia (A04). */
  areasGeridasIds: z.array(z.int()).default([]),
  departamentoId: z.int().nullable(),
  ativo: z.boolean(),
  deveTrocarSenha: z.boolean(),
  mfaAtivo: z.boolean(),
  ultimoLoginEm: zDataHora().nullable(),
  criadoEm: zDataHora(),
  atualizadoEm: zDataHora(),
})
export type Usuario = z.output<typeof UsuarioSchema>

export const CriarUsuarioSchema = z.strictObject({
  login: zLogin(),
  nome: zNome(),
  email: zEmailNormalizado().optional(),
  telefone: zTelefone().optional(),
  perfil: z.enum(PERFIS),
  areaId: z.int().positive().max(2_147_483_647).optional(),
  areaSecundariaIds: zAreasSecundarias(),
  departamentoId: z.int().positive().max(2_147_483_647).optional(),
  ativo: z.boolean(),
})
export type CriarUsuario = z.output<typeof CriarUsuarioSchema>

export const UsuarioCriadoSchema = z.object({ usuario: UsuarioSchema, senhaTemporaria: z.string() })
export type UsuarioCriado = z.output<typeof UsuarioCriadoSchema>

export const AtualizarUsuarioSchema = z
  .strictObject({
    login: zLogin().optional(),
    nome: zNome().optional(),
    email: zEmailNormalizado().nullable().optional(),
    telefone: zTelefone().nullable().optional(),
    perfil: z.enum(PERFIS).optional(),
    areaId: z.int().positive().max(2_147_483_647).nullable().optional(),
    areaSecundariaIds: zAreasSecundarias().optional(),
    /** USUARIO: só áreas que não atendem; OPERADOR e ADMIN: só as suas áreas (A04). */
    areasGeridasIds: zIds(20, 'Informe no máximo 20 áreas geridas.').optional(),
    departamentoId: z.int().positive().max(2_147_483_647).nullable().optional(),
    ativo: z.boolean().optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), 'Informe ao menos um campo.')
export type AtualizarUsuario = z.output<typeof AtualizarUsuarioSchema>

export const ListarUsuariosQuerySchema = PaginacaoQuerySchema.extend({
  busca: z.string().trim().max(100).optional(),
  perfil: z.enum(PERFIS).optional(),
  ativo: z.stringbool().optional(),
  areaId: zId().optional(),
  direcao: z.enum(['asc', 'desc']).default('asc'),
})
export type ListarUsuariosQuery = z.output<typeof ListarUsuariosQuerySchema>

export const BuscarUsuariosQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(2, { error: 'Digite ao menos 2 caracteres.' })
    .max(50, { error: 'Máximo de 50 caracteres.' }),
})
export type BuscarUsuariosQuery = z.output<typeof BuscarUsuariosQuerySchema>

/** `login` só aparece para ADMIN (S51). */
export const UsuarioBuscaSchema = z.object({
  id: z.int(),
  nome: z.string(),
  areaNome: z.string().nullable(),
  login: z.string().optional(),
})
export type UsuarioBusca = z.output<typeof UsuarioBuscaSchema>

export const SenhaTemporariaSchema = z.object({ senhaTemporaria: z.string() })
export type SenhaTemporaria = z.output<typeof SenhaTemporariaSchema>

export const Resetar2faSchema = z.strictObject({
  senhaAdmin: z.string().min(1, { error: 'Informe a sua senha.' }).max(256, { error: 'Senha longa demais.' }),
})
export type Resetar2fa = z.output<typeof Resetar2faSchema>

export const AcaoUsuarioRespostaSchema = z.object({ ok: z.literal(true) })
export type AcaoUsuarioResposta = z.output<typeof AcaoUsuarioRespostaSchema>

export const usuariosApi = {
  listar: contrato({
    metodo: 'GET',
    caminho: '/usuarios',
    query: ListarUsuariosQuerySchema,
    resposta: paginaDe(UsuarioSchema),
  }),
  buscar: contrato({
    metodo: 'GET',
    caminho: '/usuarios/busca',
    query: BuscarUsuariosQuerySchema,
    resposta: z.array(UsuarioBuscaSchema),
  }),
  mesmoDepartamento: contrato({
    metodo: 'GET',
    caminho: '/usuarios/mesmo-departamento',
    query: BuscarUsuariosQuerySchema,
    resposta: z.array(z.object({ id: z.int(), nome: z.string() })),
  }),
  obter: contrato({
    metodo: 'GET',
    caminho: '/usuarios/:id',
    params: IdParamsSchema,
    resposta: UsuarioSchema,
  }),
  criar: contrato({
    metodo: 'POST',
    caminho: '/usuarios',
    body: CriarUsuarioSchema,
    resposta: UsuarioCriadoSchema,
    status: 201,
  }),
  atualizar: contrato({
    metodo: 'PATCH',
    caminho: '/usuarios/:id',
    params: IdParamsSchema,
    body: AtualizarUsuarioSchema,
    resposta: UsuarioSchema,
  }),
  redefinirSenha: contrato({
    metodo: 'POST',
    caminho: '/usuarios/:id/redefinir-senha',
    params: IdParamsSchema,
    body: z.strictObject({}),
    resposta: SenhaTemporariaSchema,
  }),
  resetar2fa: contrato({
    metodo: 'POST',
    caminho: '/usuarios/:id/resetar-2fa',
    params: IdParamsSchema,
    body: Resetar2faSchema,
    resposta: AcaoUsuarioRespostaSchema,
  }),
  encerrarSessoes: contrato({
    metodo: 'POST',
    caminho: '/usuarios/:id/encerrar-sessoes',
    params: IdParamsSchema,
    body: z.strictObject({}),
    resposta: AcaoUsuarioRespostaSchema,
  }),
  desbloquearLogin: contrato({
    metodo: 'POST',
    caminho: '/usuarios/:id/desbloquear-login',
    params: IdParamsSchema,
    body: z.strictObject({}),
    resposta: AcaoUsuarioRespostaSchema,
  }),
  anonimizar: contrato({
    metodo: 'POST',
    caminho: '/usuarios/:id/anonimizar',
    params: IdParamsSchema,
    body: z.strictObject({}),
    resposta: AcaoUsuarioRespostaSchema,
  }),
}
