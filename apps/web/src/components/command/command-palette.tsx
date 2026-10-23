import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ACOES, lerRecentes, registrarRecente } from '@/features/busca/acoes'
import { buscaValida, useBusca } from '@/features/busca/queries'
import { useDebounce } from '@/hooks/use-debounce'
import { IR_PARA } from '@/lib/atalhos'

export interface CommandPaletteProps {
  aberto: boolean
  aoMudar: (aberto: boolean) => void
  usuarioId: number
}

const ATRASO_MS = 200

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR')
}

/** Busca Ctrl/⌘ K (§3.9): "Abrir #N", Chamados, Base, Ativos, Pessoas, Ir para, Ações e Recentes. */
export function CommandPalette({ aberto, aoMudar, usuarioId }: CommandPaletteProps) {
  const navigate = useNavigate()
  const [texto, setTexto] = useState('')
  const termo = useDebounce(texto, ATRASO_MS)
  const busca = useBusca(buscaValida(termo) ? termo : '')
  const numero = /^#?(\d+)$/.exec(texto.trim())?.[1]
  const filtro = normalizar(texto.trim())
  const resultados = busca.data

  function fechar(abrir: boolean) {
    if (!abrir) setTexto('')
    aoMudar(abrir)
  }

  function irParaChamado(chamadoId: number, rotulo: string) {
    registrarRecente(usuarioId, { chamadoId, rotulo })
    fechar(false)
    void navigate({ to: '/chamados/$chamadoId', params: { chamadoId } })
  }

  const irPara = IR_PARA.filter((d) => filtro === '' || normalizar(d.rotulo).includes(filtro))
  const acoes = ACOES.filter((a) => filtro === '' || normalizar(a.rotulo).includes(filtro))
  const recentes = filtro === '' ? lerRecentes(usuarioId) : []

  return (
    <Dialog open={aberto} onOpenChange={fechar}>
      <DialogContent className="overflow-hidden p-0" showCloseButton={false}>
        <DialogHeader className="sr-only">
          <DialogTitle>Busca</DialogTitle>
          <DialogDescription>
            Pesquise chamados, artigos, equipamentos e pessoas, ou vá para uma área.
          </DialogDescription>
        </DialogHeader>
        <Command shouldFilter={false}>
          <CommandInput
            value={texto}
            onValueChange={setTexto}
            placeholder="Pesquisar chamados, artigos, equipamentos e pessoas"
          />
          <CommandList>
            <CommandEmpty>Nada encontrado.</CommandEmpty>
            {numero ? (
              <CommandGroup heading="Ir direto">
                <CommandItem
                  value={`abrir-${numero}`}
                  onSelect={() => irParaChamado(Number(numero), `Chamado #${numero}`)}
                >
                  Abrir #{numero}
                </CommandItem>
              </CommandGroup>
            ) : null}
            {recentes.length > 0 ? (
              <CommandGroup heading="Recentes">
                {recentes.map((r) => (
                  <CommandItem
                    key={r.chamadoId}
                    value={`recente-${r.chamadoId}`}
                    onSelect={() => irParaChamado(r.chamadoId, r.rotulo)}
                  >
                    {r.rotulo}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {resultados && resultados.chamados.length > 0 ? (
              <CommandGroup heading="Chamados">
                {resultados.chamados.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={`chamado-${c.id}`}
                    onSelect={() => irParaChamado(c.id, `#${c.id} · ${c.assunto}`)}
                  >
                    <span className="truncate">
                      #{c.id} · {c.assunto}
                    </span>
                    <span className="ml-auto text-xs text-muted-foreground">{c.statusNome}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {resultados && resultados.artigos.length > 0 ? (
              <CommandGroup heading="Base">
                {resultados.artigos.map((a) => (
                  <CommandItem
                    key={a.id}
                    value={`artigo-${a.id}`}
                    onSelect={() => {
                      fechar(false)
                      void navigate({ to: '/conhecimento' })
                    }}
                  >
                    {a.titulo}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {resultados && resultados.ativos.length > 0 ? (
              <CommandGroup heading="Ativos">
                {resultados.ativos.map((a) => (
                  <CommandItem
                    key={a.id}
                    value={`ativo-${a.id}`}
                    onSelect={() => {
                      fechar(false)
                      void navigate({ to: '/inventario' })
                    }}
                  >
                    {a.etiqueta}
                    {a.modelo ? <span className="ml-auto text-xs text-muted-foreground">{a.modelo}</span> : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {resultados && resultados.usuarios.length > 0 ? (
              <CommandGroup heading="Pessoas">
                {resultados.usuarios.map((u) => (
                  <CommandItem
                    key={u.id}
                    value={`pessoa-${u.id}`}
                    onSelect={() => {
                      fechar(false)
                      void navigate({ to: '/admin/usuarios' })
                    }}
                  >
                    {u.nome}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {irPara.length > 0 ? (
              <CommandGroup heading="Ir para">
                {irPara.map((d) => (
                  <CommandItem
                    key={d.tecla}
                    value={`ir-${d.tecla}`}
                    onSelect={() => {
                      fechar(false)
                      void navigate({ to: d.to })
                    }}
                  >
                    {d.rotulo}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {acoes.length > 0 ? (
              <CommandGroup heading="Ações">
                {acoes.map((a) => (
                  <CommandItem
                    key={a.id}
                    value={`acao-${a.id}`}
                    onSelect={() => {
                      fechar(false)
                      void navigate({ to: a.to })
                    }}
                  >
                    {a.rotulo}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
