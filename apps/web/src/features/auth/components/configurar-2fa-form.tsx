import type { SessaoResposta } from '@vinimon/shared'
import { AlertCircle, Check, Copy, Loader2 } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useState } from 'react'
import { ErrorState } from '@/components/feedback/error-state'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { useConfirmar2fa, useIniciar2fa } from '@/features/auth/queries'
import { useCopiar } from '@/hooks/use-copiar'
import { ErroApi } from '@/lib/api'
import { CodigosRecuperacaoList } from './codigos-recuperacao-list'

/**
 * Cadastro do 2FA: QR + chave (copiar) → código do aplicativo → códigos de recuperação → Concluir.
 * Tudo que é segredo fica só na memória desta tela.
 */
export function Configurar2faForm({ aoConcluir }: { aoConcluir: (sessao: SessaoResposta) => void }) {
  const iniciar = useIniciar2fa()
  const confirmar = useConfirmar2fa()
  const { copiado, copiar } = useCopiar()
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [resultado, setResultado] = useState<{ codigos: string[]; sessao: SessaoResposta } | null>(null)

  if (resultado) {
    return <CodigosRecuperacaoList codigos={resultado.codigos} aoConcluir={() => aoConcluir(resultado.sessao)} />
  }
  if (iniciar.isPending) {
    return (
      <p className="flex items-center gap-2 text-muted-foreground text-sm" role="status">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Preparando o cadastro…
      </p>
    )
  }
  if (iniciar.isError) return <ErrorState erro={iniciar.error} aoTentarNovamente={() => void iniciar.refetch()} />

  const { otpauthUri, segredo } = iniciar.data
  const enviar = async (valor: string) => {
    setErro(null)
    try {
      setResultado(await confirmar.mutateAsync(valor))
    } catch (e) {
      setCodigo('')
      const detalhe = e instanceof ErroApi ? e.detalhes.find((d) => d.campo === 'codigo')?.mensagem : undefined
      setErro(detalhe ?? (e instanceof Error ? e.message : 'Não foi possível confirmar o código.'))
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
      <ol className="list-decimal space-y-1 pl-5 text-muted-foreground text-sm">
        <li>Abra o aplicativo autenticador no celular.</li>
        <li>Escaneie o QR code ou digite a chave.</li>
        <li>Digite o código de 6 dígitos que o aplicativo mostrar.</li>
      </ol>
      <div className="flex justify-center rounded-md bg-white p-3">
        <QRCodeSVG value={otpauthUri} size={176} title="QR code para o aplicativo autenticador" />
      </div>
      <Field>
        <FieldLabel htmlFor="segredo-2fa">Chave de configuração</FieldLabel>
        <div className="flex gap-2">
          <code
            id="segredo-2fa"
            className="min-w-0 flex-1 break-all rounded-md border bg-muted/40 px-2 py-1.5 font-mono text-sm"
          >
            {segredo}
          </code>
          <Button type="button" variant="outline" size="sm" onClick={() => void copiar(segredo)}>
            {copiado ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            {copiado ? 'Copiada' : 'Copiar chave'}
          </Button>
        </div>
      </Field>
      {erro ? (
        <Alert variant="destructive" role="alert">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      ) : null}
      <Field>
        <FieldLabel htmlFor="codigo-confirmar-2fa">Código de 6 dígitos</FieldLabel>
        <InputOTP
          id="codigo-confirmar-2fa"
          maxLength={6}
          value={codigo}
          onChange={setCodigo}
          onComplete={(v) => void enviar(v)}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          disabled={confirmar.isPending}
        >
          <InputOTPGroup>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <InputOTPSlot key={i} index={i} />
            ))}
          </InputOTPGroup>
        </InputOTP>
        <FieldDescription>O código muda a cada 30 segundos.</FieldDescription>
      </Field>
      <Button type="submit" className="w-full" disabled={confirmar.isPending || codigo.length < 6}>
        {confirmar.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
        Confirmar
      </Button>
    </form>
  )
}
