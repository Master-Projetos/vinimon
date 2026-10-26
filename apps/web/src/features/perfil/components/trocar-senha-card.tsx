import { toast } from 'sonner'
import { TrocarSenhaForm } from '@/features/auth/components/trocar-senha-form'

export interface TrocarSenhaCardProps {
  login: string
}

/** Troca de senha pelo perfil. As outras sessões são encerradas pelo servidor (S24). */
export function TrocarSenhaCard({ login }: TrocarSenhaCardProps) {
  return (
    <section aria-labelledby="titulo-senha" className="flex flex-col gap-3 rounded-md border p-4">
      <h2 id="titulo-senha" className="text-sm font-semibold">
        Trocar senha
      </h2>
      <p className="text-sm text-muted-foreground">Ao trocar a senha, as outras sessões abertas são encerradas.</p>
      <TrocarSenhaForm
        login={login}
        aoTrocar={() => toast.success('Senha alterada. As outras sessões foram encerradas.')}
      />
    </section>
  )
}
