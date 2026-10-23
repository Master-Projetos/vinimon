import { type QueryClient, useMutation, useQuery } from '@tanstack/react-query'
import { createRootRouteWithContext, createRoute, Outlet } from '@tanstack/react-router'
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { areasApi, type SessaoResposta } from '@vinimon/shared'
import { afterEach, describe, expect, it } from 'vitest'
import { ErrorState } from '@/components/feedback/error-state'
import { chamar } from '@/lib/api'
import type { ApiFalsa } from './api-falsa'
import { renderRota } from './render-rota'

/*
 * Rota de teste até a T-10.5 existir: /admin/areas fake, montada aqui com os contratos reais de áreas.
 * A T-10.5 troca por routes/_app/admin/areas.tsx e este arquivo passa a usar a árvore real.
 */
function AreasTeste() {
  const areas = useQuery({
    queryKey: ['areas-teste'],
    queryFn: ({ signal }) => chamar(areasApi.listar, {}, signal),
  })
  const criar = useMutation({
    mutationFn: (nome: string) =>
      chamar(areasApi.criar, { body: { nome, atende: true, ativo: true, jornadaId: null } }),
  })

  if (areas.isPending) return <p>Carregando áreas…</p>
  if (areas.isError) return <ErrorState erro={areas.error} />
  return (
    <main>
      <h1>Áreas</h1>
      <ul>
        {areas.data.itens.map((area) => (
          <li key={area.id}>{area.nome}</li>
        ))}
      </ul>
      <form
        onSubmit={(evento) => {
          evento.preventDefault()
          const campo = evento.currentTarget.elements.namedItem('nome')
          criar.mutate(campo instanceof HTMLInputElement ? campo.value : '')
        }}
      >
        <label>
          Nome da área
          <input name="nome" />
        </label>
        <button type="submit">Criar área</button>
      </form>
    </main>
  )
}

const raizTeste = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: () => <Outlet />,
})
const rotaAreasTeste = createRoute({ getParentRoute: () => raizTeste, path: '/admin/areas', component: AreasTeste })
const arvoreTeste = raizTeste.addChildren([rotaAreasTeste])

const sessao: SessaoResposta = { estado: 'ATIVA', csrf: 'csrf-teste', usuario: null }

const area = (id: number, nome: string) => ({
  id,
  nome,
  atende: true,
  ativo: true,
  jornadaId: null,
  criadoEm: '2026-10-01T10:00:00.000Z',
  atualizadoEm: '2026-10-01T10:00:00.000Z',
})

let falsaAtual: ApiFalsa | undefined

afterEach(() => {
  cleanup()
  falsaAtual?.restaurar()
  falsaAtual = undefined
})

function montar(respostas: Parameters<typeof renderRota>[1]['respostas']) {
  const resultado = renderRota('/admin/areas', { sessao, respostas, arvore: arvoreTeste })
  falsaAtual = resultado.falsa
  return resultado
}

describe('renderRota + apiFalsa (rota de teste /admin/areas)', () => {
  it('renderiza as áreas com os dados e envia o POST com o body esperado', async () => {
    const { falsa } = montar({
      'GET /areas': { itens: [area(1, 'Financeiro'), area(2, 'Suporte')], total: 2, pagina: 1, porPagina: 20 },
      'POST /areas': () =>
        new Response(JSON.stringify(area(3, 'Jurídico')), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        }),
    })

    expect(await screen.findByText('Financeiro')).toBeInTheDocument()
    expect(screen.getByText('Suporte')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Nome da área'), { target: { value: 'Jurídico' } })
    fireEvent.click(screen.getByRole('button', { name: 'Criar área' }))

    await waitFor(() =>
      expect(falsa.chamadas).toContainEqual({
        metodo: 'POST',
        url: '/api/v1/areas',
        corpo: { nome: 'Jurídico', atende: true, ativo: true, jornadaId: null },
      }),
    )
    expect(falsa.chamadas.filter((c) => c.metodo === 'POST')).toHaveLength(1)
  })
})
