import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { type BrowserContext, expect, type Page, test } from '@playwright/test'
import { BANCO_E2E, CSRF_SECRET_E2E, ENCRYPTION_KEY_E2E, ORIGEM_E2E } from './ajudantes'
import {
  aguardarRota,
  clienteApi,
  criarRecursos,
  criarUsuarioNovo,
  entrarAteTrocaDeSenha,
  type Recursos,
  rotasLogadas,
  SESSAO,
  trocarSenhaAteConfigurar2fa,
} from './rotas'

declare global {
  interface Window {
    __csp?: string[]
    __xss?: number
  }
}

const URL_E2E = `postgresql://vinimon:vinimon@localhost:5432/${BANCO_E2E}`

/** Registra, em `window.__csp`, toda violação da Content-Security-Policy que o navegador relatar. */
async function observarCsp(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    window.__csp = []
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__csp?.push(`${e.violatedDirective} ${e.blockedURI}`)
    })
  })
}

const violacoes = (page: Page): Promise<string[]> => page.evaluate(() => window.__csp ?? [])

test.describe('T66: nenhuma violação de CSP em nenhuma tela', () => {
  test('rotas públicas e de primeiro acesso', async ({ browser }) => {
    test.setTimeout(90_000)
    const usuario = await criarUsuarioNovo(browser, 'csp-fluxo')
    const contexto = await browser.newContext({ baseURL: ORIGEM_E2E })
    await observarCsp(contexto)
    const page = await contexto.newPage()
    try {
      await page.goto('/login')
      await expect(page.getByLabel('Login')).toBeVisible()
      expect(await violacoes(page)).toEqual([])

      await entrarAteTrocaDeSenha(page, usuario)
      await aguardarRota(page)
      expect(await violacoes(page)).toEqual([])

      await trocarSenhaAteConfigurar2fa(page, usuario)
      await aguardarRota(page)
      expect(await violacoes(page)).toEqual([])
    } finally {
      await contexto.close()
    }
  })

  test.describe('com sessão de admin', () => {
    test.use({ storageState: SESSAO('admin-e2e') })

    test('todas as rotas e os diálogos', async ({ browser, context, page }) => {
      test.setTimeout(240_000)
      const recursos = await criarRecursos(browser, 'csp')
      await observarCsp(context)

      for (const rota of rotasLogadas(recursos)) {
        await test.step(rota, async () => {
          await page.goto(rota)
          await aguardarRota(page)
          expect(await violacoes(page), `violações de CSP em ${rota}`).toEqual([])
        })
      }

      // Diálogos, menus e painéis do Radix abrem num portal fora do <main>.
      await page.goto(`/chamados/${recursos.chamadoId}`)
      await aguardarRota(page)

      await page.getByRole('button', { name: 'Ajuda e atalhos de teclado' }).click()
      await expect(page.getByRole('dialog', { name: 'Atalhos de teclado' })).toBeVisible()
      await page.keyboard.press('Escape')

      await page.keyboard.press('ControlOrMeta+K')
      await expect(page.getByRole('dialog', { name: 'Busca' })).toBeVisible()
      await page.keyboard.press('Escape')

      await page.getByRole('button', { name: /^Menu de / }).click()
      await expect(page.getByRole('menu')).toBeVisible()
      await page.keyboard.press('Escape')

      await page.getByRole('button', { name: /^Notificações/ }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await page.keyboard.press('Escape')
      expect(await violacoes(page), 'violações de CSP nos diálogos do chamado').toEqual([])

      await page.goto('/admin/areas')
      await aguardarRota(page)
      await page.getByRole('button', { name: 'Nova área' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      expect(await violacoes(page), 'violações de CSP no Sheet de cadastro').toEqual([])
    })
  })
})

test.describe('T67: XSS armazenado não executa', () => {
  test.use({ storageState: SESSAO('admin-e2e') })

  const ASSUNTO = '<img src=x onerror="window.__xss=1"> <script>window.__xss=2</script>'
  const COMENTARIO = [
    '<img src=x onerror="window.__xss=3">',
    '<script>window.__xss=4</script>',
    '[clique aqui](javascript:window.__xss=5)',
    '[de novo](JaVaScRiPt:window.__xss=6)',
  ].join('\n\n')

  test('assunto, comentário e link javascript: aparecem como texto inerte', async ({ browser, context, page }) => {
    test.setTimeout(90_000)
    const api = clienteApi(context.request)
    const problemas = await api.obter<{ itens: { id: number }[] }>('/problemas?porPagina=1')
    const chamado = await api.criar<{ id: number }>('/chamados', {
      problemaId: problemas.itens[0]?.id,
      assunto: ASSUNTO,
      descricao: 'Chamado do teste de XSS.',
    })
    await api.criar(`/chamados/${chamado.id}/assentamentos`, {
      texto: COMENTARIO,
      interno: false,
      clienteId: randomUUID(),
    })

    const dialogos: string[] = []
    page.on('dialog', (d) => {
      dialogos.push(d.message())
      void d.dismiss()
    })

    for (const rota of ['/chamados', `/chamados/${chamado.id}`, `/chamados/${chamado.id}/historico`, '/atividade']) {
      await page.goto(rota)
      await aguardarRota(page)
      expect(await page.evaluate(() => window.__xss), `window.__xss em ${rota}`).toBeUndefined()
    }

    await page.goto(`/chamados/${chamado.id}`)
    await aguardarRota(page)
    // O assunto aparece literalmente, como texto, no título.
    await expect(page.getByRole('heading', { level: 1 })).toContainText('<img src=x onerror="window.__xss=1">')
    // Nenhum elemento criado a partir do HTML do assunto ou do comentário.
    await expect(page.locator('main img[src="x"]')).toHaveCount(0)
    await expect(page.locator('main script')).toHaveCount(0)

    // Links com esquema javascript: perdem o href (urlTransform); clicar neles não executa nada.
    const hrefs = await page.locator('main a').evaluateAll((links) => links.map((a) => a.getAttribute('href') ?? ''))
    expect(hrefs.filter((h) => /^\s*javascript:/i.test(h))).toEqual([])
    for (const nome of ['clique aqui', 'de novo']) {
      const link = page.getByText(nome, { exact: true })
      if ((await link.count()) > 0) await link.first().click()
    }
    expect(page.url()).not.toMatch(/^javascript:/i)
    expect(await page.evaluate(() => window.__xss)).toBeUndefined()
    expect(dialogos).toEqual([])
    void browser
  })
})

test.describe('T72: inatividade encerra a sessão', () => {
  test.use({ storageState: SESSAO('usuario-t72') })

  test('depois de 15 min sem uso, a próxima ação leva ao login', async ({ browser, page }) => {
    test.setTimeout(180_000)
    // O mínimo permitido para sessao.minutosInatividade é 15; o admin o fixa e o preparo recua o último uso em 16 min.
    const admin = await browser.newContext({ baseURL: ORIGEM_E2E, storageState: SESSAO('admin-e2e') })
    const apiAdmin = clienteApi(admin.request)
    try {
      await apiAdmin.atualizar('/config', { 'sessao.minutosInatividade': 15 })

      await page.goto('/chamados')
      await aguardarRota(page)
      await expect(page).toHaveURL(/\/chamados$/)

      const saida = execFileSync(
        'pnpm',
        ['-F', '@vinimon/api', 'exec', 'tsx', 'scripts/e2e-preparar.ts', '--recuar-sessao', 'usuario-t72'],
        {
          env: {
            ...process.env,
            DATABASE_URL: URL_E2E,
            APP_ORIGIN: ORIGEM_E2E,
            CSRF_SECRET: CSRF_SECRET_E2E,
            ENCRYPTION_KEY: ENCRYPTION_KEY_E2E,
          },
        },
      )

      expect(saida.toString()).toMatch(/Sessões recuadas: [1-9]/)

      // A próxima ação: recarregar a página, que consulta a sessão na API (os dados em cache não bastam).
      await page.reload()
      await expect(page).toHaveURL(/\/login/)
      await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible()
    } finally {
      await apiAdmin.atualizar('/config', { 'sessao.minutosInatividade': 60 })
      await admin.close()
    }
  })
})

export type { Recursos }
