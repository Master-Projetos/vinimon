import { Link } from '@tanstack/react-router'
import type { Perfil } from '@vinimon/shared'
import { useState } from 'react'
import { toast } from 'sonner'
import { PasswordInput } from '@/components/form/password-input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CodigosRecuperacaoList } from '@/features/auth/components/codigos-recuperacao-list'
import { ErroApi } from '@/lib/api'
import { useDesativar2fa, useNovosCodigos2fa } from '../queries'

export interface DoisFatoresCardProps {
  mfaAtivo: boolean
  perfil: Perfil
}

function Erro({ erro }: { erro: unknown }) {
  if (!(erro instanceof ErroApi)) return null
  return (
    <Alert variant="destructive">
      <AlertDescription>
        {erro.message}
        {erro.detalhes.map((d) => (
          <span key={`${d.campo}-${d.mensagem}`} className="block">
            {d.mensagem}
          </span>
        ))}
      </AlertDescription>
    </Alert>
  )
}

/** 2FA no perfil: "Gerar novos códigos" pede a senha; "Desativar" só aparece para USUARIO (S30). */
export function DoisFatoresCard({ mfaAtivo, perfil }: DoisFatoresCardProps) {
  const novos = useNovosCodigos2fa()
  const desativar = useDesativar2fa()
  const [dialogo, setDialogo] = useState<'codigos' | 'desativar' | null>(null)
  const [senha, setSenha] = useState('')
  const [codigo, setCodigo] = useState('')
  const [codigos, setCodigos] = useState<string[] | null>(null)

  function fechar() {
    setDialogo(null)
    setSenha('')
    setCodigo('')
    setCodigos(null)
    novos.reset()
    desativar.reset()
  }

  return (
    <section aria-labelledby="titulo-2fa" className="flex flex-col gap-3 rounded-md border p-4">
      <h2 id="titulo-2fa" className="text-sm font-semibold">
        Verificação em duas etapas
      </h2>
      {mfaAtivo ? (
        <>
          <p className="text-sm text-muted-foreground">A verificação em duas etapas está ativa nesta conta.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setDialogo('codigos')}>
              Gerar novos códigos
            </Button>
            {perfil === 'USUARIO' ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setDialogo('desativar')}>
                Desativar
              </Button>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">A verificação em duas etapas ainda não está ativa.</p>
          <Button asChild variant="outline" size="sm" className="self-start">
            <Link to="/configurar-2fa">Ativar</Link>
          </Button>
        </>
      )}

      <Dialog open={dialogo === 'codigos'} onOpenChange={(aberto) => !aberto && fechar()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gerar novos códigos</DialogTitle>
            <DialogDescription>Os códigos antigos deixam de valer. Confirme sua senha.</DialogDescription>
          </DialogHeader>
          {codigos ? (
            <CodigosRecuperacaoList codigos={codigos} aoConcluir={fechar} />
          ) : (
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault()
                novos.mutate(senha, { onSuccess: (r) => setCodigos(r.codigos) })
              }}
            >
              <Label htmlFor="senha-codigos">Senha</Label>
              <PasswordInput
                id="senha-codigos"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                autoComplete="current-password"
              />
              <Erro erro={novos.error} />
              <Button type="submit" disabled={senha === '' || novos.isPending}>
                Gerar códigos
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={dialogo === 'desativar'} onOpenChange={(aberto) => !aberto && fechar()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Desativar verificação em duas etapas</DialogTitle>
            <DialogDescription>Confirme sua senha e o código atual do aplicativo.</DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              desativar.mutate(
                { senha, codigo },
                {
                  onSuccess: () => {
                    toast.success('Verificação em duas etapas desativada')
                    fechar()
                  },
                },
              )
            }}
          >
            <Label htmlFor="senha-desativar">Senha</Label>
            <PasswordInput
              id="senha-desativar"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete="current-password"
            />
            <Label htmlFor="codigo-desativar">Código de 6 dígitos</Label>
            <Input
              id="codigo-desativar"
              inputMode="numeric"
              maxLength={6}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
            />
            <Erro erro={desativar.error} />
            <Button
              type="submit"
              variant="destructive"
              disabled={senha === '' || codigo.length !== 6 || desativar.isPending}
            >
              Desativar
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  )
}
