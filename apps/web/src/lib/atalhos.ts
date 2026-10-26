import type { LinkProps } from '@tanstack/react-router'

/** Destinos de `g` + letra (§6.2). Os mesmos rótulos aparecem na app bar. */
export const IR_PARA: ReadonlyArray<{ tecla: string; rotulo: string; to: LinkProps['to'] }> = [
  { tecla: 'a', rotulo: 'Atividade', to: '/atividade' },
  { tecla: 'c', rotulo: 'Chamados', to: '/chamados' },
  { tecla: 'p', rotulo: 'Painel', to: '/painel' },
  { tecla: 'b', rotulo: 'Base de conhecimento', to: '/conhecimento' },
  { tecla: 'i', rotulo: 'Inventário', to: '/inventario' },
  { tecla: 'r', rotulo: 'Relatórios', to: '/relatorios' },
  { tecla: 'd', rotulo: 'Administração', to: '/admin' },
]

/** Lista mostrada no diálogo de atalhos. */
export const ATALHOS: ReadonlyArray<{ teclas: string[]; descricao: string }> = [
  { teclas: ['mod', 'K'], descricao: 'Abrir a busca' },
  { teclas: ['/'], descricao: 'Abrir a busca' },
  { teclas: ['c'], descricao: 'Novo chamado' },
  { teclas: ['?'], descricao: 'Mostrar os atalhos' },
  ...IR_PARA.map((d) => ({ teclas: ['g', d.tecla], descricao: `Ir para ${d.rotulo}` })),
]

/** Atalhos de letra não valem com o foco em campo de texto ou área editável. */
export function ehCampoDeTexto(alvo: EventTarget | null): boolean {
  if (!(alvo instanceof HTMLElement)) return false
  if (alvo.isContentEditable || alvo.contentEditable === 'true') return true
  const tag = alvo.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}
