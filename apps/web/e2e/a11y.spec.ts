import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'
import { ORIGEM_E2E } from './ajudantes'
import {
  aguardarRota,
  criarRecursos,
  criarUsuarioNovo,
  entrarAteTrocaDeSenha,
  rotasLogadas,
  SESSAO,
  trocarSenhaAteConfigurar2fa,
} from './rotas'

const MODOS = [
  { nome: 'claro', colorScheme: 'light', densidade: null },
  { nome: 'escuro', colorScheme: 'dark', densidade: null },
  { nome: 'compacto', colorScheme: 'light', densidade: 'compacta' },
] as const

/** Violações serious/critical, em texto legível. */
async function graves(page: Page) {
  const resultado = await new AxeBuilder({ page }).analyze()
  return resultado.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)
}

for (const modo of MODOS) {
  test.describe(`axe no modo ${modo.nome}`, () => {
    test('rotas logadas sem violações serious ou critical', async ({ browser }) => {
      test.setTimeout(300_000)
      const recursos = await criarRecursos(browser, `a11y-${modo.nome}`)
      const contexto = await browser.newContext({
        baseURL: ORIGEM_E2E,
        storageState: SESSAO('admin-e2e'),
        colorScheme: modo.colorScheme,
      })
      if (modo.densidade) {
        await contexto.addInitScript(
          (d) => localStorage.setItem('vinimon:densidade', JSON.stringify(d)),
          modo.densidade,
        )
      }
      const page = await contexto.newPage()
      const falhas: string[] = []
      try {
        for (const rota of rotasLogadas(recursos)) {
          await page.goto(rota)
          await aguardarRota(page)
          if (modo.densidade) await expect(page.locator('html')).toHaveAttribute('data-densidade', modo.densidade)
          if (modo.colorScheme === 'dark') await expect(page.locator('html')).toHaveClass(/dark/)
          for (const g of await graves(page)) falhas.push(`${rota}: ${g}`)
        }
      } finally {
        await contexto.close()
      }
      expect(falhas).toEqual([])
    })

    test('login, troca de senha e 2FA', async ({ browser }) => {
      test.setTimeout(120_000)
      const usuario = await criarUsuarioNovo(browser, `a11y-${modo.nome}`)
      const contexto = await browser.newContext({ baseURL: ORIGEM_E2E, colorScheme: modo.colorScheme })
      if (modo.densidade) {
        await contexto.addInitScript(
          (d) => localStorage.setItem('vinimon:densidade', JSON.stringify(d)),
          modo.densidade,
        )
      }
      const page = await contexto.newPage()
      const falhas: string[] = []
      try {
        await page.goto('/login')
        await expect(page.getByLabel('Login')).toBeVisible()
        await page.waitForLoadState('networkidle')
        for (const g of await graves(page)) falhas.push(`/login: ${g}`)

        await entrarAteTrocaDeSenha(page, usuario)
        await aguardarRota(page)
        for (const g of await graves(page)) falhas.push(`/trocar-senha: ${g}`)

        await trocarSenhaAteConfigurar2fa(page, usuario)
        await aguardarRota(page)
        for (const g of await graves(page)) falhas.push(`/configurar-2fa: ${g}`)
      } finally {
        await contexto.close()
      }
      expect(falhas).toEqual([])
    })
  })
}
