import { prisma } from '../lib/prisma'

const UM_DIA_MS = 24 * 60 * 60 * 1000

/** Apaga sessões expiradas ou revogadas há mais de 7 dias e `falhas_login` com mais de 24 h (S25). */
export async function limparSessoes(agora: Date): Promise<{ sessoes: number; falhasLogin: number }> {
  const limiteSessao = new Date(agora.getTime() - 7 * UM_DIA_MS)
  const limiteFalhas = new Date(agora.getTime() - UM_DIA_MS)
  const sessoes = await prisma.sessao.deleteMany({
    where: { OR: [{ expiraEm: { lt: limiteSessao } }, { revogadaEm: { lt: limiteSessao } }] },
  })
  const falhas = await prisma.falhaLogin.deleteMany({ where: { criadoEm: { lt: limiteFalhas } } })
  return { sessoes: sessoes.count, falhasLogin: falhas.count }
}
