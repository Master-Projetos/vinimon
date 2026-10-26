import type { Leitura } from '@vinimon/shared'

export interface ReadReceiptProps {
  leituras: Leitura[]
  usuarioId: number
  /** Último assentamento confirmado da conversa. */
  ultimoId: number | null
}

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? nome

/** "Visto por Ana, João +2": quem já leu até a última mensagem (sem o próprio usuário). */
export function ReadReceipt({ leituras, usuarioId, ultimoId }: ReadReceiptProps) {
  if (ultimoId === null) return null
  const vistos = leituras.filter((l) => l.usuario.id !== usuarioId && l.ultimoAssentamentoId >= ultimoId)
  if (vistos.length === 0) return null
  const nomes = vistos.slice(0, 2).map((l) => primeiroNome(l.usuario.nome))
  const resto = vistos.length - nomes.length
  return (
    <p className="px-1 text-right text-xs text-muted-foreground">
      Visto por {nomes.join(', ')}
      {resto > 0 ? ` +${resto}` : ''}
    </p>
  )
}
