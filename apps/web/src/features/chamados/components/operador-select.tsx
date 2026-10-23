import { usuariosApi } from '@vinimon/shared'
import { ComboboxField, type ComboboxOpcao } from '@/components/form/combobox-field'
import { chamar } from '@/lib/api'

export interface OperadorSelectProps {
  operador: { id: number; nome: string } | null
  aoEscolher: (operadorId: number) => void
  desabilitado?: boolean
  id?: string
}

/**
 * Escolha do operador pela busca de usuários (`GET /usuarios/busca`, mínimo de 2 caracteres).
 * A regra "só equipe da área destino" é do servidor (T-5.x); um operador inválido volta como erro no toast.
 * `PresenceIndicator` por opção depende de `usePresenca`, que ainda não existe (T-10.x de presença).
 */
export function OperadorSelect({ operador, aoEscolher, desabilitado, id }: OperadorSelectProps) {
  const atual: ComboboxOpcao[] = operador ? [{ valor: String(operador.id), rotulo: operador.nome }] : []

  async function buscar(termo: string, signal: AbortSignal): Promise<ComboboxOpcao[]> {
    if (termo.trim().length < 2) return []
    const usuarios = await chamar(usuariosApi.buscar, { query: { q: termo.trim() } }, signal)
    return usuarios.map((u) => ({
      valor: String(u.id),
      rotulo: u.nome,
      ...(u.areaNome ? { descricao: u.areaNome } : {}),
    }))
  }

  return (
    <ComboboxField
      id={id}
      valor={operador ? String(operador.id) : null}
      aoMudar={(v) => {
        const novo = v === null ? Number.NaN : Number(v)
        if (Number.isInteger(novo) && novo !== operador?.id) aoEscolher(novo)
      }}
      opcoes={atual}
      buscar={buscar}
      placeholder="Sem operador"
      placeholderBusca="Buscar operador (2+ letras)..."
      textoVazio="Digite ao menos 2 letras."
      desabilitado={desabilitado}
    />
  )
}
