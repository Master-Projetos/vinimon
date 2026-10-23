import { EntrarBodySchema, type SessaoResposta } from '@vinimon/shared'
import { AlertCircle, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import { CampoForm } from '@/components/form/campo-form'
import { PasswordInput } from '@/components/form/password-input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useEntrar } from '@/features/auth/queries'
import { ErroApi } from '@/lib/api'
import { aplicarErrosDoServidor, useZodForm } from '@/lib/form'

/** Espera padrão quando o servidor responde 429 sem `Retry-After`. */
const ESPERA_PADRAO_S = 60

// O schema do contrato normaliza o login (trim/minúsculas); o formulário só exige o preenchimento.
const FormularioSchema = z.object({
  login: z.string().trim().min(1, 'Informe o login.'),
  senha: z.string().min(1, 'Informe a senha.'),
})

/** Contagem regressiva em segundos; chama `aoZerar` ao chegar em 0. */
function useContagem(inicio: number | null): number {
  const [restante, setRestante] = useState(0)
  useEffect(() => {
    if (inicio === null) return setRestante(0)
    setRestante(inicio)
    const intervalo = setInterval(() => {
      setRestante((atual) => {
        if (atual <= 1) {
          clearInterval(intervalo)
          return 0
        }
        return atual - 1
      })
    }, 1000)
    return () => clearInterval(intervalo)
  }, [inicio])
  return restante
}

export function LoginForm({ aoEntrar }: { aoEntrar: (sessao: SessaoResposta) => void }) {
  const entrar = useEntrar()
  const form = useZodForm(FormularioSchema, { defaultValues: { login: '', senha: '' } })
  const [capsLock, setCapsLock] = useState(false)
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [espera, setEspera] = useState<number | null>(null)
  const restante = useContagem(espera)

  const enviar = form.handleSubmit(async (dados) => {
    setErroGeral(null)
    setEspera(null)
    // revalida com o contrato real (login normalizado) antes de ir à rede
    const body = EntrarBodySchema.safeParse(dados)
    if (!body.success) {
      form.setError('login', { message: 'Login inválido.' })
      return
    }
    try {
      aoEntrar(await entrar.mutateAsync(body.data))
    } catch (erro) {
      if (erro instanceof ErroApi && erro.status === 429) {
        setEspera(erro.retryAfter ?? ESPERA_PADRAO_S)
        setErroGeral('Muitas tentativas. Aguarde para tentar novamente.')
      } else if (erro instanceof ErroApi && erro.status === 401) {
        setErroGeral('Login ou senha inválidos.') // mensagem única: não revela qual dos dois falhou
      } else if (erro instanceof ErroApi && erro.detalhes.length > 0) {
        aplicarErrosDoServidor(form.setError, erro)
      } else {
        setErroGeral(erro instanceof Error ? erro.message : 'Não foi possível entrar. Tente novamente.')
      }
    }
  })

  const bloqueado = restante > 0
  return (
    <form onSubmit={enviar} noValidate className="space-y-4">
      {erroGeral ? (
        <Alert variant="destructive" role="alert">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{erroGeral}</AlertDescription>
        </Alert>
      ) : null}
      <CampoForm control={form.control} name="login" rotulo="Login" obrigatorio>
        {(field, controle) => <Input {...field} {...controle} autoComplete="username" autoFocus />}
      </CampoForm>
      <CampoForm control={form.control} name="senha" rotulo="Senha" obrigatorio>
        {(field, controle) => (
          <PasswordInput
            {...field}
            {...controle}
            autoComplete="current-password"
            onKeyUp={(e) => setCapsLock(e.getModifierState('CapsLock'))}
            onKeyDown={(e) => setCapsLock(e.getModifierState('CapsLock'))}
          />
        )}
      </CampoForm>
      {capsLock ? (
        <p className="text-muted-foreground text-sm" role="status">
          Caps Lock está ligado.
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={entrar.isPending || bloqueado}>
        {entrar.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
        {bloqueado ? `Aguarde ${restante}s` : 'Entrar'}
      </Button>
    </form>
  )
}
