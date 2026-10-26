import { z } from 'zod'
import { contrato, zId } from '../http'
import { zTelefone } from '../limites'

export const AreaGeridaParamsSchema = z.object({ areaId: zId() })
export const UsuarioGeridoParamsSchema = z.object({ areaId: zId(), id: zId() })

/** Só o que o gerente precisa ver: nada de login, e-mail nem dados de acesso. */
export const UsuarioGeridoSchema = z.object({
  id: z.int(),
  nome: z.string(),
  telefone: z.string().nullable(),
  departamentoId: z.int().nullable(),
  ativo: z.boolean(),
})
export type UsuarioGerido = z.output<typeof UsuarioGeridoSchema>

export const AtualizarUsuarioGeridoSchema = z
  .strictObject({
    telefone: zTelefone().nullable().optional(),
    departamentoId: z.int().positive().max(2_147_483_647).nullable().optional(),
    ativo: z.boolean().optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), 'Informe ao menos um campo.')
export type AtualizarUsuarioGerido = z.output<typeof AtualizarUsuarioGeridoSchema>

export const areasGeridasApi = {
  listarUsuarios: contrato({
    metodo: 'GET',
    caminho: '/areas-geridas/:areaId/usuarios',
    params: AreaGeridaParamsSchema,
    resposta: z.array(UsuarioGeridoSchema),
  }),
  atualizarUsuario: contrato({
    metodo: 'PATCH',
    caminho: '/areas-geridas/:areaId/usuarios/:id',
    params: UsuarioGeridoParamsSchema,
    body: AtualizarUsuarioGeridoSchema,
    resposta: UsuarioGeridoSchema,
  }),
}
