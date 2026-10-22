import { copyFileSync, existsSync, readFileSync, rmSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { criarFixture } from './fixture'
import { type LeituraV1, lerV1 } from './ler'
import { validar } from './validar'

const dirs: string[] = []
function fixture(invalidos: boolean): string {
  const caminho = criarFixture({ invalidos })
  dirs.push(dirname(caminho))
  return caminho
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

/** Leitura válida mínima, para os testes puros de `validar`. */
function base(): LeituraV1 {
  return lerV1(fixture(false))
}

describe('validar', () => {
  it('dados válidos não geram erros', () => {
    const r = validar(base())
    expect(r.erros).toEqual([])
    expect(r.norm.loginsSenhaPadrao).toEqual(['admin', 'operador'])
    expect(r.norm.usuarios.find((u) => u.login === 'maria')?.senhaPadrao).toBe(false)
  })

  it('data inválida gera erro', () => {
    const L = base()
    const c = L.chamados[0]
    if (!c) throw new Error('fixture sem chamado')
    c.data_abertura = '2025-13-45'
    expect(validar(L).erros.join('\n')).toMatch(/chamados #1: data_abertura inválida/)
  })

  it('FK órfã gera erro', () => {
    const L = base()
    const c = L.chamados[1]
    if (!c) throw new Error('fixture sem chamado')
    c.status_id = 99
    expect(validar(L).erros.join('\n')).toMatch(/chamados #2: status_id=99 não existe em status/)
  })

  it('nivel=4 gera erro', () => {
    const L = base()
    const u = L.usuarios[2]
    if (!u) throw new Error('fixture sem usuário')
    u.nivel = 4
    expect(validar(L).erros.join('\n')).toMatch(/nivel=4 fora de \{1,2,3\}/)
  })

  it('colisão de login após normalizar gera erro', () => {
    const L = base()
    const u = L.usuarios[2]
    if (!u) throw new Error('fixture sem usuário')
    u.login = ' ADMIN '
    expect(validar(L).erros.join('\n')).toMatch(/login "admin" colide/)
  })

  it('assunto curto gera erro', () => {
    const L = base()
    const c = L.chamados[0]
    if (!c) throw new Error('fixture sem chamado')
    c.assunto = 'ab'
    expect(validar(L).erros.join('\n')).toMatch(/assunto com menos de 3/)
  })

  it('e-mail duplicado gera AVISO (não erro)', () => {
    const L = base()
    const a = L.usuarios[0]
    const b = L.usuarios[2]
    if (!a || !b) throw new Error('fixture sem usuários')
    b.email = a.email
    const r = validar(L)
    expect(r.erros).toEqual([])
    expect(r.avisos.join('\n')).toMatch(/e-mail duplicado/)
    expect(r.norm.usuarios.find((u) => u.id === b.id)?.email).toBeNull()
  })

  it('cor inválida vira #888888 com aviso', () => {
    const L = base()
    const p = L.prioridades[0]
    if (!p) throw new Error('fixture sem prioridade')
    p.cor = 'vermelho'
    const r = validar(L)
    expect(r.erros).toEqual([])
    expect(r.norm.prioridades[0]?.cor).toBe('#888888')
  })

  it('fixture inválida: erros e avisos esperados juntos', () => {
    const r = validar(lerV1(fixture(true)))
    const erros = r.erros.join('\n')
    expect(erros).toMatch(/data_abertura inválida/)
    expect(erros).toMatch(/status_id=99/)
    expect(erros).toMatch(/nivel=4/)
    expect(erros).toMatch(/login "maria" colide/)
    expect(erros).toMatch(/assunto com menos de 3/)
    expect(r.avisos.join('\n')).toMatch(/e-mail duplicado/)
  })
})

describe('lerV1', () => {
  it('lê a fixture sem alterar o original e sem a coluna dados', () => {
    const caminho = fixture(false)
    const antes = readFileSync(caminho)
    const mtime = statSync(caminho).mtimeMs
    const L = lerV1(caminho)
    expect(readFileSync(caminho).equals(antes)).toBe(true)
    expect(statSync(caminho).mtimeMs).toBe(mtime)
    expect(L.usuarios).toHaveLength(3)
    expect(L.chamados.map((c) => c.id)).toEqual([1, 2])
    expect(L.anexos).toHaveLength(1)
    expect(Object.keys(L.anexos[0] ?? {})).not.toContain('dados')
    expect(L.temNotificacoes).toBe(true)
  })

  it('exige integrity_check ok e erra para arquivo inexistente', () => {
    const caminho = fixture(false)
    const lixo = `${caminho}.corrompido`
    copyFileSync(caminho, lixo)
    const db = new DatabaseSync(lixo)
    expect(db.prepare('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' })
    db.close()
    expect(() => lerV1(`${caminho}.nao-existe`)).toThrow(/não encontrado/)
    expect(existsSync(lixo)).toBe(true)
  })
})
