import { z } from 'zod'
import { CHAVES_CONFIG_PUBLICAS, ConfigSchema } from '../config'
import { PAPEIS_STATUS, TIPOS_STATUS } from '../enums'
import { contrato } from '../http'

const ItemNomeSchema = z.object({ id: z.int(), nome: z.string() })

/** Só as chaves de CHAVES_CONFIG_PUBLICAS (fonte única): nenhuma outra configuração sai no /meta. */
export const ConfigPublicaSchema = z.object(
  Object.fromEntries(CHAVES_CONFIG_PUBLICAS.map((chave) => [chave, ConfigSchema.shape[chave]])),
)

/** Catálogos de apoio ao front (somente itens ativos). `tags` só vem para quem tem `chamado.atender`. */
export const MetaSchema = z.object({
  areas: z.array(z.object({ id: z.int(), nome: z.string(), atende: z.boolean() })),
  prioridades: z.array(
    z.object({ id: z.int(), nome: z.string(), cor: z.string(), ordem: z.int(), padrao: z.boolean() }),
  ),
  status: z.array(
    z.object({
      id: z.int(),
      nome: z.string(),
      tipo: z.enum(TIPOS_STATUS),
      papel: z.enum(PAPEIS_STATUS).nullable(),
      cor: z.string(),
      ignorado: z.boolean(),
    }),
  ),
  problemas: z.array(
    z.object({
      id: z.int(),
      nome: z.string(),
      descricao: z.string().nullable(),
      areaPadraoId: z.int().nullable(),
      areaIds: z.array(z.int()),
    }),
  ),
  canais: z.array(ItemNomeSchema),
  departamentos: z.array(z.object({ id: z.int(), nome: z.string(), unidadeId: z.int() })),
  unidades: z.array(ItemNomeSchema),
  tiposAtivo: z.array(ItemNomeSchema),
  jornadas: z.array(ItemNomeSchema),
  categorias: z.array(ItemNomeSchema),
  config: ConfigPublicaSchema,
  tags: z.array(ItemNomeSchema).optional(),
})
export type Meta = z.output<typeof MetaSchema>

export const metaApi = {
  obter: contrato({ metodo: 'GET', caminho: '/meta', resposta: MetaSchema }),
}
