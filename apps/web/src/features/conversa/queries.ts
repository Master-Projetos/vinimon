import {
  type InfiniteData,
  infiniteQueryOptions,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { assentamentosApi, contrato, IdParamsSchema, PERFIS } from '@vinimon/shared'
import { toast } from 'sonner'
import { z } from 'zod'
import { chamar, enviarArquivo } from '@/lib/api'
import {
  atualizarItem,
  type ItemConversa,
  mesclarAssentamento,
  type PaginaConversa,
  removerPendente,
  temPendente,
} from './cache'

/** Mensagens por página (a API devolve a mais recente primeiro, em ordem crescente dentro da página). */
export const LIMITE_CONVERSA = 50

export const conversaChaves = {
  todas: ['conversa'] as const,
  lista: (chamadoId: number) => ['conversa', chamadoId] as const,
  mencionaveis: (chamadoId: number, q: string, interno: boolean) =>
    ['conversa', chamadoId, 'mencionaveis', q, interno] as const,
}

export const conversaConsultas = {
  /** `pageParam` é o `antesDe` (id mais antigo da página já carregada); a primeira página não tem. */
  lista: (chamadoId: number) =>
    infiniteQueryOptions({
      queryKey: conversaChaves.lista(chamadoId),
      initialPageParam: undefined as number | undefined,
      queryFn: async ({ pageParam, signal }): Promise<PaginaConversa> =>
        chamar(
          assentamentosApi.listar,
          { params: { id: chamadoId }, query: { antesDe: pageParam, limite: LIMITE_CONVERSA } },
          signal,
        ),
      getNextPageParam: (pagina) => pagina.proximoCursor ?? undefined,
    }),
}

/**
 * `GET /chamados/:id/mencionaveis` (T-6.2) não tem contrato no shared: este espelha a rota da API
 * (até 8 pessoas, sem o próprio usuário; `interno` restringe a quem vê as notas internas).
 */
export const MencionavelSchema = z.object({ id: z.int(), nome: z.string(), perfil: z.enum(PERFIS) })
export type Mencionavel = z.output<typeof MencionavelSchema>
export const mencionaveisApi = {
  listar: contrato({
    metodo: 'GET',
    caminho: '/chamados/:id/mencionaveis',
    params: IdParamsSchema,
    query: z.object({ q: z.string().max(80).optional(), interno: z.boolean().optional() }),
    resposta: z.array(MencionavelSchema),
  }),
}

export const mencionaveisConsulta = (chamadoId: number, q: string, interno: boolean) =>
  queryOptions({
    queryKey: conversaChaves.mencionaveis(chamadoId, q, interno),
    queryFn: ({ signal }) =>
      chamar(mencionaveisApi.listar, { params: { id: chamadoId }, query: { q, interno } }, signal),
    staleTime: 30_000,
  })

export function useMencionaveis(chamadoId: number, q: string, interno: boolean, ativo: boolean) {
  return useQuery({ ...mencionaveisConsulta(chamadoId, q, interno), enabled: ativo })
}

export interface EnvioConversa {
  texto: string
  interno: boolean
  arquivos: File[]
  /** Reenvio: o mesmo `clienteId` da tentativa anterior (o servidor não duplica). */
  clienteId?: string
}

type Cache = InfiniteData<PaginaConversa, number | undefined>

/**
 * Envio otimista de comentário: a mensagem aparece na hora como pendente, vira a confirmada quando o servidor
 * responde (mesclada pelo `clienteId`) e, se falhar, fica "Não enviada" com Tentar novamente e Descartar.
 * Os anexos vão depois do comentário, com o `assentamentoId` devolvido e o mesmo `interno`.
 */
export function useEnviarComentario(chamadoId: number, autor: { id: number; nome: string }) {
  const qc = useQueryClient()
  const chave = conversaChaves.lista(chamadoId)

  const alterar = (fn: (paginas: PaginaConversa[]) => PaginaConversa[]) =>
    qc.setQueryData<Cache>(chave, (d) => (d ? { ...d, pages: fn(d.pages) } : d))

  const mutacao = useMutation({
    mutationFn: async (envio: EnvioConversa) => {
      const clienteId = envio.clienteId ?? crypto.randomUUID()
      const ehPendente = (i: ItemConversa) => i.estado !== undefined && i.clienteId === clienteId
      const cache = qc.getQueryData<Cache>(chave)
      if (cache && temPendente(cache.pages, clienteId)) {
        alterar((p) => atualizarItem(p, ehPendente, { estado: 'enviando', erro: undefined, progresso: undefined }))
      } else {
        alterar((p) =>
          mesclarAssentamento(p, {
            id: -Date.now(),
            chamadoId,
            tipo: 'COMENTARIO',
            interno: envio.interno,
            texto: envio.texto,
            evento: null,
            dados: null,
            autor,
            criadoEm: new Date(),
            clienteId,
            estado: 'enviando',
            arquivos: envio.arquivos,
          }),
        )
      }

      let resposta: Awaited<ReturnType<typeof chamar<typeof assentamentosApi.comentar>>>
      try {
        resposta = await chamar(assentamentosApi.comentar, {
          params: { id: chamadoId },
          body: { texto: envio.texto, interno: envio.interno, clienteId },
        })
      } catch (erro) {
        alterar((p) =>
          atualizarItem(p, ehPendente, {
            estado: 'falhou',
            erro: erro instanceof Error ? erro.message : 'Não foi possível enviar.',
          }),
        )
        throw erro
      }

      const { assentamento, mencoesIgnoradas } = resposta
      const comAnexos = envio.arquivos.length > 0
      alterar((p) =>
        mesclarAssentamento(p, comAnexos ? { ...assentamento, estado: 'enviando', progresso: 0 } : assentamento),
      )
      for (const pessoa of mencoesIgnoradas) toast.error(`${pessoa.nome} não tem acesso a este chamado`)

      if (comAnexos) {
        const doComentario = (i: ItemConversa) => i.id === assentamento.id
        try {
          await enviarArquivo(
            `/chamados/${chamadoId}/anexos`,
            envio.arquivos,
            { interno: String(envio.interno), assentamentoId: String(assentamento.id) },
            (progresso) => alterar((p) => atualizarItem(p, doComentario, { progresso })),
          )
          await qc.invalidateQueries({ queryKey: ['anexos', chamadoId] })
        } catch (erro) {
          toast.error(erro instanceof Error ? erro.message : 'Não foi possível enviar os anexos.')
        } finally {
          alterar((p) => atualizarItem(p, doComentario, { estado: undefined, progresso: undefined }))
        }
      }
      return assentamento
    },
    meta: { silenciarErro: true }, // o estado "Não enviada" já mostra o erro na própria mensagem
  })

  return {
    enviar: (envio: EnvioConversa) => mutacao.mutateAsync(envio).catch(() => undefined),
    descartar: (clienteId: string) => alterar((p) => removerPendente(p, clienteId)),
  }
}
