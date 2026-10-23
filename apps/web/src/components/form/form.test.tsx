import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ErroApi } from '@/lib/api'
import { aplicarErrosDoServidor, useZodForm } from '@/lib/form'
import { CampoForm } from './campo-form'

const Esquema = z.object({ nome: z.string() })

function FormularioTeste({ enviar }: { enviar: (dados: z.output<typeof Esquema>) => Promise<void> }) {
  const form = useZodForm(Esquema, { defaultValues: { nome: 'Ana' } })
  return (
    <form
      onSubmit={form.handleSubmit(async (dados) => {
        try {
          await enviar(dados)
        } catch (erro) {
          aplicarErrosDoServidor(form.setError, erro)
        }
      })}
    >
      <CampoForm control={form.control} name="nome" rotulo="Nome">
        {(field, controle) => <Input {...field} {...controle} />}
      </CampoForm>
      <Button type="submit">Salvar</Button>
    </form>
  )
}

describe('formulário: erro do servidor', () => {
  it('marca o campo com aria-invalid e aponta aria-describedby para a mensagem de erro', async () => {
    const enviar = () =>
      Promise.reject(
        new ErroApi(400, {
          erro: {
            codigo: 'VALIDACAO',
            mensagem: 'Dados inválidos.',
            detalhes: [{ campo: 'nome', mensagem: 'Nome já existe.' }],
          },
        }),
      )
    render(<FormularioTeste enviar={enviar} />)

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    const campo = screen.getByLabelText('Nome')
    await waitFor(() => expect(campo).toHaveAttribute('aria-invalid', 'true'))
    const erro = await screen.findByText('Nome já existe.')
    expect(campo.getAttribute('aria-describedby')?.split(' ')).toContain(erro.id)
  })
})
