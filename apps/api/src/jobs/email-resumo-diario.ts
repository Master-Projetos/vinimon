import type { TipoNotificacao } from '@vinimon/shared'
import { DateTime } from 'luxon'
import { obterConfig } from '../lib/config'
import { despacharEmail, enfileirarEmail } from '../lib/email'
import { prisma } from '../lib/prisma'
import type { UsuarioSessao } from '../lib/sessao'
import { textoEmailNotificacao } from '../modules/notificacoes/email-notificacao'
import { whereNotificacoesVisiveis } from '../modules/notificacoes/service'

const LIMITE_NOTIFICACOES = 200

/**
 * Resumo diário por e-mail (§5.6, canal RESUMO): para cada usuário ativo com RESUMO em algum tipo, junta num e-mail só
 * as notificações não lidas dos tipos escolhidos que ele ainda vê, recebidas no dia anterior (fuso do sistema).
 * Só rótulos de sistema (S102). Idempotente por dia: a chave `resumo:<usuario>:<dia>` não gera dois e-mails.
 */
export async function enviarResumoDiario(agora: Date): Promise<{ enviados: number }> {
  const config = await obterConfig()
  if (!config['email.habilitado']) return { enviados: 0 }
  const fuso = config['sistema.fusoHorario']
  const hoje = DateTime.fromJSDate(agora, { zone: fuso }).startOf('day')
  const ontem = hoje.minus({ days: 1 })

  const preferencias = await prisma.preferenciaNotificacao.findMany({
    where: { email: 'RESUMO' },
    select: { usuarioId: true, tipo: true },
  })
  const tiposPorUsuario = new Map<number, TipoNotificacao[]>()
  for (const p of preferencias) tiposPorUsuario.set(p.usuarioId, [...(tiposPorUsuario.get(p.usuarioId) ?? []), p.tipo])

  let enviados = 0
  for (const [usuarioId, tipos] of tiposPorUsuario) {
    const usuario = await prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: {
        id: true,
        nome: true,
        login: true,
        email: true,
        perfil: true,
        areaId: true,
        ativo: true,
        areasSecundarias: { select: { areaId: true } },
      },
    })
    if (!usuario?.ativo || usuario.email === null) continue
    const para = usuario.email
    const secundarias = usuario.areasSecundarias.map((a) => a.areaId)
    const sessao: UsuarioSessao = {
      id: usuario.id,
      nome: usuario.nome,
      login: usuario.login,
      perfil: usuario.perfil,
      areaId: usuario.areaId,
      areaIds: usuario.areaId === null ? secundarias : [usuario.areaId, ...secundarias],
      sessaoId: '',
      estado: 'ATIVA',
      mfaAtivo: false,
    }

    const notificacoes = await prisma.notificacao.findMany({
      where: {
        AND: [
          whereNotificacoesVisiveis(sessao),
          { lidaEm: null },
          { tipo: { in: tipos } },
          { atualizadoEm: { gte: ontem.toJSDate(), lt: hoje.toJSDate() } },
        ],
      },
      select: { chamadoId: true, tipo: true, interno: true },
      orderBy: [{ chamadoId: 'asc' }, { id: 'asc' }],
      take: LIMITE_NOTIFICACOES,
    })
    if (notificacoes.length === 0) continue

    const linhas = notificacoes.map((n) => textoEmailNotificacao(n.tipo, n.interno, n.chamadoId, {}))
    const emailId = await prisma.$transaction((tx) =>
      enfileirarEmail(tx, {
        para,
        assunto: `Vinimon: ${notificacoes.length} notificação(ões) de ontem`,
        texto: `Notificações de ontem que ainda não foram lidas:\n\n${linhas.join('\n')}`,
        evento: 'RESUMO_DIARIO',
        usuarioId,
        chaveIdempotencia: `resumo:${usuarioId}:${ontem.toFormat('yyyy-MM-dd')}`,
      }),
    )
    await despacharEmail(emailId)
    enviados++
  }
  return { enviados }
}
