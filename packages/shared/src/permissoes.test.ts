import { describe, expect, it } from 'vitest'
import { exigeMfa, PERMISSOES, PERMISSOES_POR_PERFIL, temPermissao } from './permissoes'

describe('permissões por perfil', () => {
  it('USUARIO tem exatamente as 4 permissões da §3.5', () => {
    expect([...PERMISSOES_POR_PERFIL.USUARIO].sort()).toEqual([
      'anexo.enviar',
      'chamado.abrir',
      'chamado.comentar',
      'painel.ver',
    ])
  })

  it('OPERADOR não vê tudo nem gerencia cadastros', () => {
    expect(temPermissao('OPERADOR', 'chamado.verTodos')).toBe(false)
    expect(temPermissao('OPERADOR', 'cadastro.gerenciar')).toBe(false)
    expect(temPermissao('OPERADOR', 'chamado.atender')).toBe(true)
  })

  it('ADMIN tem todas as permissões', () => {
    for (const p of PERMISSOES) expect(temPermissao('ADMIN', p)).toBe(true)
  })

  it('2FA é obrigatório só para a equipe', () => {
    expect(exigeMfa('USUARIO')).toBe(false)
    expect(exigeMfa('OPERADOR')).toBe(true)
    expect(exigeMfa('ADMIN')).toBe(true)
  })
})
