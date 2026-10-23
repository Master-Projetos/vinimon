import { randomUUID } from 'node:crypto'
import type { AtualizarModeloEmail, EnviarTesteEmail } from '@vinimon/shared'
import type { Prisma } from '../../generated/prisma/client'
import { auditar } from '../../lib/auditoria'
import type { ContextoUsuario } from '../../lib/contexto'
import { despacharEmail, enfileirarEmail } from '../../lib/email'
import { naoEncontrado } from '../../lib/erros'
import { prisma } from '../../lib/prisma'
import { render } from './render'

/** Projeção única do módulo (nunca devolva a linha inteira). */
export const selectModeloEmail = {
  evento: true,
  assunto: true,
  corpoTexto: true,
  ativo: true,
  atualizadoEm: true,
} satisfies Prisma.ModeloEmailSelect

export function listarModelosEmail() {
  return prisma.modeloEmail.findMany({ select: selectModeloEmail, orderBy: { evento: 'asc' } })
}

export async function obterModeloEmail(evento: string) {
  const modelo = await prisma.modeloEmail.findUnique({ where: { evento }, select: selectModeloEmail })
  if (!modelo) throw naoEncontrado('Modelo de e-mail não encontrado.')
  return modelo
}

export function atualizarModeloEmail(evento: string, dados: AtualizarModeloEmail, ctx: ContextoUsuario) {
  return prisma.$transaction(async (tx) => {
    const antes = await tx.modeloEmail.findUnique({ where: { evento }, select: selectModeloEmail })
    if (!antes) throw naoEncontrado('Modelo de e-mail não encontrado.')
    const depois = await tx.modeloEmail.update({
      where: { evento },
      data: { assunto: dados.assunto, corpoTexto: dados.corpoTexto, ativo: dados.ativo },
      select: selectModeloEmail,
    })
    await auditar(tx, ctx, {
      acao: 'cadastro.alterado',
      entidade: 'modelo_email',
      entidadeId: evento,
      dados: { antes, depois },
    })
    return depois
  })
}

/** Envio de teste: grava na outbox, depois do commit agenda o job de envio. Não depende do modelo salvo. */
export async function enviarTesteEmail(dados: EnviarTesteEmail): Promise<{ id: number }> {
  const { assunto, texto, html } = render(
    {
      assunto: 'Teste de e-mail do Vinimon',
      corpoTexto:
        'Este é um e-mail de teste enviado pelo Vinimon. Se você recebeu esta mensagem, o envio está funcionando.',
    },
    {},
  )
  const id = await prisma.$transaction((tx) =>
    enfileirarEmail(tx, {
      para: dados.para,
      assunto,
      texto,
      html,
      evento: 'teste',
      chaveIdempotencia: `teste:${randomUUID()}`,
    }),
  )
  await despacharEmail(id)
  return { id }
}
