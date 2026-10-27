import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { type AtualizarUsuarioGerido, areasGeridasApi } from '@vinimon/shared'
import { chamar } from '@/lib/api'

export const areaGeridaChaves = {
  todas: ['areas-geridas'] as const,
  usuarios: (areaId: number) => ['areas-geridas', 'usuarios', areaId] as const,
}

export const areasGeridasConsultas = {
  usuarios: (areaId: number) =>
    queryOptions({
      queryKey: areaGeridaChaves.usuarios(areaId),
      queryFn: ({ signal }) => chamar(areasGeridasApi.listarUsuarios, { params: { areaId } }, signal),
    }),
}

export function useAtualizarUsuarioGerido(areaId: number, id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: AtualizarUsuarioGerido) =>
      chamar(areasGeridasApi.atualizarUsuario, { params: { areaId, id }, body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: areaGeridaChaves.usuarios(areaId) }),
    meta: { silenciarErro: true }, // o formulário trata (aplicarErrosDoServidor)
  })
}
