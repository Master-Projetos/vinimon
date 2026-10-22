import { PrismaPg } from '@prisma/adapter-pg'
import { env } from '../env'
import { PrismaClient } from '../generated/prisma/client'

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL, max: 10 })

export const prisma = new PrismaClient({
  adapter,
  // Eventos (não stdout): habilitam prisma.$on('query') nos testes de contagem de queries (T-6.8).
  log: [
    { emit: 'event', level: 'query' },
    { emit: 'event', level: 'warn' },
  ],
  omit: {
    usuario: { senhaHash: true, totpSecretEnc: true, totpSecretPendenteEnc: true, buscaNorm: true },
    sessao: { tokenHash: true },
    codigoRecuperacao: { codigoHash: true },
    chamado: { buscaNorm: true },
    ativo: { buscaNorm: true },
    artigo: { buscaNorm: true },
  },
})

/** Cliente dentro de $transaction (também aceita o próprio `prisma`). */
export type Tx = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>
// NÃO chame prisma.$disconnect() dentro do buildApp: só em server.ts e test/setup.ts.
