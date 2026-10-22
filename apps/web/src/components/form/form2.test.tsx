import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { ColorField } from './color-field'
import { ComboboxField, type ComboboxOpcao } from './combobox-field'

// jsdom não implementa estas APIs; o cmdk e o Popper do Radix precisam delas.
beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}
})

afterEach(() => {
  cleanup()
})

const OPCOES: ComboboxOpcao[] = [
  { valor: 'alfa', rotulo: 'Alfa' },
  { valor: 'beta', rotulo: 'Beta' },
  { valor: 'gama', rotulo: 'Gama' },
]

/** ComboboxField é controlado: o pai guarda o valor, como em um formulário. */
function ComboboxControlado({ aoMudar }: { aoMudar: (v: string | null) => void }) {
  const [valor, setValor] = useState<string | null>(null)
  return (
    <>
      <label htmlFor="area">Área</label>
      <ComboboxField
        id="area"
        valor={valor}
        aoMudar={(v) => {
          setValor(v)
          aoMudar(v)
        }}
        opcoes={OPCOES}
        placeholder="Escolha"
      />
    </>
  )
}

describe('ComboboxField', () => {
  it('teclado: ↓ abre o painel, ↓ move a seleção e Enter escolhe a opção', async () => {
    const aoMudar = vi.fn()
    render(<ComboboxControlado aoMudar={aoMudar} />)

    const gatilho = screen.getByRole('combobox', { name: 'Área' })
    fireEvent.keyDown(gatilho, { key: 'ArrowDown' })
    expect(gatilho).toHaveAttribute('aria-expanded', 'true')

    const busca = await screen.findByPlaceholderText('Buscar...')
    fireEvent.keyDown(busca, { key: 'ArrowDown' })
    fireEvent.keyDown(busca, { key: 'Enter' })

    await waitFor(() => expect(aoMudar).toHaveBeenCalledWith('beta'))
    expect(aoMudar).toHaveBeenCalledTimes(1)
    expect(gatilho).toHaveTextContent('Beta')
  })

  it('com buscar: espera 200 ms depois da última tecla e chama só com o termo final', async () => {
    const buscar = vi.fn(async (termo: string, _signal: AbortSignal) => [
      { valor: termo, rotulo: `Resultado ${termo}` },
    ])
    render(<ComboboxField valor={null} aoMudar={() => {}} buscar={buscar} />)

    fireEvent.click(screen.getByRole('combobox'))
    const busca = await screen.findByPlaceholderText('Buscar...')
    fireEvent.change(busca, { target: { value: 'a' } })
    fireEvent.change(busca, { target: { value: 'ab' } })

    await screen.findByText('Resultado ab')
    expect(buscar).toHaveBeenCalledTimes(1)
    expect(buscar).toHaveBeenCalledWith('ab', expect.any(AbortSignal))
  })
})

describe('ColorField', () => {
  it('mostra a razão de contraste nas prévias clara e escura, no formato pt-BR', () => {
    render(<ColorField valor="#ffff00" aoMudar={() => {}} textoAmostra="Urgente" />)

    const razoes = screen.getAllByText(/^\d+,\d:1 · AA$/)
    expect(razoes).toHaveLength(2)
    expect(screen.getByText('Prévia clara')).toBeInTheDocument()
    expect(screen.getByText('Prévia escura')).toBeInTheDocument()
  })
})
