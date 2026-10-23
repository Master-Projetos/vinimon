import { createFileRoute, redirect } from '@tanstack/react-router'

// Equipe (ADMIN e OPERADOR) começa em Atividade; USUARIO, em Chamados (§6.2).
export const Route = createFileRoute('/_app/')({
  beforeLoad: ({ context }) => {
    const perfil = context.sessao.usuario?.perfil
    switch (perfil) {
      case 'USUARIO':
        throw redirect({ to: '/chamados' })
      case 'ADMIN':
      case 'OPERADOR':
        throw redirect({ to: '/atividade' })
      case undefined:
        throw redirect({ to: '/sem-permissao' })
    }
  },
})
