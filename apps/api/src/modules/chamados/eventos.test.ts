import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { criarArea, criarUsuario, limparBanco } from '../../../test/ajudantes'
import { criarChamado, semearBase } from '../../../test/fabricas'
import { prisma } from '../../lib/prisma'
import { definirTempoReal, type MotivoFila, type PublicadorTempoReal, tempoReal } from '../../lib/tempo-real'
import { aposCommitChamado, registrarEvento, registrarSistema } from './eventos'

const espiao = () => ({
  encerrarSessao: vi.fn(),
  encerrarSessoesDoUsuario: vi.fn(),
  revalidarUsuario: vi.fn(),
  revalidarChamado: vi.fn(),
  emitirAssentamentos: vi.fn(),
  emitirChamadoAtualizado: vi.fn(),
  emitirFila: vi.fn(),
  emitirLeitura: vi.fn(),
  emitirNotificacoes: vi.fn(),
  emitirContagem: vi.fn(),
})

describe('eventos de chamado e efeitos pós-commit (C22, §3.8)', () => {
  const original: PublicadorTempoReal = tempoReal
  let publicador: ReturnType<typeof espiao>
  let solicitanteId: number
  let chamadoId: number

  beforeEach(async () => {
    await limparBanco()
    await semearBase()
    publicador = espiao()
    definirTempoReal(publicador)
    const solicitante = await criarUsuario({ perfil: 'USUARIO' })
    const area = await criarArea()
    solicitanteId = solicitante.id
    chamadoId = (await criarChamado({ solicitanteId, areaId: area.id })).id
  })
  afterEach(() => {
    definirTempoReal(original)
  })

  const evento = (interno: boolean, tipo: 'STATUS_ALTERADO' | 'TAGS_ALTERADAS' = 'STATUS_ALTERADO') =>
    prisma.$transaction((tx) => registrarEvento(tx, { chamadoId, tipo, atorId: solicitanteId, interno }))

  describe('registrarEvento e registrarSistema', () => {
    it('registrarEvento grava o evento pendente (outbox) e devolve o id', async () => {
      const id = await prisma.$transaction((tx) =>
        registrarEvento(tx, { chamadoId, tipo: 'ASSUMIDO', atorId: solicitanteId, dados: { de: null, para: 7 } }),
      )
      const e = await prisma.chamadoEvento.findUniqueOrThrow({ where: { id } })
      expect(e).toMatchObject({
        chamadoId,
        tipo: 'ASSUMIDO',
        atorId: solicitanteId,
        interno: false,
        assentamentoId: null,
        dados: { de: null, para: 7 },
      })
      expect(e.processadoEm).toBeNull()
    })

    it('registrarEvento aceita ator nulo (sistema), `interno` e assentamento', async () => {
      const assentamentoId = await prisma.$transaction((tx) =>
        registrarSistema(tx, chamadoId, 'CRIADO', 'Chamado aberto'),
      )
      const id = await prisma.$transaction((tx) =>
        registrarEvento(tx, { chamadoId, tipo: 'TAGS_ALTERADAS', atorId: null, assentamentoId, interno: true }),
      )
      const e = await prisma.chamadoEvento.findUniqueOrThrow({ where: { id } })
      expect(e).toMatchObject({ atorId: null, interno: true, assentamentoId, dados: {} })
    })

    it('registrarSistema cria o assentamento SISTEMA público, sem autor, com o evento e os dados', async () => {
      const id = await prisma.$transaction((tx) =>
        registrarSistema(tx, chamadoId, 'STATUS_ALTERADO', 'Status alterado de Aberto para Pendente', {
          de: 'Aberto',
          para: 'Pendente',
        }),
      )
      const a = await prisma.assentamento.findUniqueOrThrow({ where: { id } })
      expect(a).toMatchObject({
        chamadoId,
        tipo: 'SISTEMA',
        interno: false,
        autorId: null,
        evento: 'STATUS_ALTERADO',
        texto: 'Status alterado de Aberto para Pendente',
        dados: { de: 'Aberto', para: 'Pendente' },
      })
      const semDados = await prisma.$transaction((tx) => registrarSistema(tx, chamadoId, 'CRIADO', 'Chamado aberto'))
      expect((await prisma.assentamento.findUniqueOrThrow({ where: { id: semDados } })).dados).toBeNull()
    })

    it('o evento e o comentário saem da mesma transação: se ela falha, nenhum dos dois fica', async () => {
      await expect(
        prisma.$transaction(async (tx) => {
          await registrarSistema(tx, chamadoId, 'CRIADO', 'Chamado aberto')
          await registrarEvento(tx, { chamadoId, tipo: 'CRIADO', atorId: solicitanteId })
          throw new Error('falha depois dos registros')
        }),
      ).rejects.toThrow('falha depois dos registros')
      expect(await prisma.chamadoEvento.count({ where: { chamadoId } })).toBe(0)
      expect(await prisma.assentamento.count({ where: { chamadoId } })).toBe(0)
    })
  })

  describe('aposCommitChamado', () => {
    it('evento público: emite assentamentos, chamado:atualizado e fila, e revalida só se o acesso mudou', async () => {
      const eventoId = await evento(false)
      await aposCommitChamado({
        chamadoId,
        eventoIds: [eventoId],
        assentamentoIds: [11, 12],
        campos: ['status', 'operador'],
        acessoMudou: false,
        fila: 'status',
      })
      expect(publicador.emitirAssentamentos).toHaveBeenCalledExactlyOnceWith(chamadoId, [11, 12])
      expect(publicador.emitirChamadoAtualizado).toHaveBeenCalledExactlyOnceWith(
        chamadoId,
        ['status', 'operador'],
        false,
      )
      expect(publicador.emitirFila).toHaveBeenCalledExactlyOnceWith(chamadoId, 'status')
      expect(publicador.revalidarChamado).not.toHaveBeenCalled()

      await aposCommitChamado({
        chamadoId,
        eventoIds: [eventoId],
        assentamentoIds: [],
        campos: ['area'],
        acessoMudou: true,
        fila: 'encaminhado',
      })
      expect(publicador.revalidarChamado).toHaveBeenCalledExactlyOnceWith(chamadoId)
      expect(publicador.emitirAssentamentos).toHaveBeenCalledTimes(1) // sem ids, não emite
    })

    it('evento interno: chamado:atualizado só para a sala interna e nunca emite fila (S49, S93)', async () => {
      const eventoId = await evento(true, 'TAGS_ALTERADAS')
      await aposCommitChamado({
        chamadoId,
        eventoIds: [eventoId],
        assentamentoIds: [],
        campos: ['tags'],
        acessoMudou: false,
        fila: 'status',
      })
      expect(publicador.emitirChamadoAtualizado).toHaveBeenCalledExactlyOnceWith(chamadoId, ['tags'], true)
      expect(publicador.emitirFila).not.toHaveBeenCalled()
    })

    it('público e interno na mesma ação: atualização vai a todos, mas a fila não sai', async () => {
      const publico = await evento(false)
      const interno = await evento(true, 'TAGS_ALTERADAS')
      await aposCommitChamado({
        chamadoId,
        eventoIds: [publico, interno],
        assentamentoIds: [],
        campos: ['status'],
        acessoMudou: false,
        fila: 'status',
      })
      expect(publicador.emitirChamadoAtualizado).toHaveBeenCalledExactlyOnceWith(chamadoId, ['status'], false)
      expect(publicador.emitirFila).not.toHaveBeenCalled()
    })

    it('comentário (campos vazios) não emite chamado:atualizado', async () => {
      await aposCommitChamado({
        chamadoId,
        eventoIds: [],
        assentamentoIds: [5],
        campos: [],
        acessoMudou: false,
        fila: null,
      })
      expect(publicador.emitirAssentamentos).toHaveBeenCalledExactlyOnceWith(chamadoId, [5])
      expect(publicador.emitirChamadoAtualizado).not.toHaveBeenCalled()
      expect(publicador.emitirFila).not.toHaveBeenCalled()
    })

    it('fila só com os motivos permitidos', async () => {
      for (const motivo of ['criado', 'atribuido', 'status', 'encaminhado', 'prioridade'] as const) {
        publicador.emitirFila.mockClear()
        await aposCommitChamado({
          chamadoId,
          eventoIds: [],
          assentamentoIds: [],
          campos: [],
          acessoMudou: false,
          fila: motivo,
        })
        expect(publicador.emitirFila, motivo).toHaveBeenCalledExactlyOnceWith(chamadoId, motivo)
      }
      publicador.emitirFila.mockClear()
      const invalido = 'comentario' as MotivoFila // motivo fora da lista (§3.7)
      await aposCommitChamado({
        chamadoId,
        eventoIds: [],
        assentamentoIds: [],
        campos: [],
        acessoMudou: false,
        fila: invalido,
      })
      expect(publicador.emitirFila).not.toHaveBeenCalled()
    })

    it('erro do publicador não propaga, vai para o log e não derruba os passos seguintes', async () => {
      const eventoId = await evento(false)
      for (const metodo of [
        'emitirAssentamentos',
        'emitirChamadoAtualizado',
        'emitirFila',
        'revalidarChamado',
      ] as const) {
        publicador[metodo].mockImplementation(() => {
          throw new Error(`falha em ${metodo}`)
        })
      }
      const log = { error: vi.fn() }
      await expect(
        aposCommitChamado({
          chamadoId,
          eventoIds: [eventoId],
          assentamentoIds: [1],
          campos: ['status'],
          acessoMudou: true,
          fila: 'status',
          log,
        }),
      ).resolves.toBeUndefined()
      for (const metodo of [
        'emitirAssentamentos',
        'emitirChamadoAtualizado',
        'emitirFila',
        'revalidarChamado',
      ] as const) {
        expect(publicador[metodo], metodo).toHaveBeenCalledTimes(1) // todos foram tentados
      }
      expect(log.error).toHaveBeenCalledTimes(4)
      expect(log.error.mock.calls.map(([obj]) => (obj as { etapa: string }).etapa)).toEqual([
        'assentamentos',
        'chamado-atualizado',
        'fila',
        'revalidar',
      ])
      expect(log.error.mock.calls[0]?.[0]).toMatchObject({ chamadoId })
    })

    it('erro ao ler os eventos (banco) também não propaga; o resto segue como evento público', async () => {
      const log = { error: vi.fn() }
      const quebrado = vi.spyOn(prisma.chamadoEvento, 'findMany').mockRejectedValueOnce(new Error('banco fora'))
      await expect(
        aposCommitChamado({
          chamadoId,
          eventoIds: [1],
          assentamentoIds: [],
          campos: ['prioridade'],
          acessoMudou: false,
          fila: 'prioridade',
          log,
        }),
      ).resolves.toBeUndefined()
      quebrado.mockRestore()
      expect(log.error).toHaveBeenCalledTimes(1)
      expect(log.error.mock.calls[0]?.[0]).toMatchObject({ etapa: 'eventos' })
      expect(publicador.emitirChamadoAtualizado).toHaveBeenCalledWith(chamadoId, ['prioridade'], false)
    })
  })
})
