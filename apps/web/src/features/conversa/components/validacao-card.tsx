import {
  type AprovarChamado,
  type ChamadoDetalhe,
  chamadosApi,
  NOTAS_AVALIACAO,
  type NotaAvaliacao,
  type RejeitarChamado,
  zMotivo,
} from '@vinimon/shared'
import { Frown, Laugh, Meh, Smile } from 'lucide-react'
import { useId, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import { temErroDeCampos, useAcaoChamado } from '@/features/chamados/queries'
import { chamar, ErroApi } from '@/lib/api'
import { formatarDataHora } from '@/lib/datas'
import { ROTULOS_NOTA_AVALIACAO } from '@/lib/rotulos'

const ICONES = { OTIMO: Laugh, BOM: Smile, REGULAR: Meh, RUIM: Frown } as const

export interface ValidacaoCardProps {
  detalhe: ChamadoDetalhe
}

/** Mensagem do campo quando a API devolve 400 com `detalhes` para `campo`. */
const erroDoCampo = (erro: unknown, campo: string): string | null =>
  temErroDeCampos(erro) ? (erro.detalhes.find((d) => d.campo === campo)?.mensagem ?? null) : null

/**
 * Validação pelo solicitante (C13, C14): avalia com uma das 4 notas (e comentário opcional) e o chamado é
 * encerrado, ou diz "Não resolveu" com um motivo obrigatório e o chamado volta ao atendimento.
 * O `RadioGroup` navega por teclado (setas); nada exige mouse.
 */
export function ValidacaoCard({ detalhe }: ValidacaoCardProps) {
  const id = useId()
  const [modo, setModo] = useState<'avaliar' | 'rejeitar'>('avaliar')
  const [nota, setNota] = useState<NotaAvaliacao | ''>('')
  const [comentario, setComentario] = useState('')
  const [motivo, setMotivo] = useState('')
  const [erroMotivo, setErroMotivo] = useState<string | null>(null)
  const [erroComentario, setErroComentario] = useState<string | null>(null)

  const aprovar = useAcaoChamado(detalhe.id, (corpo: AprovarChamado) =>
    chamar(chamadosApi.aprovar, { params: { id: detalhe.id }, body: corpo }),
  )
  const rejeitar = useAcaoChamado(detalhe.id, (corpo: RejeitarChamado) =>
    chamar(chamadosApi.rejeitar, { params: { id: detalhe.id }, body: corpo }),
  )
  const ocupado = aprovar.isPending || rejeitar.isPending

  async function enviarAvaliacao() {
    if (nota === '') return
    setErroComentario(null)
    const texto = comentario.trim()
    try {
      await aprovar.mutateAsync({ versao: detalhe.versao, nota, ...(texto ? { comentario: texto } : {}) })
      toast.success('Obrigado pela avaliação. O chamado foi encerrado.')
    } catch (erro) {
      setErroComentario(erroDoCampo(erro, 'comentario'))
    }
  }

  async function enviarRejeicao() {
    const validacao = zMotivo().safeParse(motivo)
    if (!validacao.success) {
      setErroMotivo(validacao.error.issues[0]?.message ?? 'Informe o motivo.')
      return
    }
    setErroMotivo(null)
    try {
      await rejeitar.mutateAsync({ versao: detalhe.versao, motivo: validacao.data })
      toast.success('O chamado voltou para o atendimento.')
    } catch (erro) {
      setErroMotivo(erroDoCampo(erro, 'motivo') ?? (erro instanceof ErroApi ? null : 'Não foi possível enviar.'))
    }
  }

  return (
    <section aria-label="Validação do atendimento" className="rounded-lg border bg-card p-4 text-card-foreground">
      <h2 className="mb-1 text-sm font-medium">O seu problema foi resolvido?</h2>
      {detalhe.validacaoLimiteEm ? (
        <p className="mb-3 text-xs text-muted-foreground">
          Sem resposta até {formatarDataHora(detalhe.validacaoLimiteEm)}, o chamado será encerrado automaticamente.
        </p>
      ) : null}

      {modo === 'avaliar' ? (
        <div className="flex flex-col gap-3">
          {detalhe.acoes.aprovar ? (
            <>
              <RadioGroup
                aria-label="Avaliação do atendimento"
                value={nota}
                onValueChange={(v) => setNota(NOTAS_AVALIACAO.find((n) => n === v) ?? '')}
                className="grid grid-cols-2 gap-2 sm:grid-cols-4"
              >
                {NOTAS_AVALIACAO.map((n) => {
                  const Icone = ICONES[n]
                  return (
                    <Label
                      key={n}
                      htmlFor={`${id}-${n}`}
                      className="flex cursor-pointer items-center gap-2 rounded-md border p-2 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent"
                    >
                      <RadioGroupItem id={`${id}-${n}`} value={n} />
                      <Icone aria-hidden="true" className="size-4" />
                      {ROTULOS_NOTA_AVALIACAO[n]}
                    </Label>
                  )
                })}
              </RadioGroup>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${id}-comentario`}>Comentário (opcional)</Label>
                <Textarea
                  id={`${id}-comentario`}
                  value={comentario}
                  maxLength={1000}
                  aria-invalid={erroComentario !== null}
                  aria-describedby={erroComentario ? `${id}-erro-comentario` : undefined}
                  onChange={(e) => setComentario(e.target.value)}
                />
                {erroComentario ? (
                  <p id={`${id}-erro-comentario`} className="text-sm text-destructive">
                    {erroComentario}
                  </p>
                ) : null}
              </div>
            </>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {detalhe.acoes.aprovar ? (
              <Button type="button" disabled={nota === '' || ocupado} onClick={() => void enviarAvaliacao()}>
                Confirmar solução
              </Button>
            ) : null}
            {detalhe.acoes.rejeitar ? (
              <Button type="button" variant="outline" disabled={ocupado} onClick={() => setModo('rejeitar')}>
                Não resolveu
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${id}-motivo`}>Conte o que ainda não funciona</Label>
            <Textarea
              id={`${id}-motivo`}
              value={motivo}
              maxLength={2000}
              aria-required="true"
              aria-invalid={erroMotivo !== null}
              aria-describedby={erroMotivo ? `${id}-erro-motivo` : undefined}
              onChange={(e) => setMotivo(e.target.value)}
            />
            {erroMotivo ? (
              <p id={`${id}-erro-motivo`} className="text-sm text-destructive">
                {erroMotivo}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={ocupado} onClick={() => void enviarRejeicao()}>
              Enviar
            </Button>
            <Button type="button" variant="ghost" disabled={ocupado} onClick={() => setModo('avaliar')}>
              Voltar
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
