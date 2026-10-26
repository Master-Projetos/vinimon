import { type APIRequestContext, type Browser, expect, type Page } from '@playwright/test'
import { CSRF_HEADER, TIPOS_RELATORIO } from '@vinimon/shared'
import { E2E_SENHA, ORIGEM_E2E } from './ajudantes'

/** storageState gravado por auth.setup.ts. */
export const SESSAO = (login: string): string => `e2e/.auth/${login}.json`

/** Cliente da API com a sessão (cookie) e o CSRF do contexto, para preparar dados dos specs. */
export function clienteApi(request: APIRequestContext) {
  let csrf: string | undefined
  const token = async (): Promise<string> => {
    if (csrf === undefined) {
      const sessao = (await (await request.get('/api/v1/auth/sessao')).json()) as { csrf: string }
      csrf = sessao.csrf
    }
    return csrf
  }
  const enviar = async <T>(metodo: 'POST' | 'PATCH', caminho: string, data: unknown, status: number): Promise<T> => {
    const requisitar = async () =>
      request.fetch(`/api/v1${caminho}`, {
        method: metodo,
        data,
        headers: { origin: ORIGEM_E2E, [CSRF_HEADER]: await token() },
      })
    let resposta = await requisitar()
    if (resposta.status() === 403) {
      csrf = undefined // mesmo tratamento do web: renova o token e repete uma vez
      resposta = await requisitar()
    }
    expect(resposta.status(), await resposta.text()).toBe(status)
    return (await resposta.json()) as T
  }
  return {
    async obter<T>(caminho: string): Promise<T> {
      const resposta = await request.get(`/api/v1${caminho}`)
      expect(resposta.status(), await resposta.text()).toBe(200)
      return (await resposta.json()) as T
    },
    criar: <T>(caminho: string, corpo: unknown): Promise<T> => enviar<T>('POST', caminho, corpo, 201),
    atualizar: <T>(caminho: string, corpo: unknown): Promise<T> => enviar<T>('PATCH', caminho, corpo, 200),
  }
}

export interface Recursos {
  chamadoId: number
  artigoId: number
  ativoId: number
}

/** Cria, pela API e como admin, um chamado, um artigo e um equipamento para as rotas com parâmetro. */
export async function criarRecursos(browser: Browser, sufixo: string): Promise<Recursos> {
  const contexto = await browser.newContext({ baseURL: ORIGEM_E2E, storageState: SESSAO('admin-e2e') })
  try {
    const api = clienteApi(contexto.request)
    const problemas = await api.obter<{ itens: { id: number }[] }>('/problemas?porPagina=1')
    const problemaId = problemas.itens[0]?.id
    expect(problemaId).toBeDefined()
    const chamado = await api.criar<{ id: number }>('/chamados', {
      problemaId,
      assunto: `Chamado de rotas ${sufixo}`,
      descricao: 'Chamado criado pelo E2E para percorrer as rotas.',
    })
    const artigo = await api.criar<{ id: number }>('/artigos', {
      titulo: `Artigo de rotas ${sufixo}`,
      conteudo: 'Conteúdo do artigo do E2E.',
      situacao: 'PUBLICADO',
    })
    const tipo = await api.criar<{ id: number }>('/tipos-ativo', { nome: `Notebook ${sufixo}`, ativo: true })
    const ativo = await api.criar<{ id: number }>('/ativos', { etiqueta: `ETQ-${sufixo}`, tipoId: tipo.id })
    return { chamadoId: chamado.id, artigoId: artigo.id, ativoId: ativo.id }
  } finally {
    await contexto.close()
  }
}

/** Todas as rotas da §6.6 que exigem sessão ativa (as de redirecionamento puro ficam de fora). */
export function rotasLogadas({ chamadoId, artigoId, ativoId }: Recursos): string[] {
  return [
    '/atividade',
    '/painel',
    '/sem-permissao',
    '/chamados',
    '/chamados/novo',
    `/chamados/${chamadoId}`,
    `/chamados/${chamadoId}/detalhes`,
    `/chamados/${chamadoId}/anexos`,
    `/chamados/${chamadoId}/historico`,
    `/chamados/${chamadoId}/imprimir`,
    '/conhecimento',
    '/conhecimento/novo',
    `/conhecimento/${artigoId}`,
    `/conhecimento/${artigoId}/editar`,
    '/inventario',
    `/inventario/${ativoId}`,
    ...TIPOS_RELATORIO.map((tipo) => `/relatorios/${tipo}`),
    ...[
      'usuarios',
      'areas',
      'unidades',
      'departamentos',
      'prioridades',
      'status',
      'problemas',
      'canais',
      'tags',
      'jornadas',
      'feriados',
      'tipos-ativo',
      'categorias-artigo',
      'configuracoes',
      'auditoria',
    ].map((pagina) => `/admin/${pagina}`),
    '/perfil',
    '/perfil/aparencia',
    '/perfil/notificacoes',
    '/perfil/seguranca',
    '/perfil/sessoes',
  ]
}

/** Espera a rota terminar de carregar: o conteúdo principal existe e não há requisição pendente. */
export async function aguardarRota(page: Page): Promise<void> {
  await expect(page.locator('main, form').first()).toBeVisible()
  await page.waitForLoadState('networkidle')
}

export interface UsuarioNovo {
  login: string
  senhaTemporaria: string
}

/** Admin cadastra um usuário; o primeiro acesso dele cai em /trocar-senha e depois em /configurar-2fa. */
export async function criarUsuarioNovo(browser: Browser, login: string): Promise<UsuarioNovo> {
  const contexto = await browser.newContext({ baseURL: ORIGEM_E2E, storageState: SESSAO('admin-e2e') })
  try {
    const api = clienteApi(contexto.request)
    const criado = await api.criar<{ senhaTemporaria: string }>('/usuarios', {
      login,
      nome: `Usuário ${login}`,
      perfil: 'ADMIN',
      areaSecundariaIds: [],
      ativo: true,
    })
    return { login, senhaTemporaria: criado.senhaTemporaria }
  } finally {
    await contexto.close()
  }
}

/** Entra com o usuário novo até a tela de troca de senha (estado TROCA_SENHA). */
export async function entrarAteTrocaDeSenha(page: Page, usuario: UsuarioNovo): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Login').fill(usuario.login)
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill(usuario.senhaTemporaria)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page).toHaveURL(/\/trocar-senha$/)
}

/** Da troca de senha até a configuração do 2FA (estado CADASTRO_MFA). */
export async function trocarSenhaAteConfigurar2fa(page: Page, usuario: UsuarioNovo): Promise<void> {
  await page.getByRole('textbox', { name: 'Senha atual' }).fill(usuario.senhaTemporaria)
  await page.getByRole('textbox', { name: 'Nova senha', exact: true }).fill(E2E_SENHA)
  await page.getByRole('textbox', { name: 'Repita a nova senha' }).fill(E2E_SENHA)
  await page.getByRole('button', { name: 'Trocar senha', exact: true }).click()
  await expect(page).toHaveURL(/\/configurar-2fa$/)
  await expect(page.locator('#segredo-2fa')).toBeVisible()
}
