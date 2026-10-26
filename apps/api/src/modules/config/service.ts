import { type AtualizarConfig, type ChaveConfig, CONFIG_PADRAO, type Config } from '@vinimon/shared'
import { Prisma } from '../../generated/prisma/client'
import { auditar } from '../../lib/auditoria'
import { invalidarConfig, obterConfig } from '../../lib/config'
import type { ContextoUsuario } from '../../lib/contexto'
import { ErroApp, regraNegocio } from '../../lib/erros'
import { prisma } from '../../lib/prisma'
import { tempoReal } from '../../lib/tempo-real'

const MENSAGEM_JORNADA_INATIVA = 'A jornada padrão precisa estar ativa.'

export const obterConfigApi = (): Promise<Config> => obterConfig()

/** Campo Json não aceita `null` direto no Prisma: o null vai como JsonNull. */
const paraJson = (valor: Config[ChaveConfig]) => (valor === null ? Prisma.JsonNull : valor)

/** Só as chaves enviadas são gravadas; a auditoria traz apenas as que mudaram de valor. */
export async function atualizarConfig(dados: AtualizarConfig, ctx: ContextoUsuario): Promise<Config> {
  const entradas = Object.entries(dados) as [ChaveConfig, Config[ChaveConfig]][]

  await prisma.$transaction(async (tx) => {
    const jornadaId = dados['sla.jornadaPadraoId']
    if (typeof jornadaId === 'number') {
      const jornada = await tx.jornada.findUnique({ where: { id: jornadaId }, select: { ativo: true } })
      if (!jornada) throw new ErroApp(422, 'REFERENCIA_INVALIDA', 'A jornada padrão não existe.')
      if (!jornada.ativo) throw regraNegocio(MENSAGEM_JORNADA_INATIVA)
    }

    const retornoId = dados['inatividade.statusRetornoId']
    if (typeof retornoId === 'number') {
      const destino = await tx.status.findFirst({
        where: { id: retornoId, ativo: true, tipo: { in: ['ABERTO', 'EM_ATENDIMENTO'] } },
        select: { id: true },
      })
      if (!destino)
        throw regraNegocio('O status de retorno precisa estar ativo e ser do tipo Aberto ou Em atendimento.')
    }
    const monitorados = dados['inatividade.statusIds']
    if (monitorados !== undefined && monitorados.length > 0) {
      const existentes = await tx.status.count({ where: { id: { in: monitorados }, ativo: true } })
      if (existentes !== new Set(monitorados).size) throw regraNegocio('Há status monitorado inexistente ou inativo.')
    }

    const linhas = await tx.config.findMany({ where: { chave: { in: entradas.map(([chave]) => chave) } } })
    const atualPorChave = new Map(linhas.map((linha) => [linha.chave, linha.valor]))
    const antes: Record<string, unknown> = {}
    const depois: Record<string, unknown> = {}

    for (const [chave, valor] of entradas) {
      const atual: unknown = atualPorChave.has(chave) ? atualPorChave.get(chave) : CONFIG_PADRAO[chave]
      await tx.config.upsert({
        where: { chave },
        create: { chave, valor: paraJson(valor) },
        update: { valor: paraJson(valor) },
      })
      if (atual !== valor) {
        antes[chave] = atual
        depois[chave] = valor
      }
    }

    if (Object.keys(depois).length > 0) {
      await auditar(tx, ctx, { acao: 'config.alterada', entidade: 'config', dados: { antes, depois } })
    }
  })

  // Efeito fora da transação: só depois do commit.
  invalidarConfig()
  if (dados['chamado.isolarAreas'] !== undefined) tempoReal.revalidarTodos()
  return obterConfig()
}
