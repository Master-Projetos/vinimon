/** Tempo sem entrada do usuário para a presença passar a "ausente por inatividade" (§3.7). */
export const OCIOSO_MS = 5 * 60_000

/** Chaves de cache da presença. A leitura por usuário (`usePresenca(ids)`) chega na T-10.14. */
export const presencaChaves = { tudo: ['presenca'] as const }
