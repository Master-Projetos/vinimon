import { type Mencao, serializarComposer } from '@vinimon/shared'
import { Paperclip, Send, X } from 'lucide-react'
import { type ClipboardEvent, type KeyboardEvent, useId, useRef, useState } from 'react'
import { AutosizeTextarea } from '@/components/form/autosize-textarea'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useDebounce } from '@/hooks/use-debounce'
import { type Mencionavel, useMencionaveis } from '../queries'
import { MentionPopover } from './mention-popover'

export interface ComposerProps {
  chamadoId: number
  enviarComEnter: boolean
  /** Toggle "Interno": só para a equipe (`acoes.comentarInterno`). */
  podeInterno: boolean
  /** Anexos: só com `anexos.habilitados` e `acoes.anexar`. */
  podeAnexar: boolean
  anexos: File[]
  aoMudarAnexos: (arquivos: File[]) => void
  aoEnviar: (envio: { texto: string; interno: boolean; arquivos: File[] }) => void
  /** A pessoa está digitando (a cada tecla; quem chama faz o throttle). */
  aoDigitar?: (interno: boolean) => void
  /** Blur ou envio: parou de digitar. */
  aoParar?: () => void
}

/** Texto logo antes do cursor que começa com `@` e ainda não tem espaço: é a busca de menção em andamento. */
export function mencaoEmAndamento(texto: string, cursor: number): { inicio: number; termo: string } | null {
  const antes = texto.slice(0, cursor)
  const termo = /(?:^|\s)@([^\s@]{0,40})$/.exec(antes)?.[1]
  if (termo === undefined) return null
  return { inicio: cursor - termo.length - 1, termo }
}

export function Composer({
  chamadoId,
  enviarComEnter,
  podeInterno,
  podeAnexar,
  anexos,
  aoMudarAnexos,
  aoEnviar,
  aoDigitar,
  aoParar,
}: ComposerProps) {
  const [texto, setTexto] = useState('')
  const [interno, setInterno] = useState(false)
  const [selecionadas, setSelecionadas] = useState<Mencao[]>([])
  const [busca, setBusca] = useState<{ inicio: number; termo: string } | null>(null)
  const [indice, setIndice] = useState(0)
  const campo = useRef<HTMLTextAreaElement>(null)
  const arquivoInput = useRef<HTMLInputElement>(null)
  const idLista = useId()
  const chaves = useRef(new WeakMap<File, string>())
  const chaveDe = (f: File): string => {
    const atual = chaves.current.get(f)
    if (atual) return atual
    const nova = crypto.randomUUID()
    chaves.current.set(f, nova)
    return nova
  }

  const termo = useDebounce(busca?.termo ?? '', 150)
  const pessoas = useMencionaveis(chamadoId, termo, interno, busca !== null)
  const opcoes = pessoas.data ?? []
  const aberto = busca !== null

  function atualizarBusca(valor: string, cursor: number) {
    const b = mencaoEmAndamento(valor, cursor)
    setBusca(b)
    if (b) setIndice(0)
  }

  function escolher(pessoa: Mencionavel) {
    if (!busca) return
    const cursor = campo.current?.selectionStart ?? texto.length
    const novo = `${texto.slice(0, busca.inicio)}@${pessoa.nome} ${texto.slice(cursor)}`
    setTexto(novo)
    setSelecionadas((atual) =>
      atual.some((m) => m.id === pessoa.id) ? atual : [...atual, { id: pessoa.id, nome: pessoa.nome }],
    )
    setBusca(null)
    const posicao = busca.inicio + pessoa.nome.length + 2
    requestAnimationFrame(() => {
      campo.current?.focus()
      campo.current?.setSelectionRange(posicao, posicao)
    })
  }

  function enviar() {
    const visivel = texto.trim()
    if (visivel === '' && anexos.length === 0) return
    const final = visivel === '' ? 'Anexos enviados.' : serializarComposer(visivel, selecionadas)
    aoEnviar({ texto: final, interno, arquivos: anexos })
    aoParar?.()
    setTexto('')
    setSelecionadas([])
    setBusca(null)
    aoMudarAnexos([])
  }

  function aoTeclar(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (aberto && opcoes.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setIndice((i) => (i + 1) % opcoes.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setIndice((i) => (i - 1 + opcoes.length) % opcoes.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        const pessoa = opcoes[indice]
        if (pessoa) escolher(pessoa)
        return
      }
    }
    if (aberto && e.key === 'Escape') {
      e.preventDefault()
      setBusca(null)
      return
    }
    if (e.key !== 'Enter') return
    const ctrl = e.ctrlKey || e.metaKey
    if (enviarComEnter ? !e.shiftKey && !e.nativeEvent.isComposing : ctrl) {
      e.preventDefault()
      enviar()
    }
  }

  function aoColar(e: ClipboardEvent<HTMLTextAreaElement>) {
    if (!podeAnexar) return
    const imagens = [...e.clipboardData.items]
      .filter((i) => i.kind === 'file' && i.type.startsWith('image/'))
      .map((i) => i.getAsFile())
      .filter((f): f is File => f !== null)
    if (imagens.length === 0) return
    e.preventDefault()
    aoMudarAnexos([...anexos, ...imagens])
  }

  return (
    <form
      aria-label="Escrever mensagem"
      className="flex flex-col gap-2 border-t bg-background p-3"
      onSubmit={(e) => {
        e.preventDefault()
        enviar()
      }}
    >
      {anexos.length > 0 ? (
        <ul aria-label="Anexos da mensagem" className="flex flex-wrap gap-2">
          {anexos.map((a) => (
            <li key={chaveDe(a)} className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs">
              <span className="max-w-40 truncate">{a.name}</span>
              <button
                type="button"
                aria-label={`Remover ${a.name}`}
                className="rounded-sm p-0.5 hover:bg-accent"
                onClick={() => aoMudarAnexos(anexos.filter((x) => x !== a))}
              >
                <X aria-hidden="true" className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="relative">
        {aberto ? (
          <MentionPopover
            opcoes={opcoes}
            indiceAtivo={indice}
            carregando={pessoas.isFetching}
            aoEscolher={escolher}
            aoPassarMouse={setIndice}
          />
        ) : null}
        <AutosizeTextarea
          ref={campo}
          aria-label="Mensagem"
          placeholder={interno ? 'Nota interna (só a equipe vê)' : 'Escreva uma mensagem. Use @ para mencionar.'}
          value={texto}
          maxLength={20_000}
          onChange={(e) => {
            setTexto(e.target.value)
            if (e.target.value !== '') aoDigitar?.(interno)
            atualizarBusca(e.target.value, e.target.selectionStart)
          }}
          onClick={(e) => atualizarBusca(texto, e.currentTarget.selectionStart)}
          onKeyDown={aoTeclar}
          onBlur={() => aoParar?.()}
          onPaste={aoColar}
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          {podeAnexar ? (
            <>
              <input
                ref={arquivoInput}
                type="file"
                multiple
                hidden
                data-testid="anexo-input"
                onChange={(e) => {
                  aoMudarAnexos([...anexos, ...Array.from(e.target.files ?? [])])
                  e.target.value = ''
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Anexar arquivo"
                onClick={() => arquivoInput.current?.click()}
              >
                <Paperclip aria-hidden="true" />
              </Button>
            </>
          ) : null}
          {podeInterno ? (
            <div className="flex items-center gap-2">
              <Switch id={`${idLista}-interno`} checked={interno} onCheckedChange={setInterno} />
              <Label htmlFor={`${idLista}-interno`}>Interno</Label>
            </div>
          ) : null}
        </div>
        <Button type="submit" disabled={texto.trim() === '' && anexos.length === 0}>
          <Send aria-hidden="true" /> Enviar
        </Button>
      </div>
    </form>
  )
}
