import type { SessaoResposta } from '@vinimon/shared'
import { AlertCircle, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { useVerificar2fa } from '@/features/auth/queries'
import { ErroApi } from '@/lib/api'

/**
 * Etapa de 2FA do login: código de 6 dígitos do aplicativo ou, alternativamente, um código de recuperação.
 * Falha de código (400/401) mostra a mensagem do servidor e limpa o campo; a sessão pendente é a mesma.
 */
export function DoisFatoresForm({ aoVerificar }: { aoVerificar: (sessao: SessaoResposta) => void }) {
  const verificar = useVerificar2fa()
  const [recuperacao, setRecuperacao] = useState(false)
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const enviar = async (valor: string) => {
    setErro(null)
    const texto = valor.trim()
    if (texto === '') return
    try {
      aoVerificar(await verificar.mutateAsync(recuperacao ? { codigoRecuperacao: texto } : { codigo: texto }))
    } catch (e) {
      setCodigo('')
      setErro(
        e instanceof ErroApi && e.status === 429
          ? 'Muitas tentativas. Aguarde para tentar novamente.'
          : e instanceof Error
            ? e.message
            : 'Não foi possível verificar o código.',
      )
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        void enviar(codigo)
      }}
    >
      {erro ? (
        <Alert variant="destructive" role="alert">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      ) : null}
      <Field>
        <FieldLabel htmlFor="codigo-2fa">{recuperacao ? 'Código de recuperação' : 'Código de 6 dígitos'}</FieldLabel>
        {recuperacao ? (
          <Input
            id="codigo-2fa"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            autoComplete="one-time-code"
            autoFocus
            maxLength={19}
          />
        ) : (
          <InputOTP
            id="codigo-2fa"
            maxLength={6}
            value={codigo}
            onChange={setCodigo}
            onComplete={(v) => void enviar(v)}
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="one-time-code"
            autoFocus
            disabled={verificar.isPending}
          >
            <InputOTPGroup>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <InputOTPSlot key={i} index={i} />
              ))}
            </InputOTPGroup>
          </InputOTP>
        )}
        <FieldDescription>
          {recuperacao
            ? 'Use um dos códigos guardados quando o cadastro do 2FA foi feito.'
            : 'Digite o código que o aplicativo autenticador mostra agora.'}
        </FieldDescription>
      </Field>
      <Button type="submit" className="w-full" disabled={verificar.isPending || codigo.trim() === ''}>
        {verificar.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
        Verificar
      </Button>
      <Button
        type="button"
        variant="link"
        className="w-full"
        onClick={() => {
          setRecuperacao((r) => !r)
          setCodigo('')
          setErro(null)
        }}
      >
        {recuperacao ? 'Usar o código do aplicativo' : 'Usar um código de recuperação'}
      </Button>
    </form>
  )
}
