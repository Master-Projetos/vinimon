// apps/api/test/fabricas.test.ts
import { PAPEIS_STATUS } from '@vinimon/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import { criarArea, limparBanco } from './ajudantes'
import { criarAtivo, criarDepartamento, criarProblema, criarTipoAtivo, semearBase } from './fabricas'

describe('fábricas de teste', () => {
  beforeEach(async () => {
    await limparBanco()
  })

  it('semearBase devolve os ids do seed base e é repetível', async () => {
    const primeira = await semearBase()
    const segunda = await semearBase()

    expect(Object.keys(primeira.statusPorPapel).sort()).toEqual([...PAPEIS_STATUS].sort())
    expect(new Set(Object.values(primeira.statusPorPapel)).size).toBe(PAPEIS_STATUS.length)
    expect(segunda).toEqual(primeira)
    expect(primeira.prioridadePadraoId).toBeGreaterThan(0)
    expect(primeira.canalWebId).not.toBe(primeira.canalTelefoneId)
    expect(primeira.jornada24x7Id).not.toBe(primeira.jornadaComercialId)
  })

  it('criarDepartamento chamado duas vezes gera nomes e ids distintos', async () => {
    const a = await criarDepartamento()
    const b = await criarDepartamento()

    expect(a.id).not.toBe(b.id)
    expect(a.nome).not.toBe(b.nome)
  })

  it('criarProblema chamado duas vezes gera nomes e ids distintos', async () => {
    const area = await criarArea()
    const a = await criarProblema({ areaIds: [area.id], areaPadraoId: area.id, slaRespostaMin: 30, slaSolucaoMin: 480 })
    const b = await criarProblema({ areaIds: [area.id] })

    expect(a.id).not.toBe(b.id)
    expect(a.nome).not.toBe(b.nome)
  })

  it('criarTipoAtivo chamado duas vezes gera nomes e ids distintos', async () => {
    const a = await criarTipoAtivo()
    const b = await criarTipoAtivo()

    expect(a.id).not.toBe(b.id)
    expect(a.nome).not.toBe(b.nome)
  })

  it('criarAtivo chamado duas vezes gera etiquetas e ids distintos', async () => {
    const a = await criarAtivo()
    const b = await criarAtivo()

    expect(a.id).not.toBe(b.id)
    expect(a.etiqueta).not.toBe(b.etiqueta)
  })
})
