import type { Usuario } from '@vinimon/shared'
import { EllipsisVertical } from 'lucide-react'
import { useId, useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/feedback/confirm-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ErroApi } from '@/lib/api'
import { useAcoesUsuario } from '../queries'

type Acao = 'senha' | 'mfa' | 'sessoes' | 'desbloquear' | 'anonimizar'

export interface AcoesUsuarioMenuProps {
  usuario: Usuario
  /** Recebe a senha temporária para o `SenhaTemporariaDialog` mostrar uma vez. */
  aoSenhaTemporaria: (senha: string) => void
}

const mensagem = (erro: unknown) => (erro instanceof Error ? erro.message : 'Não foi possível concluir a ação.')

/** Menu de ações administrativas; cada uma pede confirmação (e o reset de 2FA, a senha do próprio admin). */
export function AcoesUsuarioMenu({ usuario, aoSenhaTemporaria }: AcoesUsuarioMenuProps) {
  const [acao, setAcao] = useState<Acao | null>(null)
  const [senhaAdmin, setSenhaAdmin] = useState('')
  const [erroSenha, setErroSenha] = useState<string | null>(null)
  const idSenha = useId()
  const acoes = useAcoesUsuario()
  const fechar = () => {
    setAcao(null)
    setSenhaAdmin('')
    setErroSenha(null)
  }

  async function executar(fn: () => Promise<unknown>, sucesso: string) {
    try {
      await fn()
      toast.success(sucesso)
    } catch (erro) {
      toast.error(mensagem(erro))
    }
  }

  async function resetar2fa() {
    if (senhaAdmin === '') {
      setErroSenha('Informe a sua senha.')
      return
    }
    try {
      await acoes.resetar2fa.mutateAsync({ id: usuario.id, corpo: { senhaAdmin } })
      toast.success('2FA resetado. A pessoa cadastra de novo no próximo acesso.')
      fechar()
    } catch (erro) {
      const detalhe =
        erro instanceof ErroApi ? erro.detalhes.find((d) => d.campo === 'senhaAdmin')?.mensagem : undefined
      setErroSenha(detalhe ?? mensagem(erro))
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" size="icon" variant="ghost" aria-label={`Ações de ${usuario.nome}`}>
            <EllipsisVertical aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setAcao('senha')}>Redefinir senha</DropdownMenuItem>
          <DropdownMenuItem disabled={!usuario.mfaAtivo} onSelect={() => setAcao('mfa')}>
            Resetar 2FA
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setAcao('sessoes')}>Encerrar sessões</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setAcao('desbloquear')}>Desbloquear login</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setAcao('anonimizar')}>
            Anonimizar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        aberto={acao === 'senha'}
        aoMudarAberto={(a) => (a ? undefined : fechar())}
        titulo="Redefinir senha"
        descricao={`Gera uma senha temporária para ${usuario.nome}, encerra todas as sessões e exige a troca no próximo acesso.`}
        rotuloConfirmar="Redefinir"
        aoConfirmar={async () => {
          try {
            const r = await acoes.redefinirSenha.mutateAsync(usuario.id)
            aoSenhaTemporaria(r.senhaTemporaria)
          } catch (erro) {
            toast.error(mensagem(erro))
          }
        }}
      />
      <ConfirmDialog
        aberto={acao === 'sessoes'}
        aoMudarAberto={(a) => (a ? undefined : fechar())}
        titulo="Encerrar sessões"
        descricao={`${usuario.nome} será desconectado de todos os dispositivos.`}
        rotuloConfirmar="Encerrar"
        aoConfirmar={() => executar(() => acoes.encerrarSessoes.mutateAsync(usuario.id), 'Sessões encerradas.')}
      />
      <ConfirmDialog
        aberto={acao === 'desbloquear'}
        aoMudarAberto={(a) => (a ? undefined : fechar())}
        titulo="Desbloquear login"
        descricao={`Remove o bloqueio por tentativas erradas de ${usuario.nome}.`}
        rotuloConfirmar="Desbloquear"
        aoConfirmar={() => executar(() => acoes.desbloquearLogin.mutateAsync(usuario.id), 'Login desbloqueado.')}
      />
      <ConfirmDialog
        aberto={acao === 'anonimizar'}
        aoMudarAberto={(a) => (a ? undefined : fechar())}
        titulo="Anonimizar usuário"
        descricao="Troca nome, e-mail e telefone por marcadores, encerra as sessões e preserva o histórico. Não dá para desfazer."
        rotuloConfirmar="Anonimizar"
        destrutivo
        aoConfirmar={() => executar(() => acoes.anonimizar.mutateAsync(usuario.id), 'Usuário anonimizado.')}
      />

      <Dialog open={acao === 'mfa'} onOpenChange={(a) => (a ? undefined : fechar())}>
        <DialogContent>
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              void resetar2fa()
            }}
            className="flex flex-col gap-4"
          >
            <DialogHeader>
              <DialogTitle>Resetar 2FA</DialogTitle>
              <DialogDescription>
                {usuario.nome} perde o 2FA atual e os códigos de recuperação. Confirme com a sua senha.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1">
              <Label htmlFor={idSenha}>Sua senha</Label>
              <Input
                id={idSenha}
                type="password"
                autoComplete="current-password"
                value={senhaAdmin}
                aria-invalid={erroSenha !== null}
                aria-describedby={erroSenha ? `${idSenha}-erro` : undefined}
                onChange={(e) => setSenhaAdmin(e.target.value)}
              />
              {erroSenha ? (
                <p id={`${idSenha}-erro`} className="text-sm text-destructive">
                  {erroSenha}
                </p>
              ) : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={fechar}>
                Cancelar
              </Button>
              <Button type="submit" variant="destructive" disabled={acoes.resetar2fa.isPending}>
                Resetar 2FA
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
