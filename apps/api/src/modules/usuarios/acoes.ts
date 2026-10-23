import { auditar } from '../../lib/auditoria'
import type { ContextoUsuario } from '../../lib/contexto'
import { conflito, ErroApp, naoEncontrado } from '../../lib/erros'
import { prisma, type Tx } from '../../lib/prisma'
import { hashSenha, senhaAleatoria, verificarSenha } from '../../lib/senha'
import { desconectarSessoes, type MotivoRevogacao, revogarSessoesDoUsuario } from '../../lib/sessao'
import { tempoReal } from '../../lib/tempo-real'

const TRAVA_ULTIMO_ADMIN = 'usuarios.ultimo_admin'

/** Efeitos de tempo real: só depois do commit da transação que revogou as sessões. */
function aposCommit(id: number, sessoes: readonly string[], motivo: MotivoRevogacao) {
  desconectarSessoes(sessoes, motivo)
  tempoReal.revalidarUsuario(id)
}

async function exigirAlvo(tx: Tx, id: number) {
  const alvo = await tx.usuario.findUnique({
    where: { id },
    select: { id: true, login: true, perfil: true, ativo: true },
  })
  if (!alvo) throw naoEncontrado('Usuário não encontrado.')
  return alvo
}

/** POST /usuarios/:id/redefinir-senha: senha temporária mostrada uma única vez (S16). */
export async function redefinirSenha(id: number, ctx: ContextoUsuario) {
  const senhaTemporaria = senhaAleatoria(16)
  const senhaHash = await hashSenha(senhaTemporaria)
  const sessoes = await prisma.$transaction(async (tx) => {
    await exigirAlvo(tx, id)
    await tx.usuario.update({
      where: { id },
      data: { senhaHash, deveTrocarSenha: true, senhaAlteradaEm: new Date() },
    })
    const revogadas = await revogarSessoesDoUsuario(tx, id, 'senha_redefinida')
    await auditar(tx, ctx, { acao: 'senha.redefinida', entidade: 'usuario', entidadeId: id })
    return revogadas
  })
  aposCommit(id, sessoes, 'senha_redefinida')
  return { senhaTemporaria }
}

/** POST /usuarios/:id/resetar-2fa: exige a senha do administrador logado (S31). */
export async function resetar2fa(id: number, senhaAdmin: string, ctx: ContextoUsuario) {
  const ator = await prisma.usuario.findUnique({ where: { id: ctx.usuario.id }, select: { senhaHash: true } })
  const { ok } = await verificarSenha(senhaAdmin, ator?.senhaHash ?? null)
  if (!ok) {
    throw new ErroApp(400, 'VALIDACAO', 'Senha incorreta.', [{ campo: 'senhaAdmin', mensagem: 'Senha incorreta.' }])
  }
  if (id === ctx.usuario.id) throw conflito('Você não pode resetar o próprio 2FA.')
  const sessoes = await prisma.$transaction(async (tx) => {
    await exigirAlvo(tx, id)
    await tx.usuario.update({
      where: { id },
      data: { totpSecretEnc: null, totpSecretPendenteEnc: null, totpUltimoPasso: null, mfaAtivadoEm: null },
    })
    await tx.codigoRecuperacao.deleteMany({ where: { usuarioId: id } })
    const revogadas = await revogarSessoesDoUsuario(tx, id, 'mfa_alterado')
    await auditar(tx, ctx, { acao: 'mfa.removido', entidade: 'usuario', entidadeId: id })
    return revogadas
  })
  aposCommit(id, sessoes, 'mfa_alterado')
}

/** POST /usuarios/:id/encerrar-sessoes (S20). */
export async function encerrarSessoes(id: number, ctx: ContextoUsuario) {
  const sessoes = await prisma.$transaction(async (tx) => {
    await exigirAlvo(tx, id)
    const revogadas = await revogarSessoesDoUsuario(tx, id, 'admin')
    await auditar(tx, ctx, {
      acao: 'sessoes.encerradas',
      entidade: 'usuario',
      entidadeId: id,
      dados: { quantidade: revogadas.length },
    })
    return revogadas
  })
  aposCommit(id, sessoes, 'admin')
}

/** POST /usuarios/:id/desbloquear-login: apaga as falhas do login do alvo (S40). */
export async function desbloquearLogin(id: number, ctx: ContextoUsuario) {
  await prisma.$transaction(async (tx) => {
    const alvo = await exigirAlvo(tx, id)
    await tx.falhaLogin.deleteMany({ where: { loginNormalizado: alvo.login } })
    await auditar(tx, ctx, { acao: 'login.desbloqueado', entidade: 'usuario', entidadeId: id })
  })
}

/** POST /usuarios/:id/anonimizar (S122): marcadores no lugar dos dados pessoais, histórico preservado. */
export async function anonimizarUsuario(id: number, ctx: ContextoUsuario) {
  const marcador = `Usuário anonimizado #${id}`
  const sessoes = await prisma.$transaction(async (tx) => {
    // Serializa com atualizarUsuario: a contagem do último ADMIN vale dentro da transação.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${TRAVA_ULTIMO_ADMIN}))`
    const alvo = await exigirAlvo(tx, id)
    if (id === ctx.usuario.id) throw conflito('Você não pode anonimizar a própria conta.')
    if (alvo.perfil === 'ADMIN' && alvo.ativo) {
      const outros = await tx.usuario.count({ where: { perfil: 'ADMIN', ativo: true, id: { not: id } } })
      if (outros === 0) throw conflito('Não é possível anonimizar o último administrador ativo.')
    }
    await tx.usuario.update({
      where: { id },
      data: {
        nome: marcador,
        email: null,
        telefone: null,
        login: `anon${id}`,
        senhaHash: null,
        ativo: false,
        anonimizadoEm: new Date(),
        totpSecretEnc: null,
        totpSecretPendenteEnc: null,
        totpUltimoPasso: null,
        mfaAtivadoEm: null,
      },
    })
    await tx.codigoRecuperacao.deleteMany({ where: { usuarioId: id } })
    await tx.falhaLogin.deleteMany({ where: { loginNormalizado: alvo.login } })
    await tx.chamado.updateMany({
      where: { solicitanteId: id },
      data: { contato: marcador, contatoEmail: null, telefone: null },
    })
    const idTexto = String(id)
    await tx.$executeRaw`UPDATE assentamentos SET texto = regexp_replace(texto, '@\\[[^\\]]*\\]\\(usuario:' || ${idTexto}::text || '\\)', '@[Usuário anonimizado #' || ${idTexto}::text || '](usuario:' || ${idTexto}::text || ')', 'g') WHERE texto LIKE '%(usuario:' || ${idTexto}::text || ')%'`
    const revogadas = await revogarSessoesDoUsuario(tx, id, 'usuario_desativado')
    await auditar(tx, ctx, { acao: 'usuario.anonimizado', entidade: 'usuario', entidadeId: id })
    return revogadas
  })
  aposCommit(id, sessoes, 'usuario_desativado')
}
