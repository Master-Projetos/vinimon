import { type Browser, type BrowserContext, expect, type Page, test } from '@playwright/test'
import { ORIGEM_E2E } from './ajudantes'

const SESSAO = (login: string) => `e2e/.auth/${login}.json`

interface Aba {
  contexto: BrowserContext
  pagina: Page
}

/** Contexto próprio (cookies e storage separados) para cada pessoa, reaproveitando o login do auth.setup. */
async function abrir(
  browser: Browser,
  login: string,
  antes?: (contexto: BrowserContext) => Promise<void>,
): Promise<Aba> {
  const contexto = await browser.newContext({ baseURL: ORIGEM_E2E, storageState: SESSAO(login) })
  await antes?.(contexto)
  return { contexto, pagina: await contexto.newPage() }
}

/** O USUARIO abre um chamado pela tela de abertura e devolve o id. */
async function abrirChamado(pagina: Page, assunto: string): Promise<string> {
  await pagina.goto('/chamados/novo')
  await pagina.getByRole('combobox', { name: /Tipo de problema/ }).click()
  await pagina.getByRole('option', { name: /Sem acesso à rede/ }).click()
  await pagina.getByLabel('Assunto').fill(assunto)
  await pagina.getByLabel('Descrição').fill('Chamado criado pelo E2E de tempo real.')
  await pagina.getByRole('button', { name: 'Abrir chamado', exact: true }).click()
  await expect(pagina).toHaveURL(/\/chamados\/\d+$/)
  const id = /\/chamados\/(\d+)$/.exec(pagina.url())?.[1]
  expect(id).toBeDefined()
  return id ?? ''
}

async function assumir(pagina: Page, id: string): Promise<void> {
  await pagina.goto(`/chamados/${id}`)
  await pagina.getByRole('button', { name: 'Assumir', exact: true }).click()
  await expect(pagina.getByText('Chamado assumido por Operador E2E')).toBeVisible()
}

const mensagemDe = (pagina: Page) => pagina.getByRole('textbox', { name: 'Mensagem' })

test('TM1, TM3 e TM4: digitando, mensagem sem recarregar e "Visto por"', async ({ browser }) => {
  test.setTimeout(90_000)
  const usuario = await abrir(browser, 'usuario')
  const operador = await abrir(browser, 'operador')
  const u = usuario.pagina
  const o = operador.pagina

  const id = await abrirChamado(u, 'Tempo real: conversa (E2E)')
  await assumir(o, id)
  await expect(mensagemDe(u)).toBeVisible()

  // TM3: o que a pessoa digita aparece como "está digitando…" na outra tela, e some quando ela para.
  await mensagemDe(u).pressSequentially('Preciso de ajuda')
  await expect(o.getByText('Usuário E2E está digitando…')).toBeVisible()
  await mensagemDe(u).fill('')
  await mensagemDe(u).blur()
  await expect(o.getByText('Usuário E2E está digitando…')).toBeHidden()

  // TM1: a mensagem chega na outra tela sem recarregar.
  const resposta = 'Já estou verificando o seu acesso.'
  await mensagemDe(o).fill(resposta)
  await o.getByRole('button', { name: 'Enviar', exact: true }).click()
  await expect(o.getByText(resposta)).toBeVisible()
  await expect(u.getByText(resposta)).toBeVisible()

  // TM4: com a mensagem à vista na aba ativa do usuário, o operador vê "Visto por" em poucos segundos (debounce de 1 s + ida e volta; medido ~1,4 s).
  await expect(o.getByText(/^Visto por Usuário/)).toBeVisible({ timeout: 3_000 })

  await usuario.contexto.close()
  await operador.contexto.close()
})

test('TM2: sem atividade, a presença do operador passa a Ausente', async ({ browser }) => {
  test.setTimeout(90_000)
  const operador = await abrir(browser, 'operador')
  const o = operador.pagina
  const menu = o.getByRole('button', { name: 'Menu de Operador E2E' })

  // O relógio falso precisa existir antes da navegação; o tempo segue correndo normalmente até o avanço.
  await o.clock.install()
  await o.goto('/chamados')
  await expect(menu).toContainText('Disponível')

  // Aba oculta: `visibilityState` é somente leitura, então a propriedade é redefinida antes do evento.
  await o.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await o.clock.fastForward('05:01')

  // O servidor recalcula e devolve o estado: o indicador do avatar muda sem recarregar.
  await expect(menu).toContainText('Ausente')
  await operador.contexto.close()
})

test('TM7 e T69: a notificação do sistema não leva o texto e a permissão só é pedida no clique', async ({
  browser,
}) => {
  test.setTimeout(90_000)
  const segredo = 'Texto-confidencial-do-comentario-7731'
  const usuario = await abrir(browser, 'usuario')
  // `Notification` simulado: guarda o que o app pede e o que exibe; a janela está sem foco, então não vira toast.
  const operador = await abrir(browser, 'operador', (contexto) =>
    contexto.addInitScript(() => {
      const registro: { pedidos: number; exibidas: { titulo: string; opcoes: unknown }[] } = {
        pedidos: 0,
        exibidas: [],
      }
      class NotificacaoFalsa {
        static permission: NotificationPermission = 'default'
        static requestPermission(): Promise<NotificationPermission> {
          registro.pedidos += 1
          NotificacaoFalsa.permission = 'granted'
          return Promise.resolve('granted')
        }
        constructor(titulo: string, opcoes?: NotificationOptions) {
          registro.exibidas.push({ titulo, opcoes })
        }
      }
      Reflect.set(window, 'Notification', NotificacaoFalsa)
      Reflect.set(window, '__registroNotificacao', registro)
      document.hasFocus = () => false
    }),
  )
  const u = usuario.pagina
  const o = operador.pagina
  const registro = () =>
    o.evaluate(() => Reflect.get(window, '__registroNotificacao') as { pedidos: number; exibidas: unknown[] })

  const id = await abrirChamado(u, 'Tempo real: notificação (E2E)')
  await assumir(o, id)
  await o.goto('/chamados')

  // A permissão não é pedida ao carregar a página: só depois do clique no botão do sino.
  expect((await registro()).pedidos).toBe(0)
  await o.getByRole('button', { name: /^Notificações/ }).click()
  expect((await registro()).pedidos).toBe(0)
  await o.getByRole('button', { name: 'Ativar notificações na área de trabalho' }).click()
  await expect.poll(async () => (await registro()).pedidos).toBe(1)
  await o.keyboard.press('Escape')

  // O usuário comenta; o operador (fora do chamado e sem foco) recebe a notificação do sistema.
  await u.goto(`/chamados/${id}`)
  await mensagemDe(u).fill(segredo)
  await u.getByRole('button', { name: 'Enviar', exact: true }).click()
  await expect(u.getByText(segredo)).toBeVisible()

  await expect.poll(async () => (await registro()).exibidas.length).toBe(1)
  const [exibida] = (await registro()).exibidas
  const texto = JSON.stringify(exibida)
  expect(texto).not.toContain(segredo)
  expect(texto).toContain('Usuário E2E comentou')

  await usuario.contexto.close()
  await operador.contexto.close()
})
