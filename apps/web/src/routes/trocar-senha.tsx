import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/trocar-senha')({
  component: TrocarSenhaPagina,
})

function TrocarSenhaPagina() {
  return <p>Troca de senha obrigatória.</p>
}
