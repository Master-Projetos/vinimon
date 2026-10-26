import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { MODOS_AREA_PAINEL, type PainelQuery, painelApi, zId } from '@vinimon/shared'
import { z } from 'zod'
import { chamar } from '@/lib/api'

/** Filtros de /painel na URL: `?periodo=&area=&modo=`. Sem defaults, para a URL ficar curta. */
export const PainelBuscaSchema = z.object({
  periodo: z
    .union([z.literal(7), z.literal(30), z.literal(90)])
    .optional()
    .catch(undefined),
  area: zId().optional().catch(undefined),
  modo: z.enum(MODOS_AREA_PAINEL).optional().catch(undefined),
})
export type PainelBusca = z.output<typeof PainelBuscaSchema>

export function consultaDe(busca: PainelBusca): Partial<PainelQuery> {
  return { periodo: busca.periodo, areaId: busca.area, modoArea: busca.modo }
}

export const painelChaves = {
  tudo: ['painel'] as const,
  obter: (busca: PainelBusca) => ['painel', busca] as const,
}

export const painelConsultas = {
  obter: (busca: PainelBusca) =>
    queryOptions({
      queryKey: painelChaves.obter(busca),
      queryFn: ({ signal }) => chamar(painelApi.obter, { query: consultaDe(busca) }, signal),
      placeholderData: keepPreviousData,
    }),
}
