import { CHAVES_CONFIG_PUBLICAS, type Meta, temPermissao } from '@vinimon/shared'
import { obterConfig } from '../../lib/config'
import { prisma } from '../../lib/prisma'
import type { UsuarioSessao } from '../../lib/sessao'
import { destinosDaArea } from '../areas/service'

/** Catálogos ativos em uma única leitura. `tags` só entram para quem atende chamados (`chamado.atender`). */
export async function obterMeta(usuario: UsuarioSessao): Promise<Meta> {
  const [areas, prioridades, status, problemas, canais, departamentos, unidades, tiposAtivo, jornadas, categorias] =
    await prisma.$transaction([
      prisma.area.findMany({
        where: { ativo: true },
        select: { id: true, nome: true, atende: true },
        orderBy: { nome: 'asc' },
      }),
      prisma.prioridade.findMany({
        where: { ativo: true },
        select: { id: true, nome: true, cor: true, ordem: true, padrao: true },
        orderBy: [{ ordem: 'asc' }, { id: 'asc' }],
      }),
      prisma.status.findMany({
        where: { ativo: true },
        select: { id: true, nome: true, tipo: true, papel: true, cor: true, ignorado: true },
        orderBy: [{ ordem: 'asc' }, { id: 'asc' }],
      }),
      prisma.problema.findMany({
        where: { ativo: true },
        select: {
          id: true,
          nome: true,
          descricao: true,
          areaPadraoId: true,
          areas: { select: { areaId: true }, orderBy: { areaId: 'asc' } },
        },
        orderBy: { nome: 'asc' },
      }),
      prisma.canal.findMany({ where: { ativo: true }, select: { id: true, nome: true }, orderBy: { nome: 'asc' } }),
      prisma.departamento.findMany({
        where: { ativo: true },
        select: { id: true, nome: true, unidadeId: true },
        orderBy: { nome: 'asc' },
      }),
      prisma.unidade.findMany({ where: { ativo: true }, select: { id: true, nome: true }, orderBy: { nome: 'asc' } }),
      prisma.tipoAtivo.findMany({ where: { ativo: true }, select: { id: true, nome: true }, orderBy: { nome: 'asc' } }),
      prisma.jornada.findMany({ where: { ativo: true }, select: { id: true, nome: true }, orderBy: { nome: 'asc' } }),
      prisma.categoriaArtigo.findMany({
        where: { ativo: true },
        select: { id: true, nome: true },
        orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
      }),
    ])

  const destinosPermitidos = (await destinosDaArea(prisma, usuario.areaId)).map((d) => ({
    areaId: d.areaDestinoId,
    padrao: d.padrao,
  }))
  const tags = temPermissao(usuario.perfil, 'chamado.atender')
    ? await prisma.tag.findMany({ where: { ativo: true }, select: { id: true, nome: true }, orderBy: { nome: 'asc' } })
    : undefined

  const config = await obterConfig()
  const configPublica = Object.fromEntries(CHAVES_CONFIG_PUBLICAS.map((chave) => [chave, config[chave]]))

  return {
    areas,
    prioridades,
    status,
    problemas: problemas.map(({ areas: vinculos, ...problema }) => ({
      ...problema,
      areaIds: vinculos.map((v) => v.areaId),
    })),
    canais,
    departamentos,
    unidades,
    tiposAtivo,
    jornadas,
    categorias,
    destinosPermitidos,
    config: configPublica,
    ...(tags === undefined ? {} : { tags }),
  }
}
