import { describe, expect, it } from 'vitest'
import { exigeMfa, PERMISSOES_POR_PERFIL, temPermissao } from './permissoes'

describe('PERMISSOES_POR_PERFIL', () => {
  it('USUARIO tem exatamente as 4 permissões da §3.5', () => {
    expect([...PERMISSOES_POR_PERFIL.USUARIO].sort()).toEqual(
      ['anexo.enviar', 'chamado.abrir', 'chamado.comentar', 'painel.ver'].sort(),
    )
  })

  it('OPERADOR não tem chamado.verTodos nem cadastro.gerenciar', () => {
    expect(temPermissao('OPERADOR', 'chamado.verTodos')).toBe(false)
    expect(temPermissao('OPERADOR', 'cadastro.gerenciar')).toBe(false)
  })
})

describe('exigeMfa', () => {
  it('não exige 2FA para USUARIO', () => {
    expect(exigeMfa('USUARIO')).toBe(false)
  })

  it('exige 2FA para OPERADOR e ADMIN', () => {
    expect(exigeMfa('OPERADOR')).toBe(true)
    expect(exigeMfa('ADMIN')).toBe(true)
  })
})
