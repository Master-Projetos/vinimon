import { NIVEIS_PROJETO, type NoArvore, type Projeto } from '@vinimon/shared'
import { escopoChamados } from '../../autorizacao/chamados'
import { naoEncontrado } from '../../lib/erros'
import { prisma } from '../../lib/prisma'
import type { UsuarioSessao } from '../../lib/sessao'
import { selectNoChamado, selectProjeto } from './schemas'

type NoBase = { id: number; assunto: string; statusTipo: NoArvore['statusTipo'] }

/**
 * Árvore de subchamados visível para `u`, uma consulta por nível (sem recursão no banco).
 * Só entram os chamados que `escopoChamados(u)` aceita; um nó oculto corta a sua subárvore, então
 * ninguém vê um subchamado sem ver o pai. Profundidade máxima: `NIVEIS_PROJETO`, raiz no nível 1.
 */
async function montarArvore(u: UsuarioSessao, raiz: NoBase): Promise<NoArvore> {
  const raizNo: NoArvore = { id: raiz.id, assunto: raiz.assunto, statusTipo: raiz.statusTipo, filhos: [] }
  let nivelAtual = new Map<number, NoArvore>([[raizNo.id, raizNo]])

  for (let nivel = 1; nivel < NIVEIS_PROJETO && nivelAtual.size > 0; nivel++) {
    const filhos = await prisma.chamado.findMany({
      where: { AND: [escopoChamados(u), { chamadoPaiId: { in: [...nivelAtual.keys()] } }] },
      select: selectNoChamado,
      orderBy: { id: 'asc' },
    })
    const proximoNivel = new Map<number, NoArvore>()
    for (const f of filhos) {
      const pai = f.chamadoPaiId === null ? undefined : nivelAtual.get(f.chamadoPaiId)
      if (!pai) continue
      const no: NoArvore = { id: f.id, assunto: f.assunto, statusTipo: f.statusTipo, filhos: [] }
      pai.filhos.push(no)
      proximoNivel.set(no.id, no)
    }
    nivelAtual = proximoNivel
  }
  return raizNo
}

/** Fora do escopo ou inexistente: 404 igual, sem revelar que o projeto existe (S44). */
export async function obterProjeto(u: UsuarioSessao, id: number): Promise<Projeto> {
  const projeto = await prisma.projeto.findUnique({ where: { id }, select: selectProjeto })
  if (!projeto) throw naoEncontrado('Projeto não encontrado.')
  const raiz = await prisma.chamado.findFirst({
    where: { AND: [escopoChamados(u), { id: projeto.chamadoRaizId }] },
    select: selectNoChamado,
  })
  if (!raiz) throw naoEncontrado('Projeto não encontrado.')
  return { ...projeto, arvore: await montarArvore(u, raiz) }
}
