import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { env } from '../../src/env'
import { DiscoLocal } from '../../src/lib/armazenamento'
import { prisma } from '../../src/lib/prisma'
import { prepararArquivos } from './arquivos'
import { gravar, mapaIdsLegado, type RelatorioGravacao } from './gravar'
import { lerV1 } from './ler'
import { transformar } from './transformar'
import { validar } from './validar'

export type OpcoesImportacao = { sqlite: string; dryRun: boolean; exigirTrocaTodos: boolean }

const USO =
  'Uso: pnpm --filter @vinimon/api importar:v1 --sqlite <caminho> [--dry-run] [--exigir-troca-todos] (sem "--" antes das opções)'

/** O pnpm repassa um `--` ao script; ele é descartado antes do `parseArgs`. */
export function lerArgumentos(argv: readonly string[]): OpcoesImportacao {
  const args = [...argv]
  if (args[0] === '--') args.shift()
  const { values } = parseArgs({
    args,
    options: {
      sqlite: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      'exigir-troca-todos': { type: 'boolean', default: false },
    },
    strict: true,
    allowPositionals: false,
  })
  if (!values.sqlite) throw new Error(`Informe --sqlite <caminho>. ${USO}`)
  return {
    sqlite: resolve(values.sqlite),
    dryRun: values['dry-run'] === true,
    exigirTrocaTodos: values['exigir-troca-todos'] === true,
  }
}

export type ResultadoImportacao = { relatorio: RelatorioGravacao; arquivosGravados: number; anexosJaExistentes: number }

/**
 * Lê, valida (erro algum grava), grava os arquivos (S72) e depois o banco numa transação. `disco` é injetável
 * para os testes; em produção é o `UPLOAD_DIR`.
 */
export async function importar(
  opcoes: OpcoesImportacao,
  disco: DiscoLocal | null,
  agora = new Date(),
): Promise<ResultadoImportacao> {
  const leitura = lerV1(opcoes.sqlite)
  const validacao = validar(leitura)
  if (validacao.erros.length > 0) {
    throw new Error(
      `A validação encontrou ${validacao.erros.length} erro(s); nada foi gravado:\n${validacao.erros.map((e) => `- ${e}`).join('\n')}`,
    )
  }
  // Só os anexos dependem do passo 4; os demais lotes são calculados de novo, com os ids reais, dentro da transação.
  const previa = transformar(leitura, validacao.norm, { canalWebId: 0, jornada24x7Id: 0, unidadePrincipalId: 0, agora })
  const arquivos = await prepararArquivos({
    caminhoSqlite: opcoes.sqlite,
    anexos: previa.lotes.anexos,
    idsLegado: mapaIdsLegado(leitura),
    disco,
    dryRun: opcoes.dryRun,
  })
  const relatorio = await gravar({
    leitura,
    norm: validacao.norm,
    anexos: arquivos.prontos,
    avisosAnteriores: [...validacao.avisos, ...arquivos.avisos],
    dryRun: opcoes.dryRun,
    exigirTrocaTodos: opcoes.exigirTrocaTodos,
    agora,
  })
  return { relatorio, arquivosGravados: arquivos.gravados, anexosJaExistentes: arquivos.jaExistentes }
}

/** Relatório legível: lidas, inseridas, avisos e arquivos. */
export function formatarRelatorio(r: ResultadoImportacao): string {
  const linhas = [
    r.relatorio.dryRun ? 'DRY-RUN: nada foi gravado (a transação foi desfeita).' : 'Importação concluída.',
    '',
    'tabela                lidas  inseridas',
  ]
  for (const t of r.relatorio.tabelas)
    linhas.push(`${t.tabela.padEnd(21)} ${String(t.lidas).padStart(5)}  ${String(t.inseridas).padStart(9)}`)
  linhas.push(
    '',
    `arquivos gravados: ${r.arquivosGravados} (já existentes: ${r.anexosJaExistentes})`,
    `status de sistema criados: ${r.relatorio.statusDoSistemaCriados}`,
  )
  if (r.relatorio.loginsSenhaAnulada.length > 0) {
    linhas.push(
      '',
      `logins com senha padrão (hash anulado; definam nova senha): ${r.relatorio.loginsSenhaAnulada.join(', ')}`,
    )
  }
  if (r.relatorio.avisos.length > 0)
    linhas.push('', `avisos (${r.relatorio.avisos.length}):`, ...r.relatorio.avisos.map((a) => `- ${a}`))
  return linhas.join('\n')
}

async function principal(): Promise<number> {
  try {
    const opcoes = lerArgumentos(process.argv.slice(2))
    const resultado = await importar(opcoes, opcoes.dryRun ? null : new DiscoLocal(env.UPLOAD_DIR))
    process.stdout.write(`${formatarRelatorio(resultado)}\n`)
    return 0
  } catch (erro) {
    process.stderr.write(`${erro instanceof Error ? erro.message : String(erro)}\n`)
    return 1
  } finally {
    await prisma.$disconnect()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await principal()
}
