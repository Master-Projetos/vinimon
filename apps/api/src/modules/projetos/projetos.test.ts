import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { criarArea, criarUsuario, headersDe, limparBanco } from '../../../test/ajudantes'
import { criarChamado, semearBase } from '../../../test/fabricas'
import { type App, buildApp } from '../../app'
import { prisma } from '../../lib/prisma'

type No = { id: number; assunto: string; statusTipo: string; filhos: No[] }

/** Profundidade do maior ramo, contando o nó dado como 1. */
const profundidade = (no: No): number => 1 + Math.max(0, ...no.filhos.map(profundidade))

describe('módulo projetos', () => {
  let app: App

  beforeAll(async () => {
    app = await buildApp({ logger: false })
    await app.ready()
  })
  afterAll(async () => {
    await app.close()
  })
  beforeEach(async () => {
    await limparBanco()
    await semearBase()
  })

  /** Chamado com assunto fixo, para localizar nós pelo nome na árvore. */
  async function chamado(assunto: string, solicitanteId: number, areaId: number, paiId: number | null = null) {
    const c = await criarChamado({ solicitanteId, areaId })
    return prisma.chamado.update({ where: { id: c.id }, data: { assunto, chamadoPaiId: paiId } })
  }

  async function criarProjeto(chamadoRaizId: number, criadoPorId: number, nome = 'Migração do datacenter') {
    return prisma.projeto.create({ data: { nome, descricao: 'Projeto de teste.', chamadoRaizId, criadoPorId } })
  }

  /**
   * Cenário: R (raiz, U1, área A) → F1 (U1, área A) → N1 (U1, área A);
   * R → F2 (U2, área B) → N2 (U1, área A). O operador é da área A.
   */
  async function cenario() {
    const areaA = await criarArea({ nome: 'Infraestrutura' })
    const areaB = await criarArea({ nome: 'Redes' })
    const u1 = await criarUsuario({ perfil: 'USUARIO', areaId: areaA.id })
    const u2 = await criarUsuario({ perfil: 'USUARIO', areaId: areaA.id })
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const operador = await criarUsuario({ perfil: 'OPERADOR', areaId: areaA.id })
    const r = await chamado('Raiz', u1.id, areaA.id)
    const f1 = await chamado('Filho 1', u1.id, areaA.id, r.id)
    const f2 = await chamado('Filho 2', u2.id, areaB.id, r.id)
    const n1 = await chamado('Neto 1', u1.id, areaA.id, f1.id)
    const n2 = await chamado('Neto 2', u1.id, areaA.id, f2.id)
    const projeto = await criarProjeto(r.id, admin.id)
    return { u1, u2, admin, operador, r, f1, f2, n1, n2, projeto }
  }

  const obter = (id: number, headers: Record<string, string>) =>
    app.inject({ method: 'GET', url: `/api/v1/projetos/${id}`, headers })

  it('401 sem sessão', async () => {
    const x = await cenario()
    const res = await app.inject({ method: 'GET', url: `/api/v1/projetos/${x.projeto.id}` })
    expect(res.statusCode).toBe(401)
    expect(res.json().erro.codigo).toBe('NAO_AUTENTICADO')
  })

  it('403 com sessão incompleta (2FA ou troca de senha pendentes)', async () => {
    const x = await cenario()
    const mfa = await obter(x.projeto.id, await headersDe(x.admin.id, 'PENDENTE_MFA'))
    expect(mfa.statusCode).toBe(403)
    expect(mfa.json().erro.codigo).toBe('MFA_PENDENTE')
    const troca = await obter(x.projeto.id, await headersDe(x.admin.id, 'TROCA_SENHA'))
    expect(troca.statusCode).toBe(403)
    expect(troca.json().erro.codigo).toBe('TROCA_SENHA_OBRIGATORIA')
  })

  it('400 com detalhes para id que não é número', async () => {
    const x = await cenario()
    const res = await obter(0, await headersDe(x.admin.id)) // id fora do intervalo positivo
    expect(res.statusCode).toBe(400)
    expect(res.json().erro.codigo).toBe('VALIDACAO')
    expect(res.json().erro.detalhes).toEqual(expect.arrayContaining([expect.objectContaining({ campo: 'id' })]))
    const texto = await obter(Number.NaN, await headersDe(x.admin.id))
    expect(texto.statusCode).toBe(400)
  })

  it('ADMIN vê a árvore inteira; o projeto traz os campos do contrato', async () => {
    const x = await cenario()
    const res = await obter(x.projeto.id, await headersDe(x.admin.id))
    expect(res.statusCode).toBe(200)
    const corpo = res.json()
    expect(corpo).toMatchObject({
      id: x.projeto.id,
      nome: 'Migração do datacenter',
      descricao: 'Projeto de teste.',
      chamadoRaizId: x.r.id,
    })
    expect(corpo.criadoEm).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(corpo).not.toHaveProperty('criadoPorId')
    expect(corpo.arvore).toMatchObject({
      id: x.r.id,
      assunto: 'Raiz',
      statusTipo: 'ABERTO',
      filhos: [
        { id: x.f1.id, assunto: 'Filho 1', filhos: [{ id: x.n1.id, assunto: 'Neto 1', filhos: [] }] },
        { id: x.f2.id, assunto: 'Filho 2', filhos: [{ id: x.n2.id, assunto: 'Neto 2', filhos: [] }] },
      ],
    })
  })

  it('OPERADOR da área vê os mesmos nós; USUARIO só vê os seus, e um nó oculto corta a subárvore', async () => {
    const x = await cenario()
    // F2 é da área B: fora da área A do operador, e N2 (área A) some junto por estar sob F2
    const doOperador = await obter(x.projeto.id, await headersDe(x.operador.id))
    expect(doOperador.statusCode).toBe(200)
    expect(doOperador.json().arvore.filhos.map((f: No) => f.assunto)).toEqual(['Filho 1'])

    const doU1 = await obter(x.projeto.id, await headersDe(x.u1.id))
    expect(doU1.statusCode).toBe(200)
    const arvore = doU1.json().arvore as No
    // F2 é de U2 (não é de U1): some, e N2 (de U1) some junto por estar sob F2
    expect(arvore.filhos.map((f) => f.assunto)).toEqual(['Filho 1'])
    expect(arvore.filhos[0]?.filhos.map((n) => n.assunto)).toEqual(['Neto 1'])
  })

  it('404 para projeto inexistente e para projeto cuja raiz está fora do escopo (mesma resposta)', async () => {
    const x = await cenario()
    const inexistente = await obter(999_999, await headersDe(x.admin.id))
    expect(inexistente.statusCode).toBe(404)
    expect(inexistente.json().erro.codigo).toBe('NAO_ENCONTRADO')

    const outro = await criarUsuario({ perfil: 'USUARIO' })
    const fora = await obter(x.projeto.id, await headersDe(outro.id))
    expect(fora.statusCode).toBe(404)
    expect(fora.json().erro.codigo).toBe('NAO_ENCONTRADO')
  })

  it('a árvore para em 5 níveis (raiz = nível 1), mesmo com mais subchamados abaixo', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const area = await criarArea()
    let paiId: number | null = null
    const ids: number[] = []
    for (let n = 1; n <= 7; n++) {
      const c = await chamado(`Nível ${n}`, admin.id, area.id, paiId)
      ids.push(c.id)
      paiId = c.id
    }
    const projeto = await criarProjeto(ids[0] ?? 0, admin.id, 'Cadeia longa')
    const res = await obter(projeto.id, await headersDe(admin.id))
    expect(res.statusCode).toBe(200)
    const arvore = res.json().arvore as No
    expect(profundidade(arvore)).toBe(5)
    expect(arvore.filhos[0]?.assunto).toBe('Nível 2')
    expect(JSON.stringify(arvore)).not.toContain('Nível 6')
  })

  it('409 do banco: um chamado raiz só pode ter um projeto', async () => {
    const x = await cenario()
    await expect(criarProjeto(x.r.id, x.admin.id, 'Outro')).rejects.toMatchObject({ code: 'P2002' })
  })
})
