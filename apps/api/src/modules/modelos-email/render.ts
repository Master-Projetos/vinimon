import { VARIAVEIS_EMAIL, type VariavelEmail } from '@vinimon/shared'

/** Valores das variáveis. Variável sem valor informado sai literal, como a desconhecida. */
export type ValoresEmail = Partial<Record<VariavelEmail, string>>

export interface ModeloTexto {
  assunto: string
  corpoTexto: string
}

export interface EmailRenderizado {
  assunto: string
  texto: string
  html: string
}

const MARCADOR = /\{\{([A-Za-z]+)\}\}/g

const ehVariavel = (nome: string): nome is VariavelEmail => (VARIAVEIS_EMAIL as readonly string[]).includes(nome)

/** Troca só as variáveis da lista fechada. O valor substituído não é varrido de novo. */
export function substituir(modelo: string, valores: ValoresEmail): string {
  return modelo.replace(MARCADOR, (marcador, nome: string) => {
    if (!ehVariavel(nome)) return marcador
    return valores[nome] ?? marcador
  })
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/** Escape de HTML. Quebras de linha viram `<br>` depois do escape, então só a própria quebra gera a tag. */
export function escaparHtml(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c).replace(/\r\n|\r|\n/g, '<br>')
}

/** Monta assunto, texto e HTML do e-mail. O HTML sai do texto já substituído, com escape. */
export function render(modelo: ModeloTexto, valores: ValoresEmail): EmailRenderizado {
  const assunto = substituir(modelo.assunto, valores)
  const texto = substituir(modelo.corpoTexto, valores)
  return { assunto, texto, html: escaparHtml(texto) }
}
