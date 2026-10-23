import { useRouter } from '@tanstack/react-router'
import { EntrarBodySchema } from '@vinimon/shared'
import { type FormEvent, useEffect, useState } from 'react'
import { CampoForm } from '@/components/form/campo-form'
import { PasswordInput } from '@/components/form/password-input'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ErroApi } from '@/lib/api'
import { aplicarErrosDoServidor, useZodForm } from '@/lib/form'
import { destinoPorEstado, useEntrar } from '../queries'
import { AuthLayout } from './auth-layout'

/** Janela do rate limit do login (60 s) quando o servidor não informa o tempo. */
const ESPERA_PADRAO_SEGUNDOS = 60

/** Segundos de espera: `Retry-After`; senão "N minutos" da mensagem (bloqueio da service); senão o padrão. */
export function segundosDeEspera(erro: ErroApi): number {
  if (erro.retryAfter !== undefined) return erro.retryAfter
  const minutos = /(\d+)\s+minutos?/.exec(erro.message)
  if (minutos?.[1]) return Number(minutos[1]) * 60
  return ESPERA_PADRAO_SEGUNDOS
}

/** Contagem regressiva de segundos, de 1 em 1 s. `iniciar(n)` começa uma contagem de n segundos. */
export function useContagem(): [number, (segundos: number) => void] {
  const [restante, iniciar] = useState(0)
  useEffect(() => {
    if (restante <= 0) return
    const id = window.setTimeout(() => iniciar((s) => s - 1), 1000)
    return () => window.clearTimeout(id)
  }, [restante])
  return [restante, iniciar]
}

interface LoginFormProps {
  redirect: string | undefined
  onPendenteMfa: () => void
}

export function LoginForm({ redirect, onPendenteMfa }: LoginFormProps) {
  const router = useRouter()
  const entrar = useEntrar()
  const form = useZodForm(EntrarBodySchema, { defaultValues: { login: '', senha: '' } })
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [capsLock, setCapsLock] = useState(false)
  const [espera, iniciarEspera] = useContagem()

  const enviar = form.handleSubmit(async (dados) => {
    setErroGeral(null)
    try {
      const resposta = await entrar.mutateAsync(dados)
      if (resposta.estado === 'PENDENTE_MFA') {
        onPendenteMfa()
        return
      }
      const destino = destinoPorEstado(resposta.estado, redirect)
      if (destino) router.history.push(destino)
    } catch (erro) {
      if (erro instanceof ErroApi && erro.detalhes.length > 0) aplicarErrosDoServidor(form.setError, erro)
      else setErroGeral(erro instanceof Error ? erro.message : 'Não foi possível entrar. Tente novamente.')
      if (erro instanceof ErroApi && erro.status === 429) iniciarEspera(segundosDeEspera(erro))
    }
  })

  const bloqueado = espera > 0 || entrar.isPending

  return (
    <AuthLayout titulo="Entrar" descricao="Use seu login e senha para continuar.">
      <form noValidate onSubmit={(evento: FormEvent) => void enviar(evento)} className="flex flex-col gap-4">
        <CampoForm control={form.control} name="login" rotulo="Login" obrigatorio>
          {(field, controle) => (
            <Input {...field} {...controle} autoComplete="username" autoCapitalize="none" spellCheck={false} />
          )}
        </CampoForm>
        <CampoForm control={form.control} name="senha" rotulo="Senha" obrigatorio>
          {(field, controle) => (
            <PasswordInput
              {...field}
              {...controle}
              autoComplete="current-password"
              onKeyDown={(evento) => setCapsLock(evento.getModifierState('CapsLock'))}
              onKeyUp={(evento) => setCapsLock(evento.getModifierState('CapsLock'))}
            />
          )}
        </CampoForm>
        {capsLock ? (
          <p role="status" className="text-amber-700 text-sm dark:text-amber-400">
            Caps Lock está ativado.
          </p>
        ) : null}
        {erroGeral || espera > 0 ? (
          <div role="alert" aria-live="assertive" className="text-destructive text-sm">
            {erroGeral ? <p>{erroGeral}</p> : null}
            {espera > 0 ? <p>Muitas tentativas. Tente novamente em {espera} s.</p> : null}
          </div>
        ) : null}
        <Button type="submit" disabled={bloqueado}>
          {espera > 0 ? `Aguarde ${espera} s` : entrar.isPending ? 'Entrando…' : 'Entrar'}
        </Button>
      </form>
    </AuthLayout>
  )
}
