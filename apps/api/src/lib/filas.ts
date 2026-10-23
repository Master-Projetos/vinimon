// Porta de filas (§3.10). O padrão é a memória; o adaptador do pg-boss entra na T-7.6 e chama `definirFila`.

/** Mesmos nomes do `SendOptions` do pg-boss 12.38: o adaptador repassa sem mudança. */
export interface OpcoesFila {
  startAfter?: number
  singletonKey?: string
  retryLimit?: number
  retryBackoff?: boolean
}

export interface Filas {
  enviar(fila: string, dados: object, opcoes?: OpcoesFila): Promise<void>
}

export interface EnvioEnfileirado {
  fila: string
  dados: object
  opcoes: OpcoesFila | undefined
}

/** Guarda as chamadas em `enviados`, para os testes conferirem o que foi enfileirado. */
export const filasEmMemoria: Filas & { enviados: EnvioEnfileirado[] } = {
  enviados: [],
  async enviar(fila, dados, opcoes) {
    this.enviados.push({ fila, dados, opcoes })
  },
}

let atual: Filas = filasEmMemoria

export function definirFila(impl: Filas): void {
  atual = impl
}

export function enfileirar(fila: string, dados: object, opcoes?: OpcoesFila): Promise<void> {
  return opcoes === undefined ? atual.enviar(fila, dados) : atual.enviar(fila, dados, opcoes)
}

export function limparFilaMemoria(): void {
  filasEmMemoria.enviados.length = 0
}
