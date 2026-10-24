import { cleanup, render, screen } from '@testing-library/react'
import { QRCodeSVG } from 'qrcode.react'
import { afterEach, describe, expect, it } from 'vitest'
import { EtiquetaQrDialog, urlDaEtiqueta } from '@/features/inventario/components/etiqueta-qr-dialog'

afterEach(cleanup)

describe('EtiquetaQrDialog', () => {
  it('monta a URL de novo chamado com a etiqueta', () => {
    expect(urlDaEtiqueta('NB-001')).toBe(`${location.origin}/chamados/novo?equipamento=NB-001`)
    expect(urlDaEtiqueta('A/B 1')).toBe(`${location.origin}/chamados/novo?equipamento=A%2FB%201`)
  })

  it('desenha o QR do valor esperado e inclui a regra de impressão 50×30 mm', () => {
    render(<EtiquetaQrDialog etiqueta="NB-001" aberto aoMudarAberto={() => {}} />)
    const svg = screen.getByTitle('QR da etiqueta NB-001').closest('svg')
    expect(svg).not.toBeNull()

    const esperado = render(
      <QRCodeSVG value={`${location.origin}/chamados/novo?equipamento=NB-001`} size={96} level="M" />,
    )
    const caminhoEsperado = esperado.container.querySelector('path[fill="#000000"]')?.getAttribute('d')
    const caminho = svg?.querySelector('path[fill="#000000"]')?.getAttribute('d')
    expect(caminho).toBeTruthy()
    expect(caminho).toBe(caminhoEsperado)

    const css = Array.from(document.querySelectorAll('style'))
      .map((s) => s.textContent ?? '')
      .join('\n')
    expect(css).toContain('@page { size: 50mm 30mm')
    expect(css).toContain('@media print')
    expect(screen.getByRole('button', { name: /Imprimir etiqueta/ })).toBeInTheDocument()
  })
})
