import closeWithGrace from 'close-with-grace'
import { buildApp } from './app'
import { env } from './env'
import { iniciarJobs } from './jobs'
import { prisma } from './lib/prisma'

const app = await buildApp()
const boss = env.JOBS_HABILITADOS ? await iniciarJobs(app.log) : null

closeWithGrace({ delay: 10_000 }, async ({ signal, err }) => {
  if (err) app.log.error({ err }, 'encerrando após erro')
  else app.log.info({ signal }, 'encerrando')
  await app.close()
  await boss?.stop()
  await prisma.$disconnect()
})

await app.listen({ host: env.HOST, port: env.PORT })
