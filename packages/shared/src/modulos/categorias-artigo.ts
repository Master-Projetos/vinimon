import { z } from 'zod'
import { contrato, IdParamsSchema, PaginacaoQuerySchema, paginaDe } from '../http'

export const CategoriaArtigoSchema = z.object({
  id: z.int(),
  nome: z.string(),
  ordem: z.int(),
  ativo: z.boolean(),
})
export type CategoriaArtigo = z.output<typeof CategoriaArtigoSchema>

export const CriarCategoriaArtigoSchema = z.strictObject({
  nome: z.string().trim().min(2, 'Informe ao menos 2 caracteres.').max(100, 'Use no máximo 100 caracteres.'),
  ordem: z.int().min(0, 'Use um valor entre 0 e 1000.').max(1000, 'Use um valor entre 0 e 1000.'),
  ativo: z.boolean(),
})
export type CriarCategoriaArtigo = z.output<typeof CriarCategoriaArtigoSchema>

export const AtualizarCategoriaArtigoSchema = CriarCategoriaArtigoSchema.partial().refine(
  (d) => Object.values(d).some((v) => v !== undefined),
  'Informe ao menos um campo.',
)
export type AtualizarCategoriaArtigo = z.output<typeof AtualizarCategoriaArtigoSchema>

export const ListarCategoriasArtigoQuerySchema = PaginacaoQuerySchema.extend({
  busca: z.string().trim().max(100).optional(),
  ativo: z.stringbool().optional(),
})
export type ListarCategoriasArtigoQuery = z.output<typeof ListarCategoriasArtigoQuerySchema>

export const categoriasArtigoApi = {
  listar: contrato({
    metodo: 'GET',
    caminho: '/categorias-artigo',
    query: ListarCategoriasArtigoQuerySchema,
    resposta: paginaDe(CategoriaArtigoSchema),
  }),
  obter: contrato({
    metodo: 'GET',
    caminho: '/categorias-artigo/:id',
    params: IdParamsSchema,
    resposta: CategoriaArtigoSchema,
  }),
  criar: contrato({
    metodo: 'POST',
    caminho: '/categorias-artigo',
    body: CriarCategoriaArtigoSchema,
    resposta: CategoriaArtigoSchema,
    status: 201,
  }),
  atualizar: contrato({
    metodo: 'PATCH',
    caminho: '/categorias-artigo/:id',
    params: IdParamsSchema,
    body: AtualizarCategoriaArtigoSchema,
    resposta: CategoriaArtigoSchema,
  }),
  excluir: contrato({
    metodo: 'DELETE',
    caminho: '/categorias-artigo/:id',
    params: IdParamsSchema,
    resposta: z.undefined(),
    status: 204,
  }),
}
