import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { anexosApi } from '@vinimon/shared'
import { chamar, enviarArquivo } from '@/lib/api'

export const anexoChaves = { lista: (chamadoId: number) => ['anexos', chamadoId] as const }

export const anexosConsultas = {
  lista: (chamadoId: number) =>
    queryOptions({
      queryKey: anexoChaves.lista(chamadoId),
      queryFn: ({ signal }) => chamar(anexosApi.listar, { params: { id: chamadoId } }, signal),
    }),
}

/** Tipos com prévia: só imagens raster (S70); PDF e o resto apenas baixam. */
export const MIMES_COM_PREVIA: readonly string[] = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

/** Sobe vários arquivos de uma vez na aba Anexos, com progresso. Os campos de texto vão antes dos arquivos. */
export function useEnviarAnexos(chamadoId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      arquivos,
      interno,
      aoProgresso,
    }: {
      arquivos: File[]
      interno: boolean
      aoProgresso: (pct: number) => void
    }) => enviarArquivo(`/chamados/${chamadoId}/anexos`, arquivos, { interno: String(interno) }, aoProgresso),
    onSettled: () => queryClient.invalidateQueries({ queryKey: anexoChaves.lista(chamadoId) }),
  })
}

export function useExcluirAnexo(chamadoId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => chamar(anexosApi.excluir, { params: { id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: anexoChaves.lista(chamadoId) }),
  })
}

/**
 * Sobe os arquivos de um chamado recém-criado, um de cada vez (o progresso é do arquivo em andamento).
 * Devolve quantos falharam, sem interromper os demais.
 */
export async function enviarAnexosEmSequencia(
  chamadoId: number,
  arquivos: File[],
  aoProgresso: (indice: number, pct: number) => void,
): Promise<number> {
  let falhas = 0
  for (const [indice, arquivo] of arquivos.entries()) {
    aoProgresso(indice, 0)
    try {
      await enviarArquivo(`/chamados/${chamadoId}/anexos`, [arquivo], { interno: 'false' }, (pct) =>
        aoProgresso(indice, pct),
      )
    } catch {
      falhas += 1
    }
  }
  return falhas
}

export function mensagemDeFalhaDeAnexos(falhas: number): string {
  return falhas === 1
    ? '1 anexo não foi enviado — reenvie na aba Anexos'
    : `${falhas} anexos não foram enviados — reenvie na aba Anexos`
}
