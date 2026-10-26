import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { relatoriosApi, type TipoRelatorio, zId } from '@vinimon/shared'
import { z } from 'zod'
import { chamar } from '@/lib/api'

/** Filtros de /relatorios/:relatorio na URL. Validação de intervalo fica no formulário e na API. */
export const RelatorioBuscaSchema = z.object({
  de: z.iso.date().optional(),
  ate: z.iso.date().optional(),
  areaId: zId().optional(),
  operadorId: zId().optional(),
})
export type RelatorioBusca = z.output<typeof RelatorioBuscaSchema>

export const ROTULOS_RELATORIO: Record<TipoRelatorio, string> = {
  'visao-geral': 'Visão geral',
  'por-status': 'Por status',
  'por-area': 'Por área',
  'por-problema': 'Por problema',
  'por-operador': 'Por operador',
  'por-solicitante': 'Por solicitante',
  sla: 'SLA',
  avaliacoes: 'Avaliações',
}

export const relatorioChaves = {
  tudo: ['relatorios'] as const,
  um: (tipo: TipoRelatorio, busca: RelatorioBusca) => ['relatorios', tipo, busca] as const,
}

export const relatorioConsultas = {
  obter: (tipo: TipoRelatorio, busca: RelatorioBusca) =>
    queryOptions({
      queryKey: relatorioChaves.um(tipo, busca),
      queryFn: ({ signal }) => chamar(relatoriosApi.obter, { params: { tipo }, query: busca }, signal),
      placeholderData: keepPreviousData,
    }),
}

/**
 * Link do CSV: mesmo caminho e mesmos filtros do relatório na tela. É um link de download (navegação), não uma
 * chamada de API feita pelo código; por isso a URL é montada aqui a partir do contrato de `relatoriosApi.csv`.
 */
export function urlCsvRelatorio(tipo: TipoRelatorio, busca: RelatorioBusca): string {
  const qs = new URLSearchParams()
  for (const [chave, valor] of Object.entries(busca)) if (valor !== undefined) qs.set(chave, String(valor))
  const texto = qs.toString()
  return `/api/v1${relatoriosApi.csv.caminho.replace(':tipo', tipo)}${texto ? `?${texto}` : ''}`
}
