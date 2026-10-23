import { keepPreviousData, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { type ChamadoDetalhe, chamadosApi, metaApi } from '@vinimon/shared'
import { toast } from 'sonner'
import { chamar, ErroApi } from '@/lib/api'
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

/** Catálogos de apoio (status, prioridades, áreas...). Mudam raramente, então o cache é longo. */
export const metaConsulta = () =>
  queryOptions({
    queryKey: ['meta'] as const,
    queryFn: ({ signal }) => chamar(metaApi.obter, {}, signal),
    staleTime: 300_000,
  })

export const MENSAGEM_CONFLITO_VERSAO = 'O chamado foi alterado por outra pessoa. Recarregue.'

/**
 * Mutação de uma ação do chamado (§3.5). `executar` monta o corpo com a `versao` que o cliente viu.
 * Sucesso: troca o detalhe no cache e invalida listas e contagens. Erro 409 (versão): avisa para recarregar
 * e já busca o detalhe de novo. Outros erros mostram a mensagem do servidor.
 */
export function useAcaoChamado<V>(id: number, executar: (variaveis: V) => Promise<ChamadoDetalhe>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: executar,
    meta: { silenciarErro: true },
    onSuccess: (novo) => {
      queryClient.setQueryData(chamadoChaves.detalhe(id), novo)
      void queryClient.invalidateQueries({ queryKey: chamadoChaves.listas() })
      void queryClient.invalidateQueries({ queryKey: chamadoChaves.contagens() })
    },
    onError: (erro) => {
      const recarregar = () => void queryClient.invalidateQueries({ queryKey: chamadoChaves.detalhe(id) })
      if (erro instanceof ErroApi && erro.status === 409 && erro.codigo === 'CONFLITO') {
        toast.error(MENSAGEM_CONFLITO_VERSAO, { action: { label: 'Recarregar', onClick: recarregar } })
        recarregar()
        return
      }
      toast.error('Não foi possível concluir a ação', { description: erro.message })
    },
  })
}

/** Seguir e deixar de seguir (sem `versao`): atualiza `seguindo` no detalhe em cache. */
export function useSeguirChamado(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (seguir: boolean) =>
      seguir ? chamar(chamadosApi.seguir, { params: { id } }) : chamar(chamadosApi.deixarDeSeguir, { params: { id } }),
    meta: { silenciarErro: true },
    onSuccess: (_resultado, seguir) => {
      queryClient.setQueryData(chamadoChaves.detalhe(id), (atual: ChamadoDetalhe | undefined) =>
        atual ? { ...atual, seguindo: seguir } : atual,
      )
    },
    onError: (erro) => {
      toast.error('Não foi possível alterar o acompanhamento', { description: erro.message })
    },
  })
}
