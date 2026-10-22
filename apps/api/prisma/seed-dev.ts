// Dados de DEMONSTRAÇÃO. Recusa rodar em produção (T09). Rode antes: pnpm db:seed
if (process.env.NODE_ENV === 'production') {
  console.error('seed-dev recusado: NODE_ENV=production.')
  process.exit(1)
}

const { generate } = await import('otplib')
const { cifrar } = await import('../src/lib/cripto')
const { prisma } = await import('../src/lib/prisma')
const { hashSenha, senhaAleatoria } = await import('../src/lib/senha')
const { gerarSegredo, gerarCodigosRecuperacao, hashCodigo, uriOtpauth } = await import('../src/lib/totp')

const PROBLEMAS: [string, string, number, number][] = [
  ['TI', 'Computador não liga', 120, 480],
  ['TI', 'Rede / Internet', 60, 360],
  ['TI', 'Impressora', 240, 1440],
  ['TI', 'Instalação de software', 480, 2880],
  ['TI', 'Acesso / Senha', 60, 240],
  ['Manutenção Predial', 'Ar-condicionado', 240, 2880],
  ['Manutenção Predial', 'Elétrica', 120, 1440],
  ['Manutenção Predial', 'Hidráulica', 240, 1440],
]

async function main(): Promise<void> {
  const ti = await prisma.area.findUnique({ where: { nome: 'TI' }, select: { id: true } })
  const principal = await prisma.unidade.findUnique({ where: { nome: 'Principal' }, select: { id: true } })
  if (!ti || !principal) throw new Error('Rode "pnpm db:seed" antes do seed-dev.')

  const area = async (nome: string, atende: boolean) =>
    prisma.area.upsert({ where: { nome }, update: {}, create: { nome, atende }, select: { id: true } })
  const manutencao = await area('Manutenção Predial', true)
  await area('RH', false)
  const financeiro = await area('Financeiro', false)
  const areas: Record<string, number> = { TI: ti.id, 'Manutenção Predial': manutencao.id }

  const deptos: Record<string, number> = {}
  for (const nome of ['Matriz – 1º andar', 'Matriz – 2º andar', 'Financeiro', 'Almoxarifado']) {
    const d = await prisma.departamento.upsert({
      where: { unidadeId_nome: { unidadeId: principal.id, nome } },
      update: {},
      create: { unidadeId: principal.id, nome },
      select: { id: true },
    })
    deptos[nome] = d.id
  }

  for (const [nomeArea, nome, resp, sol] of PROBLEMAS) {
    const areaId = areas[nomeArea]
    const p = await prisma.problema.upsert({
      where: { nome },
      update: {},
      create: { nome, areaPadraoId: areaId ?? null, slaRespostaMin: resp, slaSolucaoMin: sol },
      select: { id: true },
    })
    if (areaId) await prisma.problemaArea.createMany({ data: [{ problemaId: p.id, areaId }], skipDuplicates: true })
  }

  const tipos: Record<string, number> = {}
  for (const nome of ['Desktop', 'Notebook', 'Impressora', 'Monitor', 'Outros']) {
    tipos[nome] = (
      await prisma.tipoAtivo.upsert({ where: { nome }, update: {}, create: { nome }, select: { id: true } })
    ).id
  }
  const ativos: [string, string, string, string, string][] = [
    ['PAT-0001', 'Desktop', 'Dell OptiPlex 3080', 'SN123456', 'Matriz – 1º andar'],
    ['PAT-0002', 'Notebook', 'Lenovo ThinkPad E14', 'SN654321', 'Matriz – 2º andar'],
    ['PAT-0003', 'Impressora', 'HP LaserJet M404', 'SN777888', 'Matriz – 1º andar'],
  ]
  for (const [etiqueta, tipo, modelo, serie, depto] of ativos) {
    await prisma.ativo.upsert({
      where: { etiqueta },
      update: {},
      create: { etiqueta, tipoId: tipos[tipo] ?? 0, modelo, serie, departamentoId: deptos[depto] ?? null },
    })
  }

  const categoria = await prisma.categoriaArtigo.upsert({
    where: { nome: 'Geral' },
    update: {},
    create: { nome: 'Geral' },
    select: { id: true },
  })
  const artigos = [
    [
      'Como redefinir minha senha de rede?',
      'Abra um chamado em "Acesso / Senha" informando seu login. O atendimento redefine a senha em até 4 horas.',
      'Acesso / Senha',
    ],
    [
      'Impressora não imprime',
      'Verifique papel e toner, reinicie a impressora e confirme se ela está como padrão. Se continuar, abra um chamado.',
      'Impressora',
    ],
  ] as const
  for (const [titulo, conteudo, problema] of artigos) {
    if (await prisma.artigo.count({ where: { titulo } })) continue
    const p = await prisma.problema.findUnique({ where: { nome: problema }, select: { id: true } })
    await prisma.artigo.create({
      data: {
        titulo,
        conteudo,
        categoriaId: categoria.id,
        situacao: 'PUBLICADO',
        visibilidade: 'PUBLICO',
        publicadoEm: new Date(),
        ...(p ? { problemas: { create: [{ problemaId: p.id }] } } : {}),
      },
    })
  }

  // Usuários de demonstração: só são criados (e a senha só é mostrada) na primeira execução.
  const saida: string[] = []
  if (!(await prisma.usuario.findUnique({ where: { login: 'operador' }, select: { id: true } }))) {
    const senha = senhaAleatoria(16)
    const segredo = gerarSegredo()
    const codigos = gerarCodigosRecuperacao()
    const u = await prisma.usuario.create({
      data: {
        login: 'operador',
        nome: 'Operador de TI',
        perfil: 'OPERADOR',
        areaId: ti.id,
        senhaHash: await hashSenha(senha),
        totpSecretEnc: cifrar(segredo),
        mfaAtivadoEm: new Date(),
      },
      select: { id: true },
    })
    await prisma.codigoRecuperacao.createMany({
      data: codigos.map((c) => ({ usuarioId: u.id, codigoHash: hashCodigo(c) })),
    })
    saida.push(
      `operador  senha: ${senha}`,
      `          segredo TOTP: ${segredo}`,
      `          ${uriOtpauth({ issuer: 'Vinimon', label: 'operador', secret: segredo })}`,
      `          código agora: ${await generate({ secret: segredo })}  (pnpm -F @vinimon/api cli totp:codigo operador)`,
      `          recuperação: ${codigos.slice(0, 2).join('  ')}  …`,
    )
  }
  if (!(await prisma.usuario.findUnique({ where: { login: 'usuario' }, select: { id: true } }))) {
    const senha = senhaAleatoria(16)
    await prisma.usuario.create({
      data: {
        login: 'usuario',
        nome: 'Usuário Demonstração',
        perfil: 'USUARIO',
        areaId: financeiro.id,
        departamentoId: deptos.Financeiro ?? null,
        senhaHash: await hashSenha(senha),
      },
    })
    saida.push(`usuario   senha: ${senha}`)
  }
  process.stdout.write(
    saida.length
      ? `\nUsuários de demonstração (anote agora; não aparecem de novo):\n${saida.join('\n')}\n`
      : '\nDados de demonstração já existiam.\n',
  )
}

await main().finally(() => prisma.$disconnect())
