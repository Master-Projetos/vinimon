import { z } from 'zod'
import { contrato, IdParamsSchema, PaginacaoQuerySchema, paginaDe } from '../http'

const zGrupo = () => z.int().min(1, 'Use um grupo de 1 a 3.').max(3, 'Use um grupo de 1 a 3.')

export const CategoriaSchema = z.object({
  id: z.int(),
  grupo: z.int(),
  nome: z.string(),
  ativo: z.boolean(),
})
export type Categoria = z.output<typeof CategoriaSchema>

export const CriarCategoriaSchema = z.strictObject({
  grupo: zGrupo(),
  nome: z.string().trim().min(2, 'Informe ao menos 2 caracteres.').max(120, 'Use no máximo 120 caracteres.'),
  ativo: z.boolean(),
})
export type CriarCategoria = z.output<typeof CriarCategoriaSchema>

/** O grupo não muda depois de criada: os problemas já ligados dependem dele. */
export const AtualizarCategoriaSchema = CriarCategoriaSchema.omit({ grupo: true })
  .partial()
  .refine((d) => Object.values(d).some((v) => v !== undefined), 'Informe ao menos um campo.')
export type AtualizarCategoria = z.output<typeof AtualizarCategoriaSchema>

export const ListarCategoriasQuerySchema = PaginacaoQuerySchema.extend({
  busca: z.string().trim().max(100).optional(),
  grupo: z.coerce.number().pipe(zGrupo()).optional(),
  ativo: z.stringbool().optional(),
})
export type ListarCategoriasQuery = z.output<typeof ListarCategoriasQuerySchema>

export const categoriasApi = {
  listar: contrato({
    metodo: 'GET',
    caminho: '/categorias',
    query: ListarCategoriasQuerySchema,
    resposta: paginaDe(CategoriaSchema),
  }),
  obter: contrato({ metodo: 'GET', caminho: '/categorias/:id', params: IdParamsSchema, resposta: CategoriaSchema }),
  criar: contrato({
    metodo: 'POST',
    caminho: '/categorias',
    body: CriarCategoriaSchema,
    resposta: CategoriaSchema,
    status: 201,
  }),
  atualizar: contrato({
    metodo: 'PATCH',
    caminho: '/categorias/:id',
    params: IdParamsSchema,
    body: AtualizarCategoriaSchema,
    resposta: CategoriaSchema,
  }),
  excluir: contrato({
    metodo: 'DELETE',
    caminho: '/categorias/:id',
    params: IdParamsSchema,
    resposta: z.undefined(),
    status: 204,
  }),
}
