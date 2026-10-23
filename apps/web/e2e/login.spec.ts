import { expect, test } from '@playwright/test'
import { CSRF_HEADER } from '@vinimon/shared'
import {
  codigoNovoPasso,
  E2E_SENHA,
  E2E_TOTP_SECRET,
  NOVA_SENHA_ADMIN_E2E,
  ORIGEM_E2E,
  passoAtual,
  SENHA_ADMIN_E2E,
} from './ajudantes'
import { totp } from './totp'

// Cada teste começa sem sessão: o login é o próprio assunto.
test.use({ storageState: { cookies: [], origins: [] } })

test('T68: admin troca a senha, cadastra o 2FA e chega ao painel com cookie httpOnly', async ({ page, context }) => {
  await page.goto('/login')
  await page.getByLabel('Login').fill('admin')
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill(SENHA_ADMIN_E2E)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()

  await expect(page).toHaveURL(/\/trocar-senha$/)
  await page.getByRole('textbox', { name: 'Senha atual' }).fill(SENHA_ADMIN_E2E)
  await page.getByRole('textbox', { name: 'Nova senha', exact: true }).fill(NOVA_SENHA_ADMIN_E2E)
  await page.getByRole('textbox', { name: 'Repita a nova senha' }).fill(NOVA_SENHA_ADMIN_E2E)
  await page.getByRole('button', { name: 'Trocar senha', exact: true }).click()

  await expect(page).toHaveURL(/\/configurar-2fa$/)
  // O segredo exibido ao lado do QR code é o da URI otpauth (a chave de configuração).
  const segredo = await page.locator('#segredo-2fa').innerText()
  expect(segredo.trim()).toMatch(/^[A-Z2-7]+$/)
  await page.locator('#codigo-confirmar-2fa').fill(totp(segredo.trim()))

  await page.getByLabel('Guardei meus códigos').click()
  await page.getByRole('button', { name: 'Concluir', exact: true }).click()
  await expect(page).toHaveURL(/\/atividade$/)

  const cookie = (await context.cookies()).find((c) => c.name.endsWith('vinimon_sid'))
  expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Strict' })
})

test('T70: redirect malicioso é ignorado e, depois do logout, a área logada não mostra dados', async ({ page }) => {
  const inicio = passoAtual()
  await page.goto('/login?redirect=//evil.test')
  await page.getByLabel('Login').fill('usuario')
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill(E2E_SENHA)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  const { codigo } = await codigoNovoPasso(E2E_TOTP_SECRET, inicio)
  await page.locator('#codigo-2fa').fill(codigo)

  await expect(page).toHaveURL(/\/chamados$/)
  expect(new URL(page.url()).origin).toBe(ORIGEM_E2E)

  // Não há botão de sair no web ainda: o logout vai pela API, com o CSRF da própria sessão.
  const sessao = (await (await page.request.get('/api/v1/auth/sessao')).json()) as { csrf: string }
  const saida = await page.request.post('/api/v1/auth/logout', {
    headers: { origin: ORIGEM_E2E, [CSRF_HEADER]: sessao.csrf },
  })
  expect(saida.status()).toBe(204)

  // Documento novo na área logada: não pode mostrar chamados nem o cache local de dados (vinimon:u*).
  await page.goto('/chamados')
  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible()
  const chaves = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('vinimon:u')))
  expect(chaves).toEqual([])
})
