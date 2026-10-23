// Nomes das salas do Socket.IO (§3.7). Só o servidor coloca sockets em salas.
export const salaUsuario = (usuarioId: number) => `usuario:${usuarioId}`
export const salaSessao = (sessaoId: string) => `sessao:${sessaoId}`
export const salaArea = (areaId: number) => `area:${areaId}`
export const SALA_ADMINS = 'admins'
export const salaChamado = (chamadoId: number) => `chamado:${chamadoId}`
export const salaChamadoInterno = (chamadoId: number) => `chamado:${chamadoId}:interno`
export const salaPresenca = (usuarioId: number) => `presenca:${usuarioId}`
