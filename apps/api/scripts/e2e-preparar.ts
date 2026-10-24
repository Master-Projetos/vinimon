// Preparo do banco dos testes E2E (T-11.4): migra, esvazia, semeia e cria os usuários de teste.
// Só roda em um banco cujo nome termina em `_e2e`, porque apaga todas as tabelas.
import { execFileSync } from 'node:child_process'
import { seedBase, seedInicial } from '../prisma/seed'
import { Prisma } from '../src/generated/prisma/client'
import { cifrar } from '../src/lib/cripto'
import { prisma, type Tx } from '../src/lib/prisma'
import { hashSenha } from '../src/lib/senha'

function exigirBancoE2e(): void {
  const url = process.env.DATABASE_URL ?? ''
  if (!url.endsWith('_e2e')) throw new Error('DATABASE_URL precisa terminar em _e2e: este preparo apaga o banco.')
}

function exigirVariaveis(): { senha: string; segredo: string } {
  const senha = process.env.E2E_SENHA
  const segredo = process.env.E2E_TOTP_SECRET
  if (!senha || !segredo || !process.env.SEED_ADMIN_PASSWORD) {
    throw new Error('Defina E2E_SENHA, E2E_TOTP_SECRET e SEED_ADMIN_PASSWORD.')
  }
  return { senha, segredo }
}

/** Mesma lógica de `limparBanco` (test/ajudantes.ts): esvazia o schema public, exceto o histórico de migrações. */
async function esvaziar(tx: Tx): Promise<void> {
  const tabelas = await tx.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
  const nomes = tabelas.map((t) => t.tablename).filter((n) => /^[a-z_][a-z0-9_]*$/.test(n))
  if (nomes.length > 0) {
    const lista = nomes.map((n) => `"public"."${n}"`).join(', ')
    await tx.$executeRaw`TRUNCATE TABLE ${Prisma.raw(lista)} RESTART IDENTITY CASCADE`
  }
}

/** T72: recua o último uso das sessões do usuário em 16 min, sem migrar, esvaziar nem semear. */
async function recuarSessao(login: string | undefined): Promise<void> {
  if (!login) throw new Error('Informe o login: --recuar-sessao <login>.')
  const { count } = await prisma.sessao.updateMany({
    where: { usuario: { login } },
    data: { ultimoUsoEm: new Date(Date.now() - 16 * 60_000) },
  })
  await prisma.$disconnect()
  process.stdout.write(`Sessões recuadas: ${count}.\n`)
}

async function main(): Promise<void> {
  exigirBancoE2e()
  const args = process.argv.slice(2)
  if (args[0] === '--') args.shift()
  const posicao = args.indexOf('--recuar-sessao')
  if (posicao >= 0) return recuarSessao(args[posicao + 1])
  const { senha, segredo } = exigirVariaveis()
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], { stdio: 'inherit' })
  const hash = await hashSenha(senha)

  await prisma.$transaction(
    async (tx) => {
      await esvaziar(tx)
      await seedBase(tx, { catalogos: true })
      await seedInicial(tx)

      const ti = await tx.area.findUnique({ where: { nome: 'TI' }, select: { id: true } })
      if (!ti) throw new Error('Área TI não foi criada pelo seed.')
      const equipe = { senhaHash: hash, totpSecretEnc: cifrar(segredo), mfaAtivadoEm: new Date() }
      await tx.usuario.create({
        data: { login: 'operador', nome: 'Operador E2E', perfil: 'OPERADOR', areaId: ti.id, ...equipe },
      })
      await tx.usuario.create({ data: { login: 'usuario', nome: 'Usuário E2E', perfil: 'USUARIO', ...equipe } })
      await tx.usuario.create({ data: { login: 'admin-e2e', nome: 'Admin E2E', perfil: 'ADMIN', ...equipe } })
      await tx.usuario.create({ data: { login: 'usuario-t72', nome: 'Usuário T72', perfil: 'USUARIO', ...equipe } })

      const problema = await tx.problema.create({
        data: {
          nome: 'Sem acesso à rede',
          descricao: 'Problema de teste E2E',
          areaPadraoId: ti.id,
          slaSolucaoMin: 480,
        },
        select: { id: true },
      })
      await tx.problemaArea.create({ data: { problemaId: problema.id, areaId: ti.id } })
      await tx.jornada.create({ data: { nome: 'Plantão E2E' } })
    },
    { timeout: 120_000 },
  )
  await prisma.$disconnect()
  process.stdout.write('Banco E2E preparado.\n')
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e)
  await prisma.$disconnect()
  process.exit(1)
})
