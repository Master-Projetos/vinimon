import { type ChaveConfig, CONFIG_PADRAO, type Config, ConfigSchema } from '@vinimon/shared'
import { prisma } from './prisma'

let cache: { valor: Config; ate: number } | null = null

/** Lê a tabela config (cache de 30 s); chave inválida no banco cai no padrão. */
export async function obterConfig(): Promise<Config> {
  if (cache && cache.ate > Date.now()) return cache.valor
  const linhas = await prisma.config.findMany()
  const valor: Config = { ...CONFIG_PADRAO }
  const campos = ConfigSchema.shape
  for (const linha of linhas) {
    if (!Object.hasOwn(campos, linha.chave)) continue
    const chave = linha.chave as ChaveConfig
    const r = campos[chave].safeParse(linha.valor)
    if (r.success) Object.assign(valor, { [chave]: r.data })
  }
  cache = { valor, ate: Date.now() + 30_000 }
  return valor
}

export const invalidarConfig = (): void => {
  cache = null
}
