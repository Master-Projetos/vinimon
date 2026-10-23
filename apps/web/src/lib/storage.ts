/**
 * Único ponto de acesso ao localStorage do front (S80). Só tema, densidade, recentes, colunas, painel e rascunho.
 * Chaves de dados do usuário levam o id: `u<id>:recentes`, `u<id>:rascunho:novo-chamado` (gravadas como `vinimon:u<id>:...`).
 */
const PREFIXO = 'vinimon:'

export function ler<T>(chave: string, padrao: T): T {
  try {
    const bruto = localStorage.getItem(PREFIXO + chave)
    if (bruto === null) return padrao
    return JSON.parse(bruto) as T
  } catch {
    return padrao
  }
}

export function gravar(chave: string, valor: unknown): void {
  try {
    localStorage.setItem(PREFIXO + chave, JSON.stringify(valor))
  } catch {
    // Armazenamento cheio ou bloqueado: a preferência não é persistida, sem quebrar a tela.
  }
}

export function remover(chave: string): void {
  try {
    localStorage.removeItem(PREFIXO + chave)
  } catch {
    // Armazenamento bloqueado: nada a remover.
  }
}

/** Remove todas as chaves de dados do usuário (`vinimon:u*`), mantendo tema e densidade. Chamado no logout (S80). */
export function limparDadosDoUsuario(): void {
  try {
    const chaves: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const chave = localStorage.key(i)
      if (chave?.startsWith(`${PREFIXO}u`)) chaves.push(chave)
    }
    for (const chave of chaves) localStorage.removeItem(chave)
  } catch {
    // Armazenamento bloqueado: nada a limpar.
  }
}
