import { enviarArquivo } from '@/lib/api'

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
