import { keepPreviousData, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  type AgendarChamado,
  type AssumirChamado,
  ativosApi,
  type CancelarChamado,
  type ChamadoDetalhe,
  type ConcluirChamado,
  type CriarChamado,
  chamadosApi,
  type EncaminharChamado,
  metaApi,
  type ReabrirChamado,
  usuariosApi,
} from '@vinimon/shared'
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

/** Erro de campo (400 com `detalhes`): o diálogo mostra no campo, em vez de só no toast. */
export const temErroDeCampos = (erro: unknown): erro is ErroApi => erro instanceof ErroApi && erro.detalhes.length > 0

/**
 * Uma mutação por ação (§3.5). O diálogo monta o corpo completo, com a `versao` do detalhe que viu.
 * Todas passam por `useAcaoChamado`: sucesso troca o detalhe no cache e invalida listas e contagens.
 */
export const useAssumirChamado = (id: number) =>
  useAcaoChamado(id, (corpo: AssumirChamado) => chamar(chamadosApi.assumir, { params: { id }, body: corpo }))
export const useEncaminharChamado = (id: number) =>
  useAcaoChamado(id, (corpo: EncaminharChamado) => chamar(chamadosApi.encaminhar, { params: { id }, body: corpo }))
export const useAgendarChamado = (id: number) =>
  useAcaoChamado(id, (corpo: AgendarChamado) => chamar(chamadosApi.agendar, { params: { id }, body: corpo }))
export const useConcluirChamado = (id: number) =>
  useAcaoChamado(id, (corpo: ConcluirChamado) => chamar(chamadosApi.concluir, { params: { id }, body: corpo }))
export const useReabrirChamado = (id: number) =>
  useAcaoChamado(id, (corpo: ReabrirChamado) => chamar(chamadosApi.reabrir, { params: { id }, body: corpo }))
export const useCancelarChamado = (id: number) =>
  useAcaoChamado(id, (corpo: CancelarChamado) => chamar(chamadosApi.cancelar, { params: { id }, body: corpo }))

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

/** Abertura de chamado (§5 do plano, T-10.20). Sucesso: invalida listas e contagens; o formulário navega ao detalhe. */
export function useCriarChamado() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (corpo: CriarChamado) => chamar(chamadosApi.criar, { body: corpo }),
    meta: { silenciarErro: true }, // o formulário trata (aplicarErrosDoServidor)
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: chamadoChaves.listas() })
      void queryClient.invalidateQueries({ queryKey: chamadoChaves.contagens() })
    },
  })
}

/** Busca de ativos por etiqueta ou tipo (`GET /ativos/busca`, mínimo de 3 caracteres). */
export const buscarAtivos = (termo: string, signal: AbortSignal) =>
  chamar(ativosApi.buscar, { query: { q: termo.trim() } }, signal)

/** Ativo com a etiqueta exata (vindo de `?equipamento=`). Vazio quando não há correspondência. */
export const ativoPorEtiquetaConsulta = (etiqueta: string) =>
  queryOptions({
    queryKey: [...chamadoChaves.tudo, 'ativo-etiqueta', etiqueta] as const,
    queryFn: async ({ signal }) => {
      const lista = await chamar(ativosApi.buscar, { query: { q: etiqueta } }, signal)
      return lista.find((ativo) => ativo.etiqueta === etiqueta) ?? null
    },
    enabled: etiqueta.trim().length >= 3,
  })

/** Usuários para "Abrir em nome de" (`GET /usuarios/busca`, mínimo de 2 caracteres). */
export const buscarUsuarios = (termo: string, signal: AbortSignal) =>
  chamar(usuariosApi.buscar, { query: { q: termo.trim() } }, signal)
