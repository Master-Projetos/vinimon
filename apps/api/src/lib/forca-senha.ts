import { type EntradasForca, SenhaSchema } from '@vinimon/shared'
import { ZxcvbnFactory } from '@zxcvbn-ts/core'
import * as common from '@zxcvbn-ts/language-common'
import * as ptBr from '@zxcvbn-ts/language-pt-br'
import { ErroApp } from './erros'
import { verificarSenha } from './senha'

// zxcvbn 4.x não exporta zxcvbnOptions: a fábrica é criada uma vez, na primeira avaliação.
let fabrica: ZxcvbnFactory | undefined
const obter = () =>
  (fabrica ??= new ZxcvbnFactory({
    dictionary: { ...common.dictionary, ...ptBr.dictionary },
    graphs: common.adjacencyGraphs,
    translations: ptBr.translations,
  }))

export interface AvaliacaoSenha {
  ok: boolean
  score: number
  dica: string | null
}

// zxcvbn dá score 3 a ~10^8 tentativas ("Senha123456!", "vinimon2026!!"): o piso de 10^9 fecha esse buraco (T08).
const MIN_TENTATIVAS = 1e9

const normalizar = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** S10: 12 a 128 caracteres, zxcvbn ≥ 3 com ≥ 10^9 tentativas, sem conter login, nome, e-mail, "vinimon" nem a organização. */
export async function avaliarSenha(senha: string, e: EntradasForca): Promise<AvaliacaoSenha> {
  const entradas = [e.login, e.nome, e.email, 'vinimon', e.organizacao].filter((x): x is string => Boolean(x))
  const r = await obter().checkAsync(senha.slice(0, 256), entradas)
  const tamanho = SenhaSchema.safeParse(senha)
  const senhaNorm = normalizar(senha)
  const contemDado = entradas
    .flatMap((x) => normalizar(x).split(/[\s@._-]+/))
    .some((p) => p.length >= 4 && senhaNorm.includes(p))
  const ok = tamanho.success && r.score >= 3 && r.guesses >= MIN_TENTATIVAS && !contemDado
  const dica = tamanho.success
    ? (r.feedback.warning ?? r.feedback.suggestions[0] ?? null)
    : (tamanho.error.issues[0]?.message ?? null)
  return { ok, score: r.score, dica: ok ? null : (dica ?? 'Escolha uma senha mais difícil de adivinhar.') }
}

/** Lança 400 VALIDACAO (campo novaSenha) se a senha é fraca ou igual à atual. */
export async function validarNovaSenha(senha: string, e: EntradasForca, hashAtual: string | null): Promise<void> {
  const av = await avaliarSenha(senha, e)
  if (!av.ok)
    throw new ErroApp(400, 'VALIDACAO', 'Senha fraca.', [{ campo: 'novaSenha', mensagem: av.dica ?? 'Senha fraca.' }])
  if (hashAtual && (await verificarSenha(senha, hashAtual)).ok) {
    throw new ErroApp(400, 'VALIDACAO', 'A nova senha deve ser diferente da atual.', [
      { campo: 'novaSenha', mensagem: 'A nova senha deve ser diferente da atual.' },
    ])
  }
}
