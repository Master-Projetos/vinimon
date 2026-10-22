import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { PAPEIS_STATUS } from '@vinimon/shared'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { type App, buildApp } from '../../src/app'
import { DiscoLocal } from '../../src/lib/armazenamento'
import { prisma } from '../../src/lib/prisma'
import { limparBanco, ORIGEM, SENHA_TESTE } from '../../test/ajudantes'
import { BYTES_ANEXO, criarFixture } from './fixture'
import { formatarRelatorio, importar, lerArgumentos } from './index'
import { uuidLegado } from './transformar'

const AGORA = new Date('2026-10-22T12:00:00Z')

/** Todos os arquivos regulares abaixo de `dir` (caminhos relativos). */
function arquivosEm(dir: string): string[] {
  if (!existsSync(dir)) return []
  const achados: string[] = []
  const visitar = (atual: string, prefixo: string) => {
    for (const nome of readdirSync(atual)) {
      const caminho = join(atual, nome)
      if (statSync(caminho).isDirectory()) visitar(caminho, `${prefixo}${nome}/`)
      else achados.push(`${prefixo}${nome}`)
    }
  }
  visitar(dir, '')
  return achados
}

describe('importador da v1: arquivos, gravação e CLI (T-11.3, S60, S72)', () => {
  const limpar: string[] = []
  let upload: string
  let disco: DiscoLocal

  beforeEach(async () => {
    await limparBanco()
    upload = mkdtempSync(join(tmpdir(), 'vinimon-upload-'))
    limpar.push(upload)
    disco = new DiscoLocal(upload)
  })
  afterEach(() => {
    for (const d of limpar.splice(0)) rmSync(d, { recursive: true, force: true })
  })

  const fixture = (opcoes: Parameters<typeof criarFixture>[0] = {}) => {
    const caminho = criarFixture(opcoes)
    limpar.push(dirname(caminho))
    return caminho
  }
  const rodar = (
    caminho: string,
    extra: { dryRun?: boolean; exigirTrocaTodos?: boolean; disco?: DiscoLocal | null } = {},
  ) =>
    importar(
      { sqlite: caminho, dryRun: extra.dryRun ?? false, exigirTrocaTodos: extra.exigirTrocaTodos ?? false },
      extra.disco === undefined ? disco : extra.disco,
      AGORA,
    )

  it('com a fixture: as contagens do banco são as da origem, tudo lido foi inserido e o relatório diz quanto', async () => {
    const r = await rodar(fixture())
    expect(r.relatorio.dryRun).toBe(false)
    for (const t of r.relatorio.tabelas) expect(t.inseridas, t.tabela).toBe(t.lidas)

    expect(await prisma.area.count()).toBe(2)
    expect(await prisma.departamento.count()).toBe(1)
    expect(await prisma.prioridade.count()).toBe(2)
    expect(await prisma.problema.count()).toBe(1)
    expect(await prisma.usuario.count()).toBe(3)
    expect(await prisma.tipoAtivo.count()).toBe(1)
    expect(await prisma.ativo.count()).toBe(1)
    expect(await prisma.artigo.count()).toBe(1)
    expect(await prisma.chamado.count()).toBe(2)
    expect(await prisma.assentamento.count()).toBe(3)
    expect(await prisma.anexo.count()).toBe(1)
    expect(await prisma.chamadoSeguidor.count()).toBeGreaterThanOrEqual(2)
    expect(r.relatorio.tabelas.find((t) => t.tabela === 'chamados')).toEqual({
      tabela: 'chamados',
      lidas: 2,
      inseridas: 2,
    })

    const texto = formatarRelatorio(r)
    expect(texto).toContain('Importação concluída.')
    expect(texto).toMatch(/chamados\s+2\s+2/)
    expect(texto).toContain('logins com senha padrão')
  })

  it('as sequences ficam em max(id) + 1 com `is_called = false`', async () => {
    await rodar(fixture())
    const [seq] = await prisma.$queryRaw<
      { last_value: bigint; is_called: boolean }[]
    >`SELECT last_value, is_called FROM chamados_id_seq`
    expect(Number(seq?.last_value)).toBe(3) // maior id importado = 2
    expect(seq?.is_called).toBe(false)
    const novo = await prisma.chamado.create({
      data: {
        assunto: 'Primeiro chamado depois da importação',
        descricao: 'x',
        solicitanteId: 3,
        abertoPorId: 3,
        areaId: 1,
        prioridadeId: (await prisma.prioridade.findFirstOrThrow({ where: { padrao: true } })).id,
        canalId: (await prisma.canal.findFirstOrThrow({ where: { nome: 'Sistema Web' } })).id,
        statusId: (await prisma.status.findFirstOrThrow({ where: { papel: 'INICIAL' } })).id,
        statusTipo: 'ABERTO',
        jornadaId: (await prisma.jornada.findFirstOrThrow({ where: { nome: '24x7' } })).id,
      },
    })
    expect(novo.id).toBe(3)
  })

  it('uma segunda execução insere 0 e não duplica anexo nem arquivo', async () => {
    const caminho = fixture()
    await rodar(caminho)
    const arquivosDepoisDaPrimeira = arquivosEm(upload)
    expect(arquivosDepoisDaPrimeira).toHaveLength(1)

    const segunda = await rodar(caminho)
    for (const t of segunda.relatorio.tabelas) expect(t.inseridas, t.tabela).toBe(0)
    expect(segunda.relatorio.statusDoSistemaCriados).toBe(0)
    expect(segunda.arquivosGravados).toBe(0)
    expect(segunda.anexosJaExistentes).toBe(1) // o BLOB nem foi lido de novo
    expect(await prisma.anexo.count()).toBe(1)
    expect(arquivosEm(upload)).toEqual(arquivosDepoisDaPrimeira) // `find $UPLOAD_DIR -type f | wc -l` igual à origem
    expect(await prisma.chamado.count()).toBe(2)
  })

  it('o anexo importado tem id determinístico, chave AAAA/MM/<uuidLegado>, tipo detectado, tamanho e sha256 reais (S72)', async () => {
    await rodar(fixture())
    const id = uuidLegado(1)
    const anexo = await prisma.anexo.findUniqueOrThrow({ where: { id } })
    expect(anexo).toMatchObject({
      chamadoId: 1,
      enviadoPorId: 3,
      nomeOriginal: 'foto.png',
      storageChave: `2025/02/${id}`,
      interno: false,
      tamanho: BYTES_ANEXO.length,
    })
    expect(anexo.sha256).toBe(createHash('sha256').update(BYTES_ANEXO).digest('hex'))
    // texto sem assinatura com extensão .png: fora da lista, vira octet-stream (sempre `attachment`)
    expect(anexo.mime).toBe('application/octet-stream')
    expect(readFileSync(join(upload, anexo.storageChave)).equals(BYTES_ANEXO)).toBe(true)
    expect(existsSync(join(upload, 'tmp')) ? readdirSync(join(upload, 'tmp')) : []).toEqual([]) // o temporário foi descartado
  })

  it('`--dry-run` executa tudo e deixa o banco e o disco como estavam', async () => {
    const r = await rodar(fixture(), { dryRun: true })
    expect(r.relatorio.dryRun).toBe(true)
    expect(r.relatorio.tabelas.find((t) => t.tabela === 'chamados')).toEqual({
      tabela: 'chamados',
      lidas: 2,
      inseridas: 2,
    }) // contou, mas desfez
    for (const contar of [
      prisma.usuario.count(),
      prisma.area.count(),
      prisma.chamado.count(),
      prisma.assentamento.count(),
      prisma.anexo.count(),
      prisma.canal.count(),
      prisma.jornada.count(),
      prisma.unidade.count(),
      prisma.config.count(),
      prisma.status.count(),
    ]) {
      expect(await contar).toBe(0)
    }
    expect(arquivosEm(upload)).toEqual([])
    expect(formatarRelatorio(r)).toContain('DRY-RUN')
    const comDisco = await rodar(fixture(), { dryRun: true, disco })
    expect(comDisco.arquivosGravados).toBe(0)
    expect(arquivosEm(upload)).toEqual([]) // nem com um disco injetado o dry-run grava arquivo
  })

  it('o arquivo original da v1 nunca é alterado', async () => {
    const caminho = fixture()
    const antes = createHash('sha256').update(readFileSync(caminho)).digest('hex')
    await rodar(caminho)
    await rodar(caminho, { dryRun: true })
    expect(createHash('sha256').update(readFileSync(caminho)).digest('hex')).toBe(antes)
  })

  it('invariantes: exatamente 1 prioridade padrão, 5 canais de sistema e todos os papéis de status', async () => {
    await rodar(fixture())
    expect(await prisma.prioridade.count({ where: { padrao: true } })).toBe(1)
    expect((await prisma.prioridade.findFirstOrThrow({ where: { padrao: true } })).nome).toBe('Alta') // a de menor `ordem` acima de 1
    expect(await prisma.canal.count({ where: { sistema: true } })).toBe(5)
    const papeis = (await prisma.status.findMany({ where: { papel: { not: null } }, select: { papel: true } }))
      .map((s) => s.papel)
      .sort()
    expect(papeis).toEqual([...PAPEIS_STATUS].sort())
  })

  it('papéis de status que faltavam entram como status de sistema; nome repetido ganha " (sistema)"', async () => {
    const r = await rodar(fixture())
    expect(r.relatorio.statusDoSistemaCriados).toBe(4) // ENCAMINHADO, AGENDADO, CONCLUIDO e CANCELADO
    const concluido = await prisma.status.findFirstOrThrow({ where: { papel: 'CONCLUIDO' } })
    expect(concluido).toMatchObject({ tipo: 'CONCLUIDO', pausaSla: true })
    // "Encerrado" da v1 já ocupa o nome; o papel ENCERRADO veio dele, então nenhum duplicado foi criado
    expect(await prisma.status.count({ where: { nome: { startsWith: 'Encerrado' } } })).toBe(1)
  })

  it('SLA: depois da importação não há aviso a disparar (`sla-alertas` geraria 0 eventos)', async () => {
    await rodar(fixture())
    const [pendentes] = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM chamados
      WHERE concluido_em IS NULL
        AND ((prazo_solucao_em < now() AND sla_aviso_estouro_em IS NULL)
          OR (alerta_solucao_em <= now() AND sla_aviso_risco_em IS NULL)
          OR (prazo_resposta_em < now() AND primeira_resposta_em IS NULL AND sla_aviso_resposta_em IS NULL))`
    expect(Number(pendentes?.n)).toBe(0)
    const aberto = await prisma.chamado.findUniqueOrThrow({ where: { id: 2 } }) // aberto em 2025, prazo de 24 h já vencido
    expect(aberto.slaAvisoEstouroEm).not.toBeNull()
    expect(aberto.slaAvisoRespostaEm).not.toBeNull()
  })

  it('campos desnormalizados: último assentamento (qualquer e público) e última interação pública', async () => {
    await rodar(fixture())
    const c1 = await prisma.chamado.findUniqueOrThrow({ where: { id: 1 } })
    expect(c1.ultimoAssentamentoId).toBe(3) // a nota interna é a última de todas
    expect(c1.ultimoAssentamentoPublicoId).toBe(2) // o último público é o comentário
    expect(c1.ultimaInteracaoEm).toEqual(new Date('2025-02-01T09:30:00Z'))
    expect(c1.ultimaInteracaoAutorId).toBe(2)
    expect(c1.ultimaAtividadeEm.getTime()).toBeGreaterThanOrEqual(c1.abertoEm.getTime())
    const c2 = await prisma.chamado.findUniqueOrThrow({ where: { id: 2 } })
    expect(c2).toMatchObject({ ultimoAssentamentoId: null, ultimoAssentamentoPublicoId: null, ultimaInteracaoEm: null })
    expect(await prisma.assentamento.findUniqueOrThrow({ where: { id: 3 } })).toMatchObject({
      tipo: 'COMENTARIO',
      interno: true,
    })
  })

  it('config do legado e marcador `legado.migracao`', async () => {
    await rodar(fixture())
    expect((await prisma.config.findUniqueOrThrow({ where: { chave: 'sistema.nome' } })).valor).toBe('Vinimon')
    expect((await prisma.config.findUniqueOrThrow({ where: { chave: 'sessao.horasAbsoluta' } })).valor).toBe(8)
    expect(await prisma.config.findUnique({ where: { chave: 'legado.migracao' } })).not.toBeNull()
  })

  describe('senhas (S10 e rehash)', () => {
    let app: App
    beforeAll(async () => {
      app = await buildApp({ logger: false })
      await app.ready()
    })
    afterAll(async () => {
      await app.close()
    })
    const entrar = (login: string, senha: string) =>
      app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: { origin: ORIGEM, 'content-type': 'application/json' },
        payload: { login, senha },
      })

    it('a senha da fixture (scrypt da v1) loga e o hash vira argon2id; senha padrão tem o hash anulado e não loga', async () => {
      const r = await rodar(fixture())
      expect(r.relatorio.loginsSenhaAnulada.sort()).toEqual(['admin', 'operador'])
      const hashDe = async (login: string) =>
        (await prisma.usuario.findUniqueOrThrow({ where: { login }, select: { senhaHash: true } })).senhaHash
      expect(await hashDe('maria')).toMatch(/^[0-9a-f]{32}:[0-9a-f]+$/) // ainda scrypt, como veio da v1
      const login = await entrar('maria', 'Segredo#2025')
      expect(login.statusCode).toBe(200)
      expect(await hashDe('maria')).toMatch(/^\$argon2id\$/)
      expect((await entrar('maria', 'senha-errada')).statusCode).toBe(401)

      for (const padrao of [
        ['admin', 'admin123'],
        ['operador', 'operador123'],
      ] as const) {
        expect(await hashDe(padrao[0])).toBeNull()
        expect((await entrar(padrao[0], padrao[1])).statusCode, padrao[0]).toBe(401)
      }
      expect((await entrar('maria', SENHA_TESTE)).statusCode).toBe(401)
    })

    it('`--exigir-troca-todos` marca todo mundo para trocar a senha', async () => {
      await rodar(fixture(), { exigirTrocaTodos: true })
      expect(await prisma.usuario.count({ where: { deveTrocarSenha: false } })).toBe(0)
    })
  })

  describe('recusas', () => {
    it('destino com usuários e sem marcador não é aceito, e nada é gravado', async () => {
      await prisma.usuario.create({
        data: { login: 'ja-existe', nome: 'Já existe', perfil: 'USUARIO', senhaHash: null },
      })
      const erro = await rodar(fixture()).catch((e: unknown) => e)
      expect(erro).toBeInstanceOf(Error)
      expect((erro as Error).message).toMatch(/banco de destino já tem usuários/)
      expect(await prisma.chamado.count()).toBe(0)
      expect(await prisma.area.count()).toBe(0)
    })

    it('qualquer erro de validação aborta antes de gravar banco ou arquivo', async () => {
      const erro = await rodar(fixture({ invalidos: true })).catch((e: unknown) => e)
      expect(erro).toBeInstanceOf(Error)
      expect((erro as Error).message).toMatch(/A validação encontrou \d+ erro/)
      expect(await prisma.usuario.count()).toBe(0)
      expect(await prisma.anexo.count()).toBe(0)
      expect(arquivosEm(upload)).toEqual([])
    })

    it('arquivo SQLite inexistente dá erro claro', async () => {
      await expect(rodar('/tmp/nao-existe-v1.db')).rejects.toThrow(/não encontrado/)
    })

    it('um erro no meio da transação desfaz tudo (nenhuma tabela fica pela metade)', async () => {
      await prisma.config.create({ data: { chave: 'legado.migracao', valor: { em: 'antes' } } })
      await prisma.area.create({ data: { id: 1, nome: 'Tecnologia da Informação' } }) // colide com a área 1 e com o nome da v1: skipDuplicates ignora
      const r = await rodar(fixture())
      expect(r.relatorio.tabelas.find((t) => t.tabela === 'areas')?.inseridas).toBe(1) // só a área 2 entrou
      expect(await prisma.chamado.count()).toBe(2)
    })
  })

  describe('linha de comando', () => {
    it('descarta o `--` que o pnpm repassa e lê as opções', () => {
      expect(lerArgumentos(['--', '--sqlite', 'x.db', '--dry-run', '--exigir-troca-todos'])).toMatchObject({
        dryRun: true,
        exigirTrocaTodos: true,
      })
      expect(lerArgumentos(['--sqlite', 'x.db'])).toMatchObject({ dryRun: false, exigirTrocaTodos: false })
      expect(lerArgumentos(['--sqlite', 'x.db']).sqlite).toMatch(/x\.db$/)
    })

    it('exige --sqlite e recusa opção desconhecida e argumento solto (strict)', () => {
      expect(() => lerArgumentos([])).toThrow(/--sqlite/)
      expect(() => lerArgumentos(['--dry-run'])).toThrow(/--sqlite/)
      expect(() => lerArgumentos(['--sqlite', 'x.db', '--forcar'])).toThrow()
      expect(() => lerArgumentos(['--sqlite', 'x.db', 'sobrando'])).toThrow()
    })
  })
})
