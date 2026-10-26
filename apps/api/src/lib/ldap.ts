import { readFileSync } from 'node:fs'
import type { Perfil } from '@vinimon/shared'
import { AndFilter, Client, type Entry, EqualityFilter } from 'ldapts'
import { env } from '../env'

export interface ConfigLdap {
  url: string
  startTls: boolean
  caFile: string
  bindDn: string
  bindSenha: string
  baseDn: string
  attrLogin: string
  attrEmail: string
  attrNome: string
  attrTelefone: string
  grupoAdmin: string
  grupoOperador: string
  areaPadraoId: number
}

export interface PerfilLdap {
  dn: string
  nome: string
  email: string | null
  telefone: string | null
  perfil: Perfil
}

/** Configuração vinda do ambiente; null quando o LDAP não está configurado (todas ou nenhuma, ver env.ts). */
export function configLdapDoAmbiente(): ConfigLdap | null {
  if (
    env.LDAP_URL === undefined ||
    env.LDAP_CA_FILE === undefined ||
    env.LDAP_BIND_DN === undefined ||
    env.LDAP_BIND_SENHA === undefined ||
    env.LDAP_BASE_DN === undefined ||
    env.LDAP_ATTR_EMAIL === undefined ||
    env.LDAP_ATTR_NOME === undefined ||
    env.LDAP_ATTR_TELEFONE === undefined ||
    env.LDAP_GRUPO_ADMIN === undefined ||
    env.LDAP_GRUPO_OPERADOR === undefined ||
    env.LDAP_AREA_PADRAO_ID === undefined
  )
    return null
  return {
    url: env.LDAP_URL,
    startTls: env.LDAP_STARTTLS,
    caFile: env.LDAP_CA_FILE,
    bindDn: env.LDAP_BIND_DN,
    bindSenha: env.LDAP_BIND_SENHA,
    baseDn: env.LDAP_BASE_DN,
    attrLogin: env.LDAP_ATTR_LOGIN,
    attrEmail: env.LDAP_ATTR_EMAIL,
    attrNome: env.LDAP_ATTR_NOME,
    attrTelefone: env.LDAP_ATTR_TELEFONE,
    grupoAdmin: env.LDAP_GRUPO_ADMIN,
    grupoOperador: env.LDAP_GRUPO_OPERADOR,
    areaPadraoId: env.LDAP_AREA_PADRAO_ID,
  }
}

const TIMEOUT_MS = 10_000
const UAC_DESABILITADA = 2

function valores(entrada: Entry, atributo: string): string[] {
  const chave = Object.keys(entrada).find((k) => k.toLowerCase() === atributo.toLowerCase())
  if (chave === undefined) return []
  const v = entrada[chave]
  if (v === undefined) return []
  const lista: (string | Buffer)[] = Array.isArray(v) ? v : [v]
  return lista.map((x) => (typeof x === 'string' ? x : x.toString('utf8')))
}

const primeiro = (entrada: Entry, atributo: string): string | null => {
  const v = valores(entrada, atributo)[0]?.trim()
  return v ? v : null
}

function novoCliente(cfg: ConfigLdap): Client {
  // Verificação do certificado sempre ligada, com a CA configurada (S125).
  const tlsOptions = { ca: readFileSync(cfg.caFile), rejectUnauthorized: true }
  return new Client({ url: cfg.url, timeout: TIMEOUT_MS, connectTimeout: TIMEOUT_MS, tlsOptions })
}

/**
 * Busca-e-depois-bind (S126): bind de serviço, busca com filtro em objetos e exatamente 1 resultado, bind com o DN
 * achado. Devolve null para qualquer recusa ou falha (o chamador responde como S9 e conta em S40). A senha nunca é
 * gravada nem registrada.
 */
export async function autenticarLdap(login: string, senha: string, cfg: ConfigLdap): Promise<PerfilLdap | null> {
  if (senha.trim() === '') return null // antes de qualquer bind: bind anônimo "com sucesso" seria bypass (S129)
  let cliente: Client | null = null
  try {
    cliente = novoCliente(cfg)
    if (cfg.startTls) await cliente.startTLS({ ca: readFileSync(cfg.caFile), rejectUnauthorized: true })
    await cliente.bind(cfg.bindDn, cfg.bindSenha)
    const { searchEntries } = await cliente.search(cfg.baseDn, {
      scope: 'sub',
      sizeLimit: 2,
      timeLimit: 10,
      filter: new AndFilter({
        filters: [
          new EqualityFilter({ attribute: 'objectClass', value: 'person' }),
          new EqualityFilter({ attribute: cfg.attrLogin, value: login }),
        ],
      }),
      attributes: [cfg.attrLogin, cfg.attrEmail, cfg.attrNome, cfg.attrTelefone, 'userAccountControl', 'memberOf'],
    })
    const [achado] = searchEntries
    if (searchEntries.length !== 1 || achado === undefined) return null
    const uac = Number.parseInt(primeiro(achado, 'userAccountControl') ?? '0', 10)
    if (Number.isFinite(uac) && (uac & UAC_DESABILITADA) !== 0) return null
    await cliente.bind(achado.dn, senha) // DN tirado da busca, nunca montado a partir da entrada
    const grupos = valores(achado, 'memberOf').map((g) => g.toLowerCase())
    const perfil: Perfil = grupos.includes(cfg.grupoAdmin.toLowerCase())
      ? 'ADMIN'
      : grupos.includes(cfg.grupoOperador.toLowerCase())
        ? 'OPERADOR'
        : 'USUARIO'
    return {
      dn: achado.dn,
      nome: primeiro(achado, cfg.attrNome) ?? login,
      email: primeiro(achado, cfg.attrEmail),
      telefone: primeiro(achado, cfg.attrTelefone),
      perfil,
    }
  } catch {
    return null
  } finally {
    if (cliente) await cliente.unbind().catch(() => undefined)
  }
}

/** POST /config/ldap/testar: confere conexão, CA e bind de serviço, sem expor detalhes do servidor. */
export async function testarLdap(cfg: ConfigLdap): Promise<{ ok: boolean; mensagem: string }> {
  let cliente: Client | null = null
  try {
    cliente = novoCliente(cfg)
    if (cfg.startTls) await cliente.startTLS({ ca: readFileSync(cfg.caFile), rejectUnauthorized: true })
    await cliente.bind(cfg.bindDn, cfg.bindSenha)
    await cliente.search(cfg.baseDn, { scope: 'base', sizeLimit: 1, timeLimit: 10 })
    return { ok: true, mensagem: 'Conexão e bind de serviço funcionaram.' }
  } catch {
    return {
      ok: false,
      mensagem: 'Não foi possível conectar ou autenticar no servidor LDAP. Confira URL, CA e conta de serviço.',
    }
  } finally {
    if (cliente) await cliente.unbind().catch(() => undefined)
  }
}
