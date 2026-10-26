import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ldap = vi.hoisted(() => ({ bind: vi.fn(), search: vi.fn(), startTLS: vi.fn(), unbind: vi.fn() }))

// O env é lido uma vez no setup; a configuração LDAP do teste entra por esta função.
vi.mock('../../lib/ldap', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../lib/ldap')>()),
  configLdapDoAmbiente: () => ({
    url: 'ldaps://ldap.teste.local',
    startTls: false,
    caFile: './package.json',
    bindDn: 'cn=servico,dc=teste,dc=local',
    bindSenha: 'senha-do-servico',
    baseDn: 'dc=teste,dc=local',
    attrLogin: 'sAMAccountName',
    attrEmail: 'mail',
    attrNome: 'displayName',
    attrTelefone: 'telephoneNumber',
    grupoAdmin: 'CN=Admins,DC=teste,DC=local',
    grupoOperador: 'CN=Operadores,DC=teste,DC=local',
    areaPadraoId: 4242,
  }),
}))

vi.mock('ldapts', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('ldapts')>()),
  Client: class {
    bind = ldap.bind
    search = ldap.search
    startTLS = ldap.startTLS
    unbind = ldap.unbind
  },
}))

import { criarUsuario, limparBanco, ORIGEM, SENHA_TESTE } from '../../../test/ajudantes'
import { type App, buildApp } from '../../app'
import { autenticarLdap, configLdapDoAmbiente } from '../../lib/ldap'
import { prisma } from '../../lib/prisma'

const JSON_HDR = { 'content-type': 'application/json', origin: ORIGEM }
const entrada = (extra: Record<string, string | string[]> = {}) => ({
  dn: 'CN=Maria,OU=Pessoas,DC=teste,DC=local',
  sAMAccountName: 'maria',
  displayName: 'Maria Souza',
  mail: 'Maria@Teste.local',
  telephoneNumber: '+55 11 99999-0000',
  userAccountControl: '512',
  memberOf: [],
  ...extra,
})

describe('LDAP (S125–S131)', () => {
  let app: App
  beforeEach(async () => {
    await limparBanco()
    ldap.bind.mockReset().mockResolvedValue(undefined)
    ldap.search.mockReset().mockResolvedValue({ searchEntries: [entrada()], searchReferences: [] })
    ldap.startTLS.mockReset().mockResolvedValue(undefined)
    ldap.unbind.mockReset().mockResolvedValue(undefined)
    await prisma.area.create({ data: { id: 4242, nome: 'Área padrão LDAP', atende: true } })
    app = await buildApp({ logger: false })
    await app.ready()
  })
  afterEach(async () => {
    await app.close()
  })

  const entrar = (login: string, senha: string) =>
    app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: JSON_HDR, payload: { login, senha } })

  it('login com metacaracteres de filtro é recusado pelo Zod (400) sem tocar o LDAP', async () => {
    const r = await entrar('*)(uid=*', 'qualquer-senha')
    expect(r.statusCode).toBe(400)
    expect(ldap.bind).not.toHaveBeenCalled()
    expect(ldap.search).not.toHaveBeenCalled()
  })

  it('o filtro é montado com objetos e escapa o valor', async () => {
    const cfg = configLdapDoAmbiente()
    if (!cfg) throw new Error('LDAP deveria estar configurado no teste')
    await autenticarLdap('a*)(b=\\', 'senha', cfg)
    const opcoes = ldap.search.mock.calls[0]?.[1]
    expect(opcoes.sizeLimit).toBe(2)
    const texto = String(opcoes.filter)
    expect(texto).toContain('\\2a')
    expect(texto).toContain('\\28')
    expect(texto).toContain('\\29')
    expect(texto).not.toContain('a*)(b')
  })

  it('senha vazia ou só espaços nunca chama bind', async () => {
    for (const senha of ['', '   ']) {
      const cfg = configLdapDoAmbiente()
      if (!cfg) throw new Error('LDAP deveria estar configurado no teste')
      expect(await autenticarLdap('maria', senha, cfg)).toBeNull()
    }
    expect(ldap.bind).not.toHaveBeenCalled()
    const r = await entrar('maria', ' ')
    expect(r.statusCode).toBe(401)
    expect(ldap.bind).not.toHaveBeenCalled()
  })

  it('dois resultados dão 401, contam falha e fazem unbind', async () => {
    ldap.search.mockResolvedValue({
      searchEntries: [entrada(), entrada({ dn: 'CN=Outra,DC=x' })],
      searchReferences: [],
    })
    const r = await entrar('maria', 'Senha-Boa-2026-xyz')
    expect(r.statusCode).toBe(401)
    expect(r.json().erro.mensagem).toBe('Login ou senha inválidos.')
    expect(ldap.bind).toHaveBeenCalledTimes(1) // só o bind de serviço
    expect(ldap.unbind).toHaveBeenCalled()
    expect(await prisma.falhaLogin.count({ where: { loginNormalizado: 'maria' } })).toBe(1)
  })

  it('zero resultados, conta desabilitada e senha errada dão 401', async () => {
    ldap.search.mockResolvedValue({ searchEntries: [], searchReferences: [] })
    expect((await entrar('maria', 'Senha-Boa-2026-xyz')).statusCode).toBe(401)
    ldap.search.mockResolvedValue({ searchEntries: [entrada({ userAccountControl: '514' })], searchReferences: [] })
    expect((await entrar('maria', 'Senha-Boa-2026-xyz')).statusCode).toBe(401)
    ldap.search.mockResolvedValue({ searchEntries: [entrada()], searchReferences: [] })
    ldap.bind.mockImplementation(async (dn: string) => {
      if (dn.startsWith('CN=Maria')) throw new Error('invalid credentials')
    })
    expect((await entrar('maria', 'Senha-Errada-2026')).statusCode).toBe(401)
    expect(await prisma.usuario.count({ where: { login: 'maria' } })).toBe(0)
  })

  it('sucesso cria o usuário LDAP sem senha local, faz o bind com o DN da busca e o unbind', async () => {
    const r = await entrar('maria', 'Senha-Boa-2026-xyz')
    expect(r.statusCode).toBe(200)
    expect(ldap.bind).toHaveBeenNthCalledWith(2, 'CN=Maria,OU=Pessoas,DC=teste,DC=local', 'Senha-Boa-2026-xyz')
    expect(ldap.unbind).toHaveBeenCalled()
    const u = await prisma.usuario.findUniqueOrThrow({ where: { login: 'maria' } })
    expect(u).toMatchObject({
      origemAutenticacao: 'LDAP',
      perfil: 'USUARIO',
      email: 'maria@teste.local',
      nome: 'Maria Souza',
    })
    const [bruto] = await prisma.$queryRaw<
      { senha_hash: string | null }[]
    >`SELECT senha_hash FROM usuarios WHERE id = ${u.id}`
    expect(bruto?.senha_hash).toBeNull()
  })

  it('perfil vem de memberOf e OPERADOR recebe a área padrão', async () => {
    ldap.search.mockResolvedValue({
      searchEntries: [entrada({ memberOf: ['cn=operadores,dc=teste,dc=local'] })],
      searchReferences: [],
    })
    expect((await entrar('maria', 'Senha-Boa-2026-xyz')).statusCode).toBe(200)
    const u = await prisma.usuario.findUniqueOrThrow({ where: { login: 'maria' } })
    expect(u).toMatchObject({ perfil: 'OPERADOR', areaId: 4242 })
  })

  it('usuário LOCAL existente autentica localmente, sem consultar o LDAP', async () => {
    const local = await criarUsuario({ perfil: 'USUARIO' })
    const r = await entrar(local.login, SENHA_TESTE)
    expect(r.statusCode).toBe(200)
    expect(ldap.bind).not.toHaveBeenCalled()
  })

  it('usuário LDAP desativado localmente não entra e não troca senha (422)', async () => {
    expect((await entrar('maria', 'Senha-Boa-2026-xyz')).statusCode).toBe(200)
    await prisma.usuario.update({ where: { login: 'maria' }, data: { ativo: false } })
    expect((await entrar('maria', 'Senha-Boa-2026-xyz')).statusCode).toBe(401)
  })

  it('usuário LDAP não troca senha (422)', async () => {
    const login = await entrar('maria', 'Senha-Boa-2026-xyz')
    const cookie = String(login.headers['set-cookie']).split(';')[0] ?? ''
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/trocar-senha',
      headers: { ...JSON_HDR, cookie, 'x-csrf-token': login.json().csrf },
      payload: { senhaAtual: 'Senha-Boa-2026-xyz', novaSenha: 'Pitanga-Lanterna-Rio-2027' },
    })
    expect(r.statusCode).toBe(422)
  })
})
