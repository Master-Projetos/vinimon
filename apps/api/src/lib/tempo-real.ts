export type MotivoEncerramento = 'logout' | 'revogada' | 'expirada' | 'usuario_desativado'

export interface PublicadorTempoReal {
  encerrarSessao(sessaoId: string, motivo: MotivoEncerramento): void
  encerrarSessoesDoUsuario(usuarioId: number, motivo: MotivoEncerramento): void
  revalidarUsuario(usuarioId: number): void
  revalidarChamado(chamadoId: number): void
  // emitirAssentamento, emitirChamadoAtualizado, emitirFila, emitirLeitura, emitirNotificacoes, emitirContagem (seção 3.7)
}

const publicadorNulo: PublicadorTempoReal = {
  encerrarSessao: () => undefined,
  encerrarSessoesDoUsuario: () => undefined,
  revalidarUsuario: () => undefined,
  revalidarChamado: () => undefined,
}

export let tempoReal: PublicadorTempoReal = publicadorNulo
export function definirTempoReal(p: PublicadorTempoReal): void {
  tempoReal = p
}
