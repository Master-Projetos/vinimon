import { type ReactNode, useId } from 'react'
import { type Control, Controller, type ControllerRenderProps, type FieldPath, type FieldValues } from 'react-hook-form'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'

export interface ControleAcessivel {
  id: string
  'aria-invalid': boolean
  'aria-describedby': string | undefined
  'aria-required': boolean | undefined
}

export interface CampoFormProps<T extends FieldValues, N extends FieldPath<T>, O> {
  control: Control<T, unknown, O>
  name: N
  rotulo: string
  descricao?: string
  obrigatorio?: boolean
  children: (field: ControllerRenderProps<T, N>, controle: ControleAcessivel) => ReactNode
}

export function CampoForm<T extends FieldValues, N extends FieldPath<T>, O = T>({
  control,
  name,
  rotulo,
  descricao,
  obrigatorio,
  children,
}: CampoFormProps<T, N, O>) {
  const id = useId()
  return (
    <Controller<T, N, O>
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const idDescricao = descricao ? `${id}-descricao` : undefined
        const idErro = fieldState.error ? `${id}-erro` : undefined
        const descritoPor = [idDescricao, idErro].filter(Boolean).join(' ') || undefined
        return (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={id}>
              {rotulo}
              {obrigatorio ? <span aria-hidden="true"> *</span> : null}
            </FieldLabel>
            {children(field, {
              id,
              'aria-invalid': fieldState.invalid,
              'aria-describedby': descritoPor,
              'aria-required': obrigatorio,
            })}
            {descricao ? <FieldDescription id={idDescricao}>{descricao}</FieldDescription> : null}
            {fieldState.error ? <FieldError id={idErro}>{fieldState.error.message}</FieldError> : null}
          </Field>
        )
      }}
    />
  )
}
