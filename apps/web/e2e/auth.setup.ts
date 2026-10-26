import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test as setup } from '@playwright/test'
import { E2E_SENHA, E2E_TOTP_SECRET } from './ajudantes'
import { totp } from './totp'

/** Um login por usuário de teste; a sessão vai para e2e/.auth/<login>.json e os specs a reutilizam (sem refazer login). */
const USUARIOS = ['operador', 'usuario', 'usuario-t72', 'admin-e2e'] as const

for (const login of USUARIOS) {
  setup(`sessão de ${login}`, async ({ page, context }) => {
    await page.goto('/login')
    await page.getByLabel('Login').fill(login)
    await page.getByRole('textbox', { name: 'Senha', exact: true }).fill(E2E_SENHA)
    await page.getByRole('button', { name: 'Entrar', exact: true }).click()
    await page.locator('#codigo-2fa').fill(totp(E2E_TOTP_SECRET))
    await expect(page).not.toHaveURL(/\/login/)

    const destino = fileURLToPath(new URL(`./.auth/${login}.json`, import.meta.url))
    mkdirSync(dirname(destino), { recursive: true })
    await context.storageState({ path: destino })
  })
}
