import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/feedback/confirm-dialog'
import { ErroApi } from '@/lib/api'

export interface ExcluirCadastroDialogProps {
  /** Item a excluir; `null` fecha o diálogo. */
  alvo: { id: number; nome: string } | null
  /** Nome do tipo, em minúsculas e com artigo ("a área", "o canal"): usado nos textos. */
  tipo: string
  /** Mensagem do toast de sucesso ("Área excluída"). */
  sucesso: string
  /** Aviso extra sobre o que impede a exclusão ("Áreas com chamados não podem ser excluídas."). */
  aviso?: string
  excluir: (id: number) => Promise<unknown>
  aoFechar: () => void
}

/** Confirmação de exclusão de cadastro. O servidor decide se pode (409 se estiver em uso): a mensagem dele vira toast. */
export function ExcluirCadastroDialog({ alvo, tipo, sucesso, aviso, excluir, aoFechar }: ExcluirCadastroDialogProps) {
  async function confirmar() {
    if (!alvo) return
    try {
      await excluir(alvo.id)
      toast.success(sucesso)
    } catch (erro) {
      toast.error(erro instanceof ErroApi ? erro.message : `Não foi possível excluir ${tipo}.`)
    } finally {
      aoFechar()
    }
  }

  return (
    <ConfirmDialog
      aberto={alvo !== null}
      aoMudarAberto={(aberto) => (aberto ? undefined : aoFechar())}
      titulo={`Excluir ${tipo}`}
      descricao={`${alvo?.nome ?? ''} será removido. ${aviso ?? ''}`.trim()}
      rotuloConfirmar="Excluir"
      destrutivo
      aoConfirmar={confirmar}
    />
  )
}
