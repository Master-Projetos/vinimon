import { createFileRoute, notFound, Outlet } from '@tanstack/react-router'
import { z } from 'zod'

export const Route = createFileRoute('/_app/chamados/$chamadoId')({
  params: {
    parse: (p) => {
      const resultado = z.coerce.number().int().positive().safeParse(p.chamadoId)
      if (!resultado.success) throw notFound()
      return { chamadoId: resultado.data }
    },
  },
  component: Outlet,
})
