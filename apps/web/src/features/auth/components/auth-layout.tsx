import type { ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

/** Moldura das telas sem sessão (login, 2FA, troca de senha): cartão central sobre o fundo da aplicação. */
export function AuthLayout({
  titulo,
  descricao,
  children,
}: {
  titulo: string
  descricao?: string
  children: ReactNode
}) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-sm space-y-6">
        <p className="text-center font-semibold text-lg tracking-tight">Vinimon</p>
        <Card>
          <CardHeader>
            <CardTitle role="heading" aria-level={1} className="text-xl">
              {titulo}
            </CardTitle>
            {descricao ? <CardDescription>{descricao}</CardDescription> : null}
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
      </div>
    </main>
  )
}
