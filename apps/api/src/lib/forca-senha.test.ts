import { describe, expect, it } from 'vitest'
import { ErroApp } from './erros'
import { avaliarSenha, validarNovaSenha } from './forca-senha'
import { hashSenha } from './senha'

const e = { login: 'maria.souza', nome: 'Maria Souza', email: 'maria@exemplo.com', organizacao: 'Minha Empresa' }

describe('avaliarSenha (T08)', () => {
  it('recusa 11 e 129 caracteres', async () => {
    expect((await avaliarSenha('Abc!9xYz@Q1', e)).ok).toBe(false)
    expect((await avaliarSenha(`${'aB3$'.repeat(32)}x`, e)).ok).toBe(false)
  })

  it('recusa senhas previsíveis', async () => {
    expect((await avaliarSenha('vinimon2026!!', e)).ok).toBe(false)
    expect((await avaliarSenha('Senha123456!', e)).ok).toBe(false)
  })

  it('recusa senha que contém o login', async () => {
    expect((await avaliarSenha('maria.souza2026!', e)).ok).toBe(false)
  })

  it('aceita uma frase longa', async () => {
    const r = await avaliarSenha('Cavalo-Bateria-Grampo-2026', e)
    expect(r.ok).toBe(true)
    expect(r.dica).toBeNull()
  })
})

describe('validarNovaSenha', () => {
  it('lança VALIDACAO no campo novaSenha para senha fraca', async () => {
    await expect(validarNovaSenha('Senha123456!', e, null)).rejects.toMatchObject({ status: 400, codigo: 'VALIDACAO' })
  })

  it('recusa senha igual à atual', async () => {
    const atual = await hashSenha('Cavalo-Bateria-Grampo-2026')
    const erro = await validarNovaSenha('Cavalo-Bateria-Grampo-2026', e, atual).catch((x) => x)
    expect(erro).toBeInstanceOf(ErroApp)
    expect(erro.detalhes?.[0]?.campo).toBe('novaSenha')
  })

  it('aceita senha forte e diferente', async () => {
    const atual = await hashSenha('Cavalo-Bateria-Grampo-2026')
    await expect(validarNovaSenha('Pitanga-Lanterna-Rio-2027', e, atual)).resolves.toBeUndefined()
  })
})
