import { createFileRoute, useRouteContext } from '@tanstack/react-router'
import { DENSIDADES, TEMAS } from '@vinimon/shared'
import { toast } from 'sonner'
import { type Densidade, useDensidade } from '@/components/theme/density-provider'
import { type Tema, useTheme } from '@/components/theme/theme-provider'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Switch } from '@/components/ui/switch'
import { useAtualizarMe } from '@/features/perfil/queries'
import { ErroApi } from '@/lib/api'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/_app/perfil/aparencia')({
  component: Aparencia,
})

const ROTULOS_TEMA: Record<Tema, string> = { claro: 'Claro', escuro: 'Escuro', sistema: 'Igual ao sistema' }
const ROTULOS_DENSIDADE: Record<Densidade, string> = {
  confortavel: 'Confortável',
  compacta: 'Compacta',
}

function CartaoOpcao({ id, valor, rotulo, marcado }: { id: string; valor: string; rotulo: string; marcado: boolean }) {
  return (
    <Label
      htmlFor={id}
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm',
        marcado && 'border-primary bg-accent',
      )}
    >
      <RadioGroupItem id={id} value={valor} />
      {rotulo}
    </Label>
  )
}

function Aparencia() {
  const { sessao } = useRouteContext({ from: '/_app' })
  const usuario = sessao.usuario
  const { tema, definirTema } = useTheme()
  const { densidade, definirDensidade } = useDensidade()
  const atualizar = useAtualizarMe()
  if (!usuario) return null

  const avisarErro = (e: unknown) => toast.error(e instanceof ErroApi ? e.message : 'Não foi possível salvar.')

  function trocarTema(valor: string) {
    const escolhido = TEMAS.find((t) => t === valor)
    if (!escolhido) return
    definirTema(escolhido)
    atualizar.mutate({ tema: escolhido }, { onError: avisarErro })
  }

  function trocarDensidade(valor: string) {
    const escolhida = DENSIDADES.find((d) => d === valor)
    if (!escolhida) return
    definirDensidade(escolhida === 'COMPACTA' ? 'compacta' : 'confortavel')
    atualizar.mutate({ densidade: escolhida }, { onError: avisarErro })
  }

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="titulo-tema" className="flex flex-col gap-3">
        <h2 id="titulo-tema" className="text-sm font-semibold">
          Tema
        </h2>
        <RadioGroup
          aria-labelledby="titulo-tema"
          value={tema.toUpperCase()}
          onValueChange={trocarTema}
          className="grid gap-2 sm:grid-cols-3"
        >
          {TEMAS.map((t) => (
            <CartaoOpcao
              key={t}
              id={`tema-${t}`}
              valor={t}
              rotulo={ROTULOS_TEMA[t.toLowerCase() as Tema]}
              marcado={tema.toUpperCase() === t}
            />
          ))}
        </RadioGroup>
      </section>

      <section aria-labelledby="titulo-densidade" className="flex flex-col gap-3">
        <h2 id="titulo-densidade" className="text-sm font-semibold">
          Densidade
        </h2>
        <RadioGroup
          aria-labelledby="titulo-densidade"
          value={densidade.toUpperCase()}
          onValueChange={trocarDensidade}
          className="grid gap-2 sm:grid-cols-2"
        >
          {DENSIDADES.map((d) => (
            <CartaoOpcao
              key={d}
              id={`densidade-${d}`}
              valor={d}
              rotulo={ROTULOS_DENSIDADE[d.toLowerCase() as Densidade]}
              marcado={densidade.toUpperCase() === d}
            />
          ))}
        </RadioGroup>
      </section>

      <section aria-labelledby="titulo-enter" className="flex flex-col gap-3">
        <h2 id="titulo-enter" className="text-sm font-semibold">
          Conversa
        </h2>
        <div className="flex items-center gap-2">
          <Switch
            id="enter-envia"
            checked={usuario.enviarComEnter}
            onCheckedChange={(v) => atualizar.mutate({ enviarComEnter: v }, { onError: avisarErro })}
          />
          <Label htmlFor="enter-envia">Enter envia a mensagem (Shift+Enter quebra a linha)</Label>
        </div>
      </section>
    </div>
  )
}
