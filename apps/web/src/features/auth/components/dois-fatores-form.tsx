import { useRouter } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
import { z } from 'zod'
import { CampoForm } from '@/components/form/campo-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { ErroApi } from '@/lib/api'
import { useZodForm } from '@/lib/form'
import { destinoPorEstado, useVerificar2fa } from '../queries'
import { AuthLayout } from './auth-layout'
import { segundosDeEspera, useContagem } from './login-form'

const EsquemaCodigo = z.object({ codigo: z.string().trim().min(1, 'Informe o código.') })

interface DoisFatoresFormProps {
  redirect: string | undefined
  onVoltar: () => void
}

/** Segunda etapa do login: código de 6 dígitos do autenticador, ou um código de recuperação. */
export function DoisFatoresForm({ redirect, onVoltar }: DoisFatoresFormProps) {
  const router = useRouter()
  const verificar = useVerificar2fa()
  const form = useZodForm(EsquemaCodigo, { defaultValues: { codigo: '' } })
  const [recuperacao, setRecuperacao] = useState(false)
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [espera, iniciarEspera] = useContagem()

  const enviar = form.handleSubmit(async (dados) => {
    setErroGeral(null)
    if (!recuperacao && !/^\d{6}$/.test(dados.codigo)) {
      form.setError('codigo', { type: 'manual', message: 'Informe o código de 6 dígitos.' })
      return
    }
    const corpo = recuperacao ? { codigoRecuperacao: dados.codigo } : { codigo: dados.codigo }
    try {
      const resposta = await verificar.mutateAsync(corpo)
      const destino = destinoPorEstado(resposta.estado, redirect)
      if (destino) router.history.push(destino)
    } catch (erro) {
      if (erro instanceof ErroApi && erro.detalhes.length > 0) {
        for (const detalhe of erro.detalhes) form.setError('codigo', { type: 'server', message: detalhe.mensagem })
      } else
        setErroGeral(erro instanceof Error ? erro.message : 'Não foi possível verificar o código. Tente novamente.')
      if (erro instanceof ErroApi && erro.status === 429) iniciarEspera(segundosDeEspera(erro))
    }
  })

  const alternarRecuperacao = () => {
    setRecuperacao((atual) => !atual)
    setErroGeral(null)
    form.reset({ codigo: '' })
  }

  const bloqueado = espera > 0 || verificar.isPending

  return (
    <AuthLayout
      titulo="Verificação em duas etapas"
      descricao={
        recuperacao
          ? 'Informe um dos seus códigos de recuperação.'
          : 'Digite o código de 6 dígitos do seu aplicativo autenticador.'
      }
    >
      <form noValidate onSubmit={(evento: FormEvent) => void enviar(evento)} className="flex flex-col gap-4">
        <CampoForm
          control={form.control}
          name="codigo"
          rotulo={recuperacao ? 'Código de recuperação' : 'Código de verificação'}
          obrigatorio
        >
          {(field, controle) =>
            recuperacao ? (
              <Input {...field} {...controle} autoComplete="off" autoCapitalize="none" spellCheck={false} />
            ) : (
              <InputOTP
                id={controle.id}
                maxLength={6}
                inputMode="numeric"
                autoComplete="one-time-code"
                aria-invalid={controle['aria-invalid']}
                aria-describedby={controle['aria-describedby']}
                aria-required={controle['aria-required']}
                name={field.name}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
              >
                <InputOTPGroup>
                  {[0, 1, 2, 3, 4, 5].map((indice) => (
                    <InputOTPSlot key={indice} index={indice} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            )
          }
        </CampoForm>
        {erroGeral || espera > 0 ? (
          <div role="alert" aria-live="assertive" className="text-destructive text-sm">
            {erroGeral ? <p>{erroGeral}</p> : null}
            {espera > 0 ? <p>Muitas tentativas. Tente novamente em {espera} s.</p> : null}
          </div>
        ) : null}
        <Button type="submit" disabled={bloqueado}>
          {espera > 0 ? `Aguarde ${espera} s` : verificar.isPending ? 'Verificando…' : 'Verificar'}
        </Button>
        <Button type="button" variant="link" className="px-0" onClick={alternarRecuperacao}>
          {recuperacao ? 'Usar código do aplicativo' : 'Usar código de recuperação'}
        </Button>
        <Button type="button" variant="ghost" onClick={onVoltar}>
          Voltar
        </Button>
      </form>
    </AuthLayout>
  )
}
