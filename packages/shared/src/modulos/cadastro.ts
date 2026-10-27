import { z } from 'zod'
import { contrato, IdParamsSchema, PaginacaoQuerySchema, paginaDe, zDataHora, zId } from '../http'
import { zEmail, zNome } from '../limites'
import { UsuarioSchema } from './usuarios'

/** Login normalizado (S14), igual ao do cadastro de usuários. */
const zLoginCadastro = () =>
  z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._@-]{3,64}$/, {
      error: 'Login inválido. Use de 3 a 64 caracteres: letras, números, ponto, hífen, _ e @.',
    })

/** Pedido público de auto-cadastro (A14). O e-mail é normalizado em minúsculas. */
export const CadastroPublicoBodySchema = z.strictObject({
  login: zLoginCadastro(),
  nome: zNome(),
  email: z.string().trim().toLowerCase().pipe(zEmail()),
  departamentoId: zId().optional(),
})
export type CadastroPublicoBody = z.output<typeof CadastroPublicoBodySchema>

export const ConfirmarCadastroBodySchema = z.strictObject({ token: z.string().min(1).max(128) })
export type ConfirmarCadastroBody = z.output<typeof ConfirmarCadastroBodySchema>

/** Resposta de POST /publico/cadastro: a mesma mensagem para qualquer pedido válido (nunca revela cadastros). */
export const CadastroRespostaSchema = z.object({ mensagem: z.string() })

export const CadastroPendenteSchema = z.object({
  id: z.int(),
  login: z.string(),
  nome: z.string(),
  email: z.string(),
  departamentoId: z.int().nullable(),
  confirmadoEm: zDataHora().nullable(),
  criadoEm: zDataHora(),
})
export type CadastroPendente = z.output<typeof CadastroPendenteSchema>

export const ListarCadastrosQuerySchema = PaginacaoQuerySchema
export type ListarCadastrosQuery = z.output<typeof ListarCadastrosQuerySchema>

export const cadastroApi = {
  solicitar: contrato({
    metodo: 'POST',
    caminho: '/publico/cadastro',
    body: CadastroPublicoBodySchema,
    resposta: CadastroRespostaSchema,
  }),
  confirmar: contrato({
    metodo: 'POST',
    caminho: '/publico/cadastro/confirmar',
    body: ConfirmarCadastroBodySchema,
    resposta: z.undefined(),
    status: 204,
  }),
  listar: contrato({
    metodo: 'GET',
    caminho: '/cadastros',
    query: ListarCadastrosQuerySchema,
    resposta: paginaDe(CadastroPendenteSchema),
  }),
  aprovar: contrato({
    metodo: 'POST',
    caminho: '/cadastros/:id/aprovar',
    params: IdParamsSchema,
    resposta: UsuarioSchema,
  }),
}
