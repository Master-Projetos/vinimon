import type { ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'

interface AuthLayoutProps {
  titulo: string
  descricao?: string
  children: ReactNode
}

/** Moldura das telas de autenticação: cartão centralizado com a marca Vinimon. */
export function AuthLayout({ titulo, descricao, children }: AuthLayoutProps) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        <p className="mb-6 text-center text-2xl font-semibold tracking-tight">Vinimon</p>
        <Card>
          <CardHeader>
            <h1 className="font-semibold text-lg leading-none">{titulo}</h1>
            {descricao ? <CardDescription>{descricao}</CardDescription> : null}
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
      </div>
    </main>
  )
}
