import { usuariosApi } from '@vinimon/shared'
import { useRef } from 'react'
import { ComboboxField, type ComboboxOpcao } from '@/components/form/combobox-field'
import { chamar } from '@/lib/api'

export interface OperadorSelectProps {
  operador: { id: number; nome: string } | null
  /** Recebe também o nome (da última busca), para o diálogo mostrar a escolha. */
  aoEscolher: (operadorId: number, nome: string) => void
  desabilitado?: boolean
  id?: string
}

/**
 * Escolha do operador pela busca de usuários (`GET /usuarios/busca`, mínimo de 2 caracteres).
 * A regra "só equipe da área destino" é do servidor (T-5.x); um operador inválido volta como erro no toast.
 * `PresenceIndicator` por opção depende de `usePresenca`, que ainda não existe (chega na T-10.14).
 */
export function OperadorSelect({ operador, aoEscolher, desabilitado, id }: OperadorSelectProps) {
  const atual: ComboboxOpcao[] = operador ? [{ valor: String(operador.id), rotulo: operador.nome }] : []
  const nomes = useRef(new Map<number, string>())

  async function buscar(termo: string, signal: AbortSignal): Promise<ComboboxOpcao[]> {
    if (termo.trim().length < 2) return []
    const usuarios = await chamar(usuariosApi.buscar, { query: { q: termo.trim() } }, signal)
    for (const u of usuarios) nomes.current.set(u.id, u.nome)
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
        if (Number.isInteger(novo) && novo !== operador?.id) aoEscolher(novo, nomes.current.get(novo) ?? '')
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
