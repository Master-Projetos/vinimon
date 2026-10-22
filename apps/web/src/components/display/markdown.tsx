import { criarMencaoRe } from '@vinimon/shared'
import ReactMarkdown, { type Components, defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'
import { MentionChip } from './mention-chip'

const PREFIXO_MENCAO = 'usuario:'
const HREF_MENCAO = /^usuario:(\d{1,10})$/

/** Troca `@[Nome](usuario:ID)` por `[@Nome](usuario:ID)`, que o Markdown lê como link. */
export const converterMencoes = (texto: string): string =>
  texto.replace(criarMencaoRe(), (_, nome: string, id: string) => `[@${nome}](usuario:${id})`)

/** `usuario:` passa para o componente `a`; qualquer outro endereço segue o `defaultUrlTransform` (javascript: vira vazio). */
export const urlTransformSeguro = (url: string): string =>
  url.startsWith(PREFIXO_MENCAO) ? url : defaultUrlTransform(url)

const componentes: Components = {
  a: ({ href, children, node: _node, ...resto }) => {
    if (href?.startsWith(PREFIXO_MENCAO)) {
      const id = HREF_MENCAO.exec(href)?.[1]
      if (id === undefined || typeof children !== 'string') return <span>{children}</span>
      return <MentionChip id={Number(id)} nome={children.replace(/^@/, '')} />
    }
    return (
      <a {...resto} href={href} target="_blank" rel="noopener noreferrer nofollow">
        {children}
      </a>
    )
  },
}

export interface MarkdownProps {
  texto: string
  className?: string
}

/** Markdown (GFM) sem HTML bruto: react-markdown sem rehype-raw (S78). */
export function Markdown({ texto, className }: MarkdownProps) {
  return (
    <div className={cn('break-words text-sm', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={urlTransformSeguro} components={componentes}>
        {converterMencoes(texto)}
      </ReactMarkdown>
    </div>
  )
}
