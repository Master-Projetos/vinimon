export type MotivoEncerramento = 'logout' | 'revogada' | 'expirada' | 'usuario_desativado'

/** Campos de `chamado:atualizado` (§3.7): só invalidam cache no cliente. */
export type CampoChamado =
  | 'status'
  | 'prioridade'
  | 'area'
  | 'operador'
  | 'agendamento'
  | 'anexos'
  | 'tags'
  | 'classificacao'
  | 'avaliacao'

/** Motivos de `fila:atualizada` (§3.7). Nunca por evento com `interno=true`. */
export type MotivoFila = 'criado' | 'atribuido' | 'status' | 'encaminhado' | 'prioridade'

export interface PublicadorTempoReal {
  encerrarSessao(sessaoId: string, motivo: MotivoEncerramento): void
  encerrarSessoesDoUsuario(usuarioId: number, motivo: MotivoEncerramento): void
  revalidarUsuario(usuarioId: number): void
  revalidarChamado(chamadoId: number): void
  /** `assentamento:novo`: o servidor lê cada assentamento e manda o interno só para a sala interna. */
  emitirAssentamentos(chamadoId: number, assentamentoIds: readonly number[]): void
  /** `chamado:atualizado`. Com `apenasInterno`, só a sala `chamado:<id>:interno` recebe (S49, S93). */
  emitirChamadoAtualizado(chamadoId: number, campos: readonly CampoChamado[], apenasInterno: boolean): void
  emitirFila(chamadoId: number, motivo: MotivoFila): void
  emitirLeitura(chamadoId: number, usuarioId: number, ultimoAssentamentoId: number, lidoEm: Date): void
  emitirNotificacoes(itens: ReadonlyArray<{ usuarioId: number; notificacaoId: number }>): void
  emitirContagem(usuarioId: number, naoLidas: number): void
}

const publicadorNulo: PublicadorTempoReal = {
  encerrarSessao: () => undefined,
  encerrarSessoesDoUsuario: () => undefined,
  revalidarUsuario: () => undefined,
  revalidarChamado: () => undefined,
  emitirAssentamentos: () => undefined,
  emitirChamadoAtualizado: () => undefined,
  emitirFila: () => undefined,
  emitirLeitura: () => undefined,
  emitirNotificacoes: () => undefined,
  emitirContagem: () => undefined,
}

export let tempoReal: PublicadorTempoReal = publicadorNulo
export function definirTempoReal(p: PublicadorTempoReal): void {
  tempoReal = p
}
