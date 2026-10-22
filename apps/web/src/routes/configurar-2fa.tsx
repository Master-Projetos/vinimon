import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/configurar-2fa')({
  component: Configurar2faPagina,
})

function Configurar2faPagina() {
  return <p>Configuração de autenticação em dois fatores.</p>
}
