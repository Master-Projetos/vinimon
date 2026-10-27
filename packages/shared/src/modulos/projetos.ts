import { z } from 'zod'
import { TIPOS_STATUS, type TipoStatus } from '../enums'
import { contrato, IdParamsSchema, zDataHora } from '../http'

/** Níveis da árvore de subchamados, contando o chamado raiz como o nível 1 (T-20.1). */
export const NIVEIS_PROJETO = 5

/** Nó da árvore: um chamado visível para quem consulta, com os subchamados visíveis dele. */
export interface NoArvore {
  id: number
  assunto: string
  statusTipo: TipoStatus
  filhos: NoArvore[]
}

export const NoArvoreSchema: z.ZodType<NoArvore> = z.object({
  id: z.int(),
  assunto: z.string(),
  statusTipo: z.enum(TIPOS_STATUS),
  filhos: z.lazy(() => z.array(NoArvoreSchema)),
})

export const ProjetoSchema = z.object({
  id: z.int(),
  nome: z.string(),
  descricao: z.string().nullable(),
  chamadoRaizId: z.int(),
  criadoEm: zDataHora(),
  /** O chamado raiz com a árvore de subchamados visíveis para quem consulta. */
  arvore: NoArvoreSchema,
})
export type Projeto = z.output<typeof ProjetoSchema>

export const projetosApi = {
  obter: contrato({ metodo: 'GET', caminho: '/projetos/:id', params: IdParamsSchema, resposta: ProjetoSchema }),
}
