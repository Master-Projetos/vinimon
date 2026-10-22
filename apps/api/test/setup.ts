// apps/api/test/setup.ts
import { afterAll } from 'vitest'
import { prisma } from '../src/lib/prisma'
import { garantirBancoDeTeste } from './constantes'

garantirBancoDeTeste(process.env.DATABASE_URL ?? '')

afterAll(async () => {
  await prisma.$disconnect()
})
