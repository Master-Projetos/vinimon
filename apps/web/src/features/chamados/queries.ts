import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { chamadosApi } from '@vinimon/shared'
import { chamar } from '@/lib/api'
import type { FiltrosChamado } from './filtros'

export const chamadoChaves = {
  tudo: ['chamados'] as const,
  listas: () => [...chamadoChaves.tudo, 'lista'] as const,
  lista: (filtros: FiltrosChamado) => [...chamadoChaves.listas(), filtros] as const,
  contagens: () => [...chamadoChaves.tudo, 'contagens'] as const,
  detalhe: (id: number) => [...chamadoChaves.tudo, 'detalhe', id] as const,
}

export const chamadosConsultas = {
  lista: (filtros: FiltrosChamado) =>
    queryOptions({
      queryKey: chamadoChaves.lista(filtros),
      queryFn: ({ signal }) => chamar(chamadosApi.listar, { query: filtros }, signal),
      placeholderData: keepPreviousData,
    }),
  contagens: () =>
    queryOptions({
      queryKey: chamadoChaves.contagens(),
      queryFn: ({ signal }) => chamar(chamadosApi.contagens, {}, signal),
      staleTime: 30_000,
    }),
  detalhe: (id: number) =>
    queryOptions({
      queryKey: chamadoChaves.detalhe(id),
      queryFn: ({ signal }) => chamar(chamadosApi.obter, { params: { id } }, signal),
    }),
}
