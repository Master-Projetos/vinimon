import { z } from 'zod'
import { contrato, IdParamsSchema, zDataHora, zId } from '../http'

export const MarcarLeituraSchema = z.strictObject({ assentamentoId: zId() })
export type MarcarLeitura = z.output<typeof MarcarLeituraSchema>

export const LeituraMarcadaSchema = z.object({ ultimoAssentamentoLidoId: z.int() })
export type LeituraMarcada = z.output<typeof LeituraMarcadaSchema>

export const LeituraSchema = z.object({
  usuario: z.object({ id: z.int(), nome: z.string() }),
  /** Para quem não vê o interno, o maior id público menor ou igual ao ponteiro real. */
  ultimoAssentamentoId: z.int(),
  lidoEm: zDataHora(),
})
export type Leitura = z.output<typeof LeituraSchema>

export const leiturasApi = {
  marcar: contrato({
    metodo: 'POST',
    caminho: '/chamados/:id/leitura',
    params: IdParamsSchema,
    body: MarcarLeituraSchema,
    resposta: LeituraMarcadaSchema,
  }),
  listar: contrato({
    metodo: 'GET',
    caminho: '/chamados/:id/leituras',
    params: IdParamsSchema,
    resposta: z.array(LeituraSchema),
  }),
}
