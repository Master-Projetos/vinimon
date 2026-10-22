export const PERFIS = ['ADMIN', 'OPERADOR', 'USUARIO'] as const
export type Perfil = (typeof PERFIS)[number]
export const ROTULOS_PERFIL: Record<Perfil, string> = {
  ADMIN: 'Administrador',
  OPERADOR: 'Operador',
  USUARIO: 'Usuário',
}

export const PERMISSOES = [
  'chamado.abrir',
  'chamado.abrirEmNome',
  'chamado.verArea',
  'chamado.verTodos',
  'chamado.comentar',
  'chamado.verInterno',
  'chamado.atender',
  'anexo.enviar',
  'painel.ver',
  'relatorio.ver',
  'inventario.ver',
  'inventario.gerenciar',
  'conhecimento.verInterno',
  'conhecimento.gerenciar',
  'usuario.buscar',
  'cadastro.gerenciar',
  'usuario.gerenciar',
  'config.gerenciar',
  'auditoria.ver',
  'sessao.revogarQualquer',
] as const
export type Permissao = (typeof PERMISSOES)[number]

const DO_USUARIO: readonly Permissao[] = ['chamado.abrir', 'chamado.comentar', 'anexo.enviar', 'painel.ver']
const DO_OPERADOR: readonly Permissao[] = [
  ...DO_USUARIO,
  'chamado.abrirEmNome',
  'chamado.verArea',
  'chamado.verInterno',
  'chamado.atender',
  'relatorio.ver',
  'inventario.ver',
  'inventario.gerenciar',
  'conhecimento.verInterno',
  'conhecimento.gerenciar',
  'usuario.buscar',
]

export const PERMISSOES_POR_PERFIL: Record<Perfil, ReadonlySet<Permissao>> = {
  ADMIN: new Set(PERMISSOES),
  OPERADOR: new Set(DO_OPERADOR),
  USUARIO: new Set(DO_USUARIO),
}

export const temPermissao = (perfil: Perfil, permissao: Permissao): boolean =>
  PERMISSOES_POR_PERFIL[perfil].has(permissao)
/** 2FA obrigatório (S26). */
export const exigeMfa = (perfil: Perfil): boolean => perfil !== 'USUARIO'
