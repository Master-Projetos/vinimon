import {
  type EntrarBody,
  PERMISSOES_POR_PERFIL,
  type SessaoResposta,
  type TrocarSenhaBody,
  type UsuarioMe,
} from '@vinimon/shared'
import { auditar } from '../../lib/auditoria'
import { obterConfig } from '../../lib/config'
import type { Contexto, ContextoUsuario } from '../../lib/contexto'
import { ErroApp, loginInvalido, muitasTentativas } from '../../lib/erros'
import { validarNovaSenha } from '../../lib/forca-senha'
import { prisma } from '../../lib/prisma'
import { hashSenha, verificarSenha } from '../../lib/senha'
import {
  criarSessao,
  csrfDaSessao,
  desconectarSessoes,
  promoverSessao,
  revogarSessao,
  revogarSessoesDoUsuario,
} from '../../lib/sessao'
import { estadoAposSenha, estadoAposTrocaSenha } from './estados'

const JANELA_MS = 15 * 60_000
const MAX_FALHAS_LOGIN = 5
const MAX_FALHAS_IP = 30

/** O schema já normalizou o login (trim + lowercase) e limitou a senha a 128. */
export async function entrar(dados: EntrarBody, ctx: Contexto & { ip: string }) {
  const login = dados.login
  const desde = new Date(Date.now() - JANELA_MS)
  const [falhasLogin, falhasIp] = await Promise.all([
    prisma.falhaLogin.count({ where: { loginNormalizado: login, criadoEm: { gte: desde } } }),
    prisma.falhaLogin.count({ where: { ip: ctx.ip, criadoEm: { gte: desde } } }),
  ])
  // Igual para login existente ou não; vale mesmo com a senha certa (S40).
  if (falhasLogin >= MAX_FALHAS_LOGIN)
    throw muitasTentativas('Muitas tentativas para este login. Tente novamente em 15 minutos.')
  if (falhasIp >= MAX_FALHAS_IP)
    throw muitasTentativas('Muitas tentativas a partir deste endereço. Tente novamente em 15 minutos.')

  const u = await prisma.usuario.findUnique({
    where: { login },
    select: { id: true, ativo: true, perfil: true, senhaHash: true, deveTrocarSenha: true, mfaAtivadoEm: true },
  })
  const candidato = u?.ativo ? u : null
  const { ok, precisaRehash } = await verificarSenha(dados.senha, candidato?.senhaHash ?? null)

  if (!ok || candidato === null) {
    await prisma.$transaction(async (tx) => {
      await tx.falhaLogin.create({ data: { loginNormalizado: login, ip: ctx.ip } })
      await auditar(tx, ctx, { acao: 'login.falha', entidade: 'usuario', entidadeId: u?.id ?? null, dados: { login } })
      if (falhasLogin + 1 === MAX_FALHAS_LOGIN) {
        await auditar(tx, ctx, {
          acao: 'login.bloqueado',
          entidade: 'usuario',
          entidadeId: u?.id ?? null,
          dados: { login },
        })
      }
    })
    throw loginInvalido()
  }

  const estado = estadoAposSenha(candidato)
  const novoHash = precisaRehash ? await hashSenha(dados.senha) : null // fora da transação (custo de CPU)
  await prisma.$transaction(async (tx) => {
    if (novoHash) {
      await tx.usuario.update({ where: { id: candidato.id }, data: { senhaHash: novoHash } })
      await auditar(tx, ctx, { acao: 'senha.migrada', entidade: 'usuario', entidadeId: candidato.id })
    }
    await tx.falhaLogin.deleteMany({ where: { loginNormalizado: login } })
    if (estado === 'ATIVA')
      await tx.usuario.update({ where: { id: candidato.id }, data: { ultimoLoginEm: new Date() } })
    await auditar(tx, ctx, { acao: 'login.sucesso', entidade: 'usuario', entidadeId: candidato.id, dados: { estado } })
  })
  const sessao = await criarSessao({ usuarioId: candidato.id, estado, ip: ctx.ip, userAgent: ctx.userAgent })
  return { ...sessao, estado, usuarioId: candidato.id }
}

export async function obterUsuarioMe(id: number): Promise<UsuarioMe> {
  const u = await prisma.usuario.findUniqueOrThrow({
    where: { id },
    select: {
      id: true,
      nome: true,
      login: true,
      email: true,
      telefone: true,
      perfil: true,
      areaId: true,
      deveTrocarSenha: true,
      mfaAtivadoEm: true,
      tema: true,
      densidade: true,
      enviarComEnter: true,
      areasSecundarias: { select: { areaId: true } },
    },
  })
  const secundarias = u.areasSecundarias.map((a) => a.areaId)
  return {
    id: u.id,
    nome: u.nome,
    login: u.login,
    email: u.email,
    telefone: u.telefone,
    perfil: u.perfil,
    areaId: u.areaId,
    areaIds: u.areaId === null ? secundarias : [u.areaId, ...secundarias],
    permissoes: [...PERMISSOES_POR_PERFIL[u.perfil]],
    mfaAtivo: u.mfaAtivadoEm !== null,
    deveTrocarSenha: u.deveTrocarSenha,
    tema: u.tema,
    densidade: u.densidade,
    enviarComEnter: u.enviarComEnter,
  }
}

export async function sair(ctx: ContextoUsuario): Promise<void> {
  await revogarSessao(ctx.usuario.sessaoId, 'logout')
  await prisma.$transaction((tx) =>
    auditar(tx, ctx, { acao: 'logout', entidade: 'usuario', entidadeId: ctx.usuario.id }),
  )
}

/** POST /auth/trocar-senha: grava a nova senha, revoga as outras sessões e rotaciona o token desta (S15, S19). */
export async function trocarSenha(
  corpo: TrocarSenhaBody,
  ctx: ContextoUsuario,
): Promise<{ resposta: SessaoResposta; token: string; expiraEm: Date }> {
  const u = await prisma.usuario.findUniqueOrThrow({
    where: { id: ctx.usuario.id },
    select: { id: true, login: true, nome: true, email: true, perfil: true, mfaAtivadoEm: true },
  })
  const [atual] = await prisma.$queryRaw<
    { senha_hash: string | null }[]
  >`SELECT senha_hash FROM usuarios WHERE id = ${u.id}`
  const hashAtual = atual?.senha_hash ?? null
  if (!(await verificarSenha(corpo.senhaAtual, hashAtual)).ok) {
    throw new ErroApp(400, 'VALIDACAO', 'Senha atual incorreta.', [
      { campo: 'senhaAtual', mensagem: 'Senha atual incorreta.' },
    ])
  }
  const cfg = await obterConfig()
  await validarNovaSenha(
    corpo.novaSenha,
    { login: u.login, nome: u.nome, email: u.email, organizacao: cfg['sistema.organizacao'] },
    hashAtual,
  )
  const novoHash = await hashSenha(corpo.novaSenha) // fora da transação (custo de CPU)

  const revogadas = await prisma.$transaction(async (tx) => {
    await tx.usuario.update({
      where: { id: u.id },
      data: { senhaHash: novoHash, deveTrocarSenha: false, senhaAlteradaEm: new Date() },
    })
    await auditar(tx, ctx, { acao: 'senha.alterada', entidade: 'usuario', entidadeId: u.id })
    return revogarSessoesDoUsuario(tx, u.id, 'troca_senha', ctx.usuario.sessaoId)
  })
  desconectarSessoes(revogadas, 'troca_senha')
  const estado = estadoAposTrocaSenha({ perfil: u.perfil, deveTrocarSenha: false, mfaAtivadoEm: u.mfaAtivadoEm })
  const nova = await promoverSessao(ctx.usuario.sessaoId, estado)
  if (estado === 'ATIVA') await prisma.usuario.update({ where: { id: u.id }, data: { ultimoLoginEm: new Date() } })
  return {
    resposta: {
      estado,
      csrf: csrfDaSessao(ctx.usuario.sessaoId),
      usuario: estado === 'ATIVA' ? await obterUsuarioMe(u.id) : null,
    },
    ...nova,
  }
}
