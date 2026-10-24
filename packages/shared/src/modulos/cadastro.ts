import { z } from 'zod'
import { contrato, IdParamsSchema, PaginacaoQuerySchema, paginaDe, zDataHora } from '../http'
import { zEmail, zNome } from '../limites'

/** Login normalizado (S14): trim, minúsculas e ^[a-z0-9._@-]{3,64}$. */
const zLogin = () =>
  z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._@-]{3,64}$/, {
      error: 'Login inválido. Use de 3 a 64 caracteres: letras, números, ponto, hífen, _ e @.',
    })

export const MENSAGEM_CADASTRO = 'Se os dados forem aceitos, enviaremos um e-mail para confirmar o cadastro'
export const MENSAGEM_CADASTRO_CONFIRMADO = 'E-mail confirmado. Aguarde a aprovação do administrador.'

/** POST /publico/cadastro: o login e o e-mail ficam normalizados (minúsculas) como em usuários. */
export const SolicitarCadastroSchema = z.strictObject({
  login: zLogin(),
  nome: zNome(),
  email: z.string().trim().toLowerCase().pipe(zEmail()),
  departamentoId: z.int().positive().max(2_147_483_647).optional(),
})
export type SolicitarCadastro = z.output<typeof SolicitarCadastroSchema>

export const ConfirmarCadastroSchema = z.strictObject({ token: z.string().min(1).max(128) })
export type ConfirmarCadastro = z.output<typeof ConfirmarCadastroSchema>

export const CadastroRespostaSchema = z.object({ mensagem: z.string() })

export const CadastroPendenteSchema = z.object({
  id: z.int(),
  login: z.string(),
  nome: z.string(),
  email: z.string(),
  departamentoId: z.int().nullable(),
  departamento: z.object({ id: z.int(), nome: z.string() }).nullable(),
  confirmadoEm: zDataHora().nullable(),
  criadoEm: zDataHora(),
})
export type CadastroPendente = z.output<typeof CadastroPendenteSchema>

export const ListarCadastrosPendentesQuerySchema = PaginacaoQuerySchema
export type ListarCadastrosPendentesQuery = z.output<typeof ListarCadastrosPendentesQuerySchema>

export const CadastroAprovadoSchema = z.object({ usuarioId: z.int(), login: z.string() })
export type CadastroAprovado = z.output<typeof CadastroAprovadoSchema>

export const cadastroApi = {
  solicitar: contrato({
    metodo: 'POST',
    caminho: '/publico/cadastro',
    body: SolicitarCadastroSchema,
    resposta: CadastroRespostaSchema,
  }),
  confirmar: contrato({
    metodo: 'POST',
    caminho: '/publico/cadastro/confirmar',
    body: ConfirmarCadastroSchema,
    resposta: CadastroRespostaSchema,
  }),
  listar: contrato({
    metodo: 'GET',
    caminho: '/cadastro-pendentes',
    query: ListarCadastrosPendentesQuerySchema,
    resposta: paginaDe(CadastroPendenteSchema),
  }),
  aprovar: contrato({
    metodo: 'POST',
    caminho: '/cadastro-pendentes/:id/aprovar',
    params: IdParamsSchema,
    resposta: CadastroAprovadoSchema,
    status: 201,
  }),
  rejeitar: contrato({
    metodo: 'DELETE',
    caminho: '/cadastro-pendentes/:id',
    params: IdParamsSchema,
    resposta: z.undefined(),
    status: 204,
  }),
}
