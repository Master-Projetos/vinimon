import { expect, test } from '@playwright/test'
import { ORIGEM_E2E } from './ajudantes'

// Um PNG válido de 1x1 pixel.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const SESSAO = (login: string) => `e2e/.auth/${login}.json`
const ASSUNTO = 'Sem rede na sala 12 (fluxo E2E)'

test.describe.configure({ mode: 'serial' })

test('T71: abrir com anexo, assumir, comentar, concluir, validar e ver no relatório', async ({ browser }) => {
  test.setTimeout(90_000)
  const abrir = async (login: string) => {
    const contexto = await browser.newContext({ baseURL: ORIGEM_E2E, storageState: SESSAO(login) })
    return { contexto, pagina: await contexto.newPage() }
  }
  const usuario = await abrir('usuario')
  const operador = await abrir('operador')
  const admin = await abrir('admin-e2e')

  // 1. O USUARIO abre o chamado com um anexo PNG.
  const u = usuario.pagina
  await u.goto('/chamados/novo')
  await u.getByRole('combobox', { name: /Tipo de problema/ }).click()
  await u.getByRole('option', { name: /Sem acesso à rede/ }).click()
  await u.getByLabel('Assunto').fill(ASSUNTO)
  await u.getByLabel('Descrição').fill('A rede da sala 12 caiu depois do almoço.')
  await u.getByLabel('Anexar arquivos').setInputFiles({ name: 'captura.png', mimeType: 'image/png', buffer: PNG_1X1 })
  await expect(u.getByRole('list', { name: 'Arquivos para anexar' })).toContainText('captura.png')
  await u.getByRole('button', { name: 'Abrir chamado', exact: true }).click()
  await expect(u).toHaveURL(/\/chamados\/\d+$/)
  const chamadoId = /\/chamados\/(\d+)$/.exec(u.url())?.[1]
  expect(chamadoId).toBeDefined()
  await expect(u.getByRole('heading', { name: new RegExp(ASSUNTO.replace(/[()]/g, '\\$&')) })).toBeVisible()

  // 2. O OPERADOR assume, comenta mencionando o USUARIO e conclui.
  const o = operador.pagina
  await o.goto(`/chamados/${chamadoId}`)
  await o.getByRole('button', { name: 'Assumir', exact: true }).click()
  await expect(o.getByText('Chamado assumido por Operador E2E')).toBeVisible()

  const mensagem = o.getByRole('textbox', { name: 'Mensagem' })
  await mensagem.fill('Olá @Usu')
  await o.getByRole('list', { name: 'Pessoas para mencionar' }).getByRole('button', { name: 'Usuário E2E' }).click()
  await mensagem.pressSequentially('já estou verificando o switch.')
  await o.getByRole('button', { name: 'Enviar', exact: true }).click()
  await expect(o.getByText('já estou verificando o switch.')).toBeVisible()

  await o.getByRole('button', { name: 'Concluir', exact: true }).click()
  const dialogo = o.getByRole('dialog', { name: 'Concluir chamado' })
  await dialogo.getByLabel('Solução aplicada').fill('Cabo de rede reencaixado no switch.')
  await dialogo.getByRole('button', { name: 'Concluir', exact: true }).click()
  await expect(dialogo).toBeHidden()

  // 3. O USUARIO valida a solução com "Bom".
  await u.reload()
  const validacao = u.getByRole('region', { name: 'Validação do atendimento' })
  await expect(validacao).toBeVisible()
  await validacao.getByRole('radio', { name: 'Bom' }).click()
  await validacao.getByRole('button', { name: 'Confirmar solução' }).click()
  await expect(u.getByText('Obrigado pela avaliação. O chamado foi encerrado.')).toBeVisible()
  await expect(validacao).toBeHidden()

  // 4. O ADMIN encontra o chamado encerrado e a avaliação no relatório.
  const a = admin.pagina
  await a.goto('/relatorios/avaliacoes')
  await expect(a.getByRole('heading', { name: 'Avaliações', level: 1 })).toBeVisible()
  await expect(a.getByRole('table', { name: 'Avaliações por operador' })).toContainText('Operador E2E')

  // 5. Anexo: o navegador não expõe a resposta de um download ao `waitForResponse`, então os cabeçalhos
  //    de T46 vêm da mesma URL carregada pela prévia (<img>); o clique em "Baixar" confere o arquivo salvo.
  await u.goto(`/chamados/${chamadoId}/anexos`)
  const [resposta] = await Promise.all([
    u.waitForResponse((r) => /\/api\/v1\/anexos\/[0-9a-f-]{36}$/.test(r.url())),
    u.getByRole('button', { name: 'Pré-visualizar' }).click(),
  ])
  expect(resposta.status()).toBe(200)
  const cab = resposta.headers()
  expect(cab['content-type']).toBe('image/png')
  expect(cab['content-disposition']).toMatch(/^inline/)
  expect(cab['x-content-type-options']).toBe('nosniff')
  expect(cab['content-security-policy']).toBe("default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox")
  expect(cab['cross-origin-resource-policy']).toBe('same-origin')
  expect(cab['cache-control']).toBe('private, no-store')

  await u.keyboard.press('Escape')
  const [download] = await Promise.all([
    u.waitForEvent('download'),
    u.getByRole('link', { name: 'Baixar captura.png' }).click(),
  ])
  expect(download.suggestedFilename()).toBe('captura.png')
})

test('T71: o app em um iframe de outra origem é bloqueado', async ({ page }) => {
  const outra = 'http://outra-origem.test'
  await page.route(`${outra}/**`, (rota) =>
    rota.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><title>Outra origem</title><iframe id="app" src="${ORIGEM_E2E}/login"></iframe>`,
    }),
  )
  await page.goto(`${outra}/`)

  // O navegador recusa o quadro (X-Frame-Options e frame-ancestors): a tela de login não chega a ser exibida.
  const cab = (await page.request.get(`${ORIGEM_E2E}/login`)).headers()
  expect(cab['x-frame-options']).toBe('DENY')
  expect(cab['content-security-policy']).toContain("frame-ancestors 'none'")
  await expect
    .poll(
      () =>
        page
          .frames()
          .find((f) => f !== page.mainFrame())
          ?.url() ?? '',
    )
    .toMatch(/^chrome-error:/)
  await expect(page.frameLocator('#app').getByLabel('Login')).toHaveCount(0)
})
