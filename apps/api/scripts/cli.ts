import { parseArgs } from 'node:util'
import { generate } from 'otplib'
import { auditar } from '../src/lib/auditoria'
import { CONTEXTO_SISTEMA } from '../src/lib/contexto'
import { decifrar } from '../src/lib/cripto'
import { prisma } from '../src/lib/prisma'
import { hashSenha, senhaAleatoria } from '../src/lib/senha'
import { revogarSessoesDoUsuario } from '../src/lib/sessao'

const AJUDA = `Uso: pnpm -F @vinimon/api cli <comando> <login>

  usuario:redefinir-senha <login>   gera senha temporária, exige troca no próximo acesso e encerra as sessões
  totp:codigo <login>               imprime o código TOTP atual (só fora de produção)
`

/** O pnpm repassa o "--" ao script: ele vem como primeiro argumento. */
export function lerArgs(argv: string[]) {
  const args = [...argv]
  if (args[0] === '--') args.shift()
  const { positionals } = parseArgs({ args, options: {}, strict: true, allowPositionals: true })
  return { comando: positionals[0], login: positionals[1]?.trim().toLowerCase() }
}

async function redefinirSenha(login: string): Promise<void> {
  const u = await prisma.usuario.findUnique({ where: { login }, select: { id: true } })
  if (!u) throw new Error(`Usuário "${login}" não existe.`)
  const senha = senhaAleatoria(16)
  const hash = await hashSenha(senha)
  const revogadas = await prisma.$transaction(async (tx) => {
    await tx.usuario.update({ where: { id: u.id }, data: { senhaHash: hash, deveTrocarSenha: true } })
    await auditar(tx, CONTEXTO_SISTEMA, {
      acao: 'senha.redefinida',
      entidade: 'usuario',
      entidadeId: u.id,
      dados: { origem: 'cli' },
    })
    return revogarSessoesDoUsuario(tx, u.id, 'senha_redefinida')
  })
  process.stdout.write(
    `Senha temporária de ${login}: ${senha}\nA troca é obrigatória no próximo acesso. ${revogadas.length} sessão(ões) encerrada(s).\n`,
  )
}

async function codigoTotp(login: string): Promise<void> {
  if (process.env.NODE_ENV === 'production') throw new Error('totp:codigo é proibido em produção.')
  const [u] = await prisma.$queryRaw<
    { totp_secret_enc: string | null }[]
  >`SELECT totp_secret_enc FROM usuarios WHERE login = ${login}`
  if (!u?.totp_secret_enc) throw new Error(`"${login}" não tem 2FA ativo.`)
  process.stdout.write(`${await generate({ secret: decifrar(u.totp_secret_enc) })}\n`)
}

async function main(): Promise<void> {
  const { comando, login } = lerArgs(process.argv.slice(2))
  if (!comando || !login) {
    process.stderr.write(AJUDA)
    process.exitCode = 2
    return
  }
  if (comando === 'usuario:redefinir-senha') await redefinirSenha(login)
  else if (comando === 'totp:codigo') await codigoTotp(login)
  else {
    process.stderr.write(`Comando desconhecido: ${comando}\n${AJUDA}`)
    process.exitCode = 2
  }
}

if (process.argv[1]?.endsWith('cli.ts')) {
  await main()
    .catch((e) => {
      process.stderr.write(`Erro: ${e instanceof Error ? e.message : String(e)}\n`)
      process.exitCode = 1
    })
    .finally(() => prisma.$disconnect())
}
