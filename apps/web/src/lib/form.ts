import { zodResolver } from '@hookform/resolvers/zod'
import { type FieldValues, type Path, type UseFormProps, type UseFormSetError, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import type { z } from 'zod'
import { ErroApi } from './api'

export function useZodForm<I extends FieldValues, O extends FieldValues>(
  schema: z.ZodType<O, I>,
  opcoes?: Omit<UseFormProps<I, unknown, O>, 'resolver'>,
) {
  return useForm<I, unknown, O>({ resolver: zodResolver(schema), mode: 'onTouched', ...opcoes })
}

/** 400 com detalhes → erros nos campos; demais → toast. */
export function aplicarErrosDoServidor<T extends FieldValues>(setError: UseFormSetError<T>, erro: unknown): void {
  if (erro instanceof ErroApi && erro.detalhes.length > 0) {
    for (const d of erro.detalhes) setError(d.campo as Path<T>, { type: 'server', message: d.mensagem })
    return
  }
  toast.error(erro instanceof Error ? erro.message : 'Não foi possível concluir a ação. Tente novamente.')
}
