> Relatório do especialista, copiado literalmente (referência). Em conflito vale a Parte A (`docs/plano/fundamentos/`), depois a Parte B (`docs/plano/tarefas/`), depois este relatório.

# Modelo de dados Prisma, migração do SQLite e SLA com jornada — Vinimon v2

## 0. Versões, decisões que valem para tudo e o que foi verificado

**Versões (consultadas com `npm view` em 21/10/2026):**
- prisma, @prisma/client e @prisma/adapter-pg: **7.10.1**. Fixe a versão exata. Hoje o dist-tag `latest` do CLI `prisma` aponta para `8.0.0-rc.24`, então `pnpm add prisma` sem versão instala uma RC.
- Demais pacotes: pg 8.23.1, pg-boss 12.38.0, @node-rs/argon2 2.2.2, otplib 13.5.0, luxon 3.7.2 (+ @types/luxon 3.7.6), fast-check 4.10.2, vitest 5.0.5, tsx 4.23.15, zod 4.6.7.

**O que foi verificado no pacote prisma 7.10.1 (lendo o wasm de validação):**
- O preview `partialIndexes` existe, com `where: raw("...")`.
- `ops: raw("...")` existe para classes de operador.
- Tipos de índice disponíveis: `Gin` e `Brin`.
- O preview `postgresqlExtensions` existe. Não vamos usá-lo; as extensões entram por SQL.

**Mudanças do Prisma 7 que afetam este plano:**
- A URL do banco não fica mais no `datasource`; vai em `prisma.config.ts`.
- O generator passa a ser `prisma-client`, com `output` obrigatório.
- O client exige driver adapter (`PrismaPg`).
- O seed é configurado em `migrations.seed` do config e roda com `prisma db seed`.

A busca web confirmou esses pontos: [changelog Prisma 2026-02-11](https://www.prisma.io/changelog/2026-02-11), [Prisma 7.4: partial indexes](https://www.prisma.io/blog/prisma-orm-v7-4-query-caching-partial-indexes-and-major-performance-improvements), [upgrade para v7](https://www.prisma.io/docs/v6/orm/more/upgrades/to-v7). O WebFetch para prisma.io foi bloqueado pela rede (ENOTFOUND).

**Decisões que valem para todo o modelo:**
- **Postgres 17** no docker (`postgres:17-alpine`, que já traz `pg_trgm` e `unaccent`). O mínimo é 14, por causa do `BEGIN ATOMIC`.
- **IDs `Int` autoincrement em todas as tabelas.** Isso preserva os IDs do legado e evita `BigInt`, que o JSON não serializa. O teto de 2,1 bilhões é suficiente.
- **Colunas de busca mantidas por trigger, e não por coluna gerada.**
  - Ficam declaradas no Prisma como `busca Unsupported("tsvector")?` e `buscaNorm String?`, e os índices GIN também são declarados no Prisma. Assim o Prisma não detecta drift nem gera `DROP`.
  - Motivo da escolha: o Prisma introspecta a expressão de coluna gerada como `@default(dbgenerated(...))` e tende a gerar `ALTER ... SET DEFAULT`, que falha. Isso **não foi verificado**, então ficamos com a opção conservadora. Triggers e funções o Prisma ignora.
- **CHECK, trigger, função e extensão vão em SQL manual dentro da migração.** O Prisma não gerencia nem remove esses objetos.
- **Predicados de índice parcial usam só `IS NULL` / `IS NOT NULL`.**
  - O Prisma envia enums como `CAST($1::text AS "tipo_status")`, e `enum_in` é STABLE. Com isso o planner não consegue provar que a consulta implica um predicado do tipo `status_tipo = 'x'`, e o índice parcial nunca seria usado.
  - Por isso "chamado em aberto" passa a ser definido como `resolvido_em IS NULL`. CHECKs garantem a coerência com `status_tipo`.
- **`chamados.status_tipo` fica preso a `status.tipo` por uma FK composta `(status_id, status_tipo)` com `ON UPDATE CASCADE`.**
  - Se um admin mudar o tipo de um status em uso de forma incompatível, os CHECKs do chamado rejeitam a mudança.
- **Regra para os agentes Haiku:** no Prisma, sempre gravar FKs como campos escalares (`statusId`, `statusTipo`…), nunca usar `connect`.
- **Soft-delete existe em um único lugar:** `assentamentos.excluido_em`. Justificativa: uma mensagem de chat apagada precisa virar "mensagem excluída" na timeline e manter íntegros as confirmações de leitura, as menções, as notificações que a referenciam e a auditoria.
- **Fora isso, não há soft-delete:**
  - Cadastros usam `ativo`.
  - Artigos usam `situacao = arquivado`.
  - Usuários nunca são excluídos: usa-se `ativo = false`, ou `anonimizado_em` para atender a LGPD.
  - Chamados nunca são excluídos.
  - Sessões e tokens usam `revogada_em` / `revogado_em`, que é revogação e não exclusão.
  - Anexos são excluídos de verdade (hard-delete), e um job apaga os arquivos que ficarem sem referência.

---

## 1. `apps/api/prisma/schema.prisma` (completo)

```prisma
// apps/api/prisma/schema.prisma — Prisma ORM 7.10.1 (versão fixa)
// URL do banco: apps/api/prisma.config.ts (Prisma 7 não aceita url aqui).
// Convenções: models/campos pt-BR camelCase; tabelas/colunas snake_case; datas timestamptz(3).
// Colunas busca/busca_norm são mantidas por TRIGGER (migração init) — a aplicação nunca escreve nelas.
// Gravar FKs sempre por campo escalar (UncheckedCreateInput), nunca via connect.

generator client {
  provider            = "prisma-client"
  output              = "../src/generated/prisma"
  moduleFormat        = "esm"
  importFileExtension = "js"
  previewFeatures     = ["partialIndexes"]
}

datasource db {
  provider = "postgresql"
}

// ═════════════════════════════ ENUMS ═════════════════════════════

/// Tipo funcional do status (regras de fluxo e de SLA)
enum TipoStatus {
  aberto // na fila
  andamento // em atendimento
  pendente // aguardando usuário/terceiro/agendamento
  resolvido // solução registrada, aguardando aceite
  encerrado // finalizado

  @@map("tipo_status")
}

enum TipoAssentamento {
  comentario // público
  privado // só quem tem chamado.privado
  sistema // evento automático

  @@map("tipo_assentamento")
}

enum CanalAbertura {
  web
  email
  api
  telefone
  presencial

  @@map("canal_abertura")
}

enum AlgoritmoSenha {
  scrypt_legado // "salt:hash" do Vinimon antigo; vira argon2id no próximo login
  argon2id

  @@map("algoritmo_senha")
}

enum PresencaStatus {
  disponivel
  ocupado
  ausente

  @@map("presenca_status")
}

enum TipoNotificacao {
  chamado_aberto
  comentario
  mencao
  atribuido
  status_alterado
  prioridade_alterada
  encaminhado
  agendado
  resolvido
  encerrado
  reaberto
  anexo
  sla_alerta
  sla_estourado
  aceite_pendente
  aviso
  atualizado // genérico (legado)

  @@map("tipo_notificacao")
}

enum CanalNotificacao {
  app
  desktop
  email

  @@map("canal_notificacao")
}

enum OrigemSeguidor {
  solicitante
  operador
  comentario
  mencao
  manual

  @@map("origem_seguidor")
}

enum TipoVinculo {
  relacionado // simétrico (origem_id < destino_id)
  duplicado // origem é duplicata de destino

  @@map("tipo_vinculo")
}

enum TipoCampo {
  texto
  texto_longo
  numero
  data
  booleano
  selecao
  selecao_multipla

  @@map("tipo_campo")
}

enum SituacaoAtivo {
  em_uso
  em_estoque
  em_manutencao
  baixado

  @@map("situacao_ativo")
}

enum TipoMovimentacaoAtivo {
  local
  responsavel
  situacao

  @@map("tipo_movimentacao_ativo")
}

enum SituacaoArtigo {
  rascunho
  publicado
  arquivado

  @@map("situacao_artigo")
}

enum VisibilidadeArtigo {
  publico // todos os usuários
  interno // só quem tem kb.ver_interno

  @@map("visibilidade_artigo")
}

enum NivelAviso {
  info
  alerta
  critico

  @@map("nivel_aviso")
}

enum DestinoAviso {
  todos
  operadores
  area

  @@map("destino_aviso")
}

enum StatusEmail {
  pendente
  enviado
  falhou

  @@map("status_email")
}

// ═════════════════════════ ORGANIZAÇÃO ═════════════════════════

/// Cliente/empresa atendida (opcional em instalação de empresa única)
model Cliente {
  id           Int      @id @default(autoincrement())
  nome         String   @unique @db.VarChar(150)
  /// CNPJ/CPF só dígitos
  documento    String?  @unique @db.VarChar(20)
  email        String?  @db.VarChar(254)
  telefone     String?  @db.VarChar(40)
  observacao   String?  @db.Text
  ativo        Boolean  @default(true)
  criadoEm     DateTime @default(now()) @map("criado_em") @db.Timestamptz(3)
  atualizadoEm DateTime @default(now()) @updatedAt @map("atualizado_em") @db.Timestamptz(3)

  unidades Unidade[]
  usuarios Usuario[]
  chamados Chamado[]
  ativos   Ativo[]

  @@map("clientes")
}

/// Unidade (filial/prédio) de um cliente
model Unidade {
  id        Int      @id @default(autoincrement())
  clienteId Int      @map("cliente_id")
  nome      String   @db.VarChar(120)
  endereco  String?  @db.VarChar(300)
  cidade    String?  @db.VarChar(100)
  uf        String?  @db.Char(2)
  ativo     Boolean  @default(true)
  criadoEm  DateTime @default(now()) @map("criado_em") @db.Timestamptz(3)

  cliente       Cliente        @relation(fields: [clienteId], references: [id], onDelete: Restrict)
  departamentos Departamento[]
  locais        Local[]
  chamados      Chamado[]
  ativos        Ativo[]

  @@unique([clienteId, nome])
  @@map("unidades")
}

/// Departamento/setor organizacional
model Departamento {
  id        Int      @id @default(autoincrement())
  unidadeId Int?     @map("unidade_id")
  nome      String   @db.VarChar(120)
  ativo     Boolean  @default(true)
  criadoEm  DateTime @default(now()) @map("criado_em") @db.Timestamptz(3)

  unidade  Unidade?  @relation(fields: [unidadeId], references: [id], onDelete: Restrict)
  usuarios Usuario[]
  chamados Chamado[]
  ativos   Ativo[]

  @@unique([unidadeId, nome])
  @@map("departamentos")
}

/// Local físico (sala/andar). IDs preservados do legado
model Local {
  id        Int      @id @default(autoincrement())
  unidadeId Int?     @map("unidade_id")
  nome      String   @db.VarChar(120)
  ativo     Boolean  @default(true)
  criadoEm  DateTime @default(now()) @map("criado_em") @db.Timestamptz(3)

  unidade              Unidade?            @relation(fields: [unidadeId], references: [id], onDelete: Restrict)
  chamados             Chamado[]
  ativos               Ativo[]
  movimentacoesOrigem  AtivoMovimentacao[] @relation("MovLocalAnterior")
  movimentacoesDestino AtivoMovimentacao[] @relation("MovLocalNovo")

  @@unique([unidadeId, nome])
  @@map("locais")
}

// ═════════════════════════ ACESSO / RBAC ═════════════════════════

/// Papel RBAC. Papéis de sistema: admin, operador, usuario
model Papel {
  id        Int      @id @default(autoincrement())
  codigo    String   @unique @db.VarChar(40)
  nome      String   @unique @db.VarChar(80)
  descricao String?  @db.VarChar(300)
  /// não pode ser excluído; o admin sempre recebe todas as permissões
  sistema   Boolean  @default(false)
  ativo     Boolean  @default(true)
  criadoEm  DateTime @default(now()) @map("criado_em") @db.Timestamptz(3)

  permissoes PapelPermissao[]
  usuarios   Usuario[]

  @@map("papeis")
}

/// Catálogo de permissões (fonte: packages/shared/src/permissoes.ts; sincronizado pelo seed)
model Permissao {
  id        Int    @id @default(autoincrement())
  codigo    String @unique @db.VarChar(80)
  descricao String @db.VarChar(200)
  grupo     String @db.VarChar(40)

  papeis PapelPermissao[]

  @@map("permissoes")
}

model PapelPermissao {
  papelId     Int @map("papel_id")
  permissaoId Int @map("permissao_id")

  papel     Papel     @relation(fields: [papelId], references: [id], onDelete: Cascade)
  permissao Permissao @relation(fields: [permissaoId], references: [id], onDelete: Cascade)

  @@id([papelId, permissaoId])
  @@index([permissaoId], map: "ix_papel_permissoes_permissao")
  @@map("papel_permissoes")
}

/// Pessoa com acesso. Nunca excluída (desativar ou anonimizar)
model Usuario {
  id              Int                      @id @default(autoincrement())
  /// minúsculo (CHECK)
  login           String                   @unique @db.VarChar(60)
  nome            String                   @db.VarChar(120)
  /// minúsculo (CHECK)
  email           String?                  @unique @db.VarChar(254)
  telefone        String?                  @db.VarChar(40)
  senhaHash       String                   @map("senha_hash") @db.VarChar(255)
  senhaAlgoritmo  AlgoritmoSenha           @default(argon2id) @map("senha_algoritmo")
  /// força troca de senha no próximo login
  trocarSenha     Boolean                  @default(false) @map("trocar_senha")
  senhaAlteradaEm DateTime?                @map("senha_alterada_em") @db.Timestamptz(3)
  papelId         Int                      @map("papel_id")
  /// área principal (operador: área que atende)
  areaId          Int?                     @map("area_id")
  clienteId       Int?                     @map("cliente_id")
  departamentoId  Int?                     @map("departamento_id")
  avatarChave     String?                  @map("avatar_chave") @db.VarChar(300)
  ativo           Boolean                  @default(true)
  ultimoLoginEm   DateTime?                @map("ultimo_login_em") @db.Timestamptz(3)
  /// LGPD: dados pessoais apagados, registro mantido
  anonimizadoEm   DateTime?                @map("anonimizado_em") @db.Timestamptz(3)
  criadoEm        DateTime                 @default(now()) @map("criado_em") @db.Timestamptz(3)
  atualizadoEm    DateTime                 @default(now()) @updatedAt @map("atualizado_em") @db.Timestamptz(3)
  /// trigger: tsvector 'simple' de nome/login/email
  busca           Unsupported("tsvector")?
  /// trigger: lower(f_unaccent(nome login email)) — autocomplete de @menção
  buscaNorm       String?                  @map("busca_norm") @db.Text

  papel        Papel         @relation(fields: [papelId], references: [id], onDelete: Restrict)
  area         Area?         @relation(fields: [areaId], references: [id], onDelete: Restrict)
  cliente      Cliente?      @relation(fields: [clienteId], references: [id], onDelete: Restrict)
  departamento Departamento? @relation(fields: [departamentoId], references: [id], onDelete: Restrict)

  areasSecundarias          UsuarioArea[]
  sessoes                   Sessao[]
  tentativasLogin           TentativaLogin[]
  mfa                       UsuarioMfa?
  codigosRecuperacao        CodigoRecuperacao[]
  tokensSenha               TokenSenha[]
  tokensApi                 TokenApi[]
  auditorias                Auditoria[]
  presenca                  Presenca?
  preferenciasNotificacao   PreferenciaNotificacao[]
  chamadosSolicitados       Chamado[]                @relation("ChamadoSolicitante")
  chamadosAbertosPor        Chamado[]                @relation("ChamadoAbertoPor")
  chamadosAtendidos         Chamado[]                @relation("ChamadoOperador")
  assentamentos             Assentamento[]
  edicoesAssentamento       AssentamentoEdicao[]
  mencoes                   Mencao[]
  seguindo                  ChamadoSeguidor[]
  leituras                  ChamadoLeitura[]
  historicoStatus           ChamadoStatusHistorico[]
  vinculosCriados           ChamadoVinculo[]
  apontamentos              Apontamento[]
  avaliacoes                AvaliacaoChamado[]
  notificacoes              Notificacao[]            @relation("NotificacaoDestinatario")
  notificacoesGeradas       Notificacao[]            @relation("NotificacaoAtor")
  anexosEnviados            Anexo[]
  ativosResponsavel         Ativo[]
  movimentacoesAutor        AtivoMovimentacao[]      @relation("MovAutor")
  movimentacoesRespAnterior AtivoMovimentacao[]      @relation("MovRespAnterior")
  movimentacoesRespNovo     AtivoMovimentacao[]      @relation("MovRespNovo")
  artigos                   Artigo[]
  avisos                    Aviso[]
  avisosLidos               AvisoLeitura[]
  emailsSaida               EmailSaida[]

  @@index([papelId], map: "ix_usuarios_papel")
  @@index([areaId], map: "ix_usuarios_area")
  @@index([busca], type: Gin, map: "ix_usuarios_busca")
  @@index([buscaNorm(ops: raw("gin_trgm_ops"))], type: Gin, map: "ix_usuarios_busca_norm_trgm")
  @@map("usuarios")
}

/// Áreas secundárias atendidas pelo operador (escopo "ver_area")
model UsuarioArea {
  usuarioId Int @map("usuario_id")
  areaId    Int @map("area_id")

  usuario Usuario @relation(fields: [usuarioId], references: [id], onDelete: Cascade)
  area    Area    @relation(fields: [areaId], references: [id], onDelete: Cascade)

  @@id([usuarioId, areaId])
  @@index([areaId], map: "ix_usuario_areas_area")
  @@map("usuario_areas")
}

/// Sessão web/socket. O token do cookie nunca é gravado, só seu SHA-256
model Sessao {
  id              String    @id @default(uuid(7)) @db.Uuid
  usuarioId       Int       @map("usuario_id")
  tokenHash       Bytes     @unique @map("token_hash")
  /// senha ok, aguardando TOTP (sessão parcial, sem acesso)
  mfaPendente     Boolean   @default(false) @map("mfa_pendente")
  ip              String?   @db.Inet
  userAgent       String?   @map("user_agent") @db.VarChar(400)
  criadoEm        DateTime  @default(now()) @map("criado_em") @db.Timestamptz(3)
  expiraEm        DateTime  @map("expira_em") @db.Timestamptz(3)
  /// atualizado no máximo a cada 5 min
  ultimoUsoEm     DateTime  @default(now()) @map("ultimo_uso_em") @db.Timestamptz(3)
  revogadaEm      DateTime? @map("revogada_em") @db.Timestamptz(3)
  /// logout | troca_senha | admin | mfa_reset
  motivoRevogacao String?   @map("motivo_revogacao") @db.VarChar(40)

  usuario Usuario @relation(fields: [usuarioId], references: [id], onDelete: Cascade)

  @@index([usuarioId], map: "ix_sessoes_usuario_ativas", where: raw("revogada_em IS NULL"))
  @@index([expiraEm], map: "ix_sessoes_expira_em")
  @@map("sessoes")
}

/// Tentativas de login (bloqueio por login+ip e por ip; expurgo > 90 dias)
model TentativaLogin {
  id        Int      @id @default(autoincrement())
  login     String   @db.VarChar(60)
  usuarioId Int?     @map("usuario_id")
  ip        String   @db.Inet
  sucesso   Boolean
  /// ok | senha_invalida | usuario_inexistente | inativo | bloqueado | mfa_invalido
  motivo    String   @db.VarChar(30)
  userAgent String?  @map("user_agent") @db.VarChar(400)
  criadoEm  DateTime @default(now()) @map("criado_em") @db.Timestamptz(3)

  usuario Usuario? @relation(fields: [usuarioId], references: [id], onDelete: SetNull)

  @@index([login, criadoEm], map: "ix_tentativas_login_login")
  @@index([ip, criadoEm], map: "ix_tentativas_login_ip")
  @@map("tentativas_login")
}

/// 2FA TOTP: segredo cifrado AES-256-GCM (chave MFA_ENC_KEY, AAD = usuario_id)
model UsuarioMfa {
  usuarioId      Int       @id @map("usuario_id")
  segredoCifrado Bytes     @map("segredo_cifrado")
  iv             Bytes
  authTag        Bytes     @map("auth_tag")
  chaveVersao    Int       @default(1) @map("chave_versao") @db.SmallInt
  /// null = cadastro iniciado e ainda não confirmado
  confirmadoEm   DateTime? @map("confirmado_em") @db.Timestamptz(3)
  /// último time-step aceito (anti-replay)
  ultimoPasso    Int?      @map("ultimo_passo")
  criadoEm       DateTime  @default(now()) @map("criado_em") @db.Timestamptz(3)

  usuario Usuario @relation(fields: [usuarioId], references: [id], onDelete: Cascade)

  @@map("usuario_mfa")
}

/// Códigos de recuperação 2FA (hash argon2id; uso único)
model CodigoRecuperacao {
  id         Int       @id @default(autoincrement())
  usuarioId  Int       @map("usuario_id")
  codigoHash String    @map("codigo_hash") @db.VarChar(255)
  usadoEm    DateTime? @map("usado_em") @db.Timestamptz(3)
  criadoEm   DateTime  @default(now()) @map("criado_em") @db.Timestamptz(3)

  usuario Usuario @relation(fields: [usuarioId], references: [id], onDelete: Cascade)

  @@index([usuarioId], map: "ix_codigos_recuperacao_usuario")
  @@map("codigos_recuperacao")
}

/// Token de redefinição de senha (SHA-256; uso único)
model TokenSenha {
  id        Int       @id @default(autoincrement())
  usuarioId Int       @map("usuario_id")
  tokenHash Bytes     @unique @map("token_hash")
  ip        String?   @db.Inet
  expiraEm  DateTime  @map("expira_em") @db.Timestamptz(3)
  usadoEm   DateTime? @map("usado_em") @db.Timestamptz(3)
  criadoEm  DateTime  @default(now()) @map("criado_em") @db.Timestamptz(3)

  usuario Usuario @relation(fields: [usuarioId], references: [id], onDelete: Cascade)

  @@index([usuarioId], map: "ix_tokens_senha_usuario")
  @@map("tokens_senha")
}

/// Token de API pessoal (age como o usuário, limitado a escopos). Revogado, nunca excluído
model TokenApi {
  id          Int       @id @default(autoincrement())
  usuarioId   Int       @map("usuario_id")
  nome        String    @db.VarChar(80)
  /// exibido na UI, ex.: "vnm_3fA9xQ2k"
  prefixo     String    @unique @db.VarChar(16)
  /// SHA-256 do token completo
  tokenHash   Bytes     @unique @map("token_hash")
  /// códigos de permissão (subconjunto das permissões do usuário no momento do uso)
  escopos     String[]  @default([])
  expiraEm    DateTime? @map("expira_em") @db.Timestamptz(3)
  ultimoUsoEm DateTime? @map("ultimo_uso_em") @db.Timestamptz(3)
  ultimoIp    String?   @map("ultimo_ip") @db.Inet
  criadoEm    DateTime  @default(now()) @map("criado_em") @db.Timestamptz(3)
  revogadoEm  DateTime? @map("revogado_em") @db.Timestamptz(3)

  usuario    Usuario     @relation(fields: [usuarioId], references: [id], onDelete: Restrict)
  auditorias Auditoria[]

  @@index([usuarioId], map: "ix_tokens_api_usuario")
  @@map("tokens_api")
}

/// Trilha de auditoria (somente inserção — trigger bloqueia UPDATE/DELETE < 365 dias)
model Auditoria {
  id         Int      @id @default(autoincrement())
  atorId     Int?     @map("ator_id")
  tokenApiId Int?     @map("token_api_id")
  /// ex.: login.sucesso, usuario.atualizar, config.alterar, chamado.excluir_mensagem
  acao       String   @db.VarChar(60)
  entidade   String   @db.VarChar(60)
  entidadeId String?  @map("entidade_id") @db.VarChar(40)
  antes      Json?
  depois     Json?
  ip         String?  @db.Inet
  userAgent  String?  @map("user_agent") @db.VarChar(400)
  requestId  String?  @map("request_id") @db.VarChar(64)
  criadoEm   DateTime @default(now()) @map("criado_em") @db.Timestamptz(3)

  ator     Usuario?  @relation(fields: [atorId], references: [id], onDelete: Restrict)
  tokenApi TokenApi? @relation(fields: [tokenApiId], references: [id], onDelete: Restrict)

  @@index([entidade, entidadeId, criadoEm(sort: Desc)], map: "ix_auditoria_entidade")
  @@index([atorId, criadoEm(sort: Desc)], map: "ix_auditoria_ator")
  @@index([criadoEm], type: Brin, map: "ix_auditoria_criado_em_brin")
  @@map("auditoria")
}

/// Presença escolhida + último visto (conexão/"digitando" ficam só em memória/Socket.IO)
model Presenca {
  usuarioId     Int            @id @map("usuario_id")
  status        PresencaStatus @default(disponivel)
  mensagem      String?        @db.VarChar(120)
  /// gravado no disconnect e a cada ≥ 60 s de heartbeat
  ultimoVistoEm DateTime?      @map("ultimo_visto_em") @db.Timestamptz(3)
  atualizadoEm  DateTime       @default(now()) @updatedAt @map("atualizado_em") @db.Timestamptz(3)

  usuario Usuario @relation(fields: [usuarioId], references: [id], onDelete: Cascade)

  @@map("presencas")
}

/// Preferência por evento × canal (linha ausente = padrão do código)
model PreferenciaNotificacao {
  usuarioId Int              @map("usuario_id")
  tipo      TipoNotificacao
  canal     CanalNotificacao
  ativo     Boolean

  usuario Usuario @relation(fields: [usuarioId], references: [id], onDelete: Cascade)

  @@id([usuarioId, tipo, canal])
  @@map("preferencias_notificacao")
}

// ═════════════════════════ CATÁLOGOS ═════════════════════════

/// Área (fila de atendimento quando atende = true). IDs preservados
model Area {
  id        Int      @id @default(autoincrement())
  nome      String   @unique @db.VarChar(120)
  email     String?  @db.VarChar(254)
  atende    Boolean  @default(true)
  /// jornada de SLA da área (null = config sla.jornada_padrao_id)
  jornadaId Int?     @map("jornada_id")
  ativo     Boolean  @default(true)
  criadoEm  DateTime @default(now()) @map("criado_em") @db.Timestamptz(3)

  jornada             Jornada?      @relation(fields: [jornadaId], references: [id], onDelete: Restrict)
  usuarios            Usuario[]
  usuariosSecundarios UsuarioArea[]
  problemas           Problema[]
  chamados            Chamado[]
  avisos              Aviso[]

  @@map("areas")
}

/// Prioridade (SLA padrão quando o tipo de problema não define). IDs preservados
model Prioridade {
  id             Int     @id @default(autoincrement())
  nome           String  @unique @db.VarChar(60)
  cor            String  @default("#888888") @db.Char(7)
  ordem          Int     @default(0)
  slaRespostaMin Int?    @map("sla_resposta_min")
  slaSolucaoMin  Int?    @map("sla_solucao_min")
  ativo          Boolean @default(true)

  chamados Chamado[]

  @@map("prioridades")
}

/// Status de chamado. IDs preservados
model Status {
  id       Int        @id @default(autoincrement())
  nome     String     @unique @db.VarChar(60)
  /// papel de sistema (null = comum): inicial | em_atendimento | aguardando_usuario | agendado | aguardando_aceite | encerrado
  codigo   String?    @unique @db.VarChar(40)
  cor      String     @default("#888888") @db.Char(7)
  tipo     TipoStatus @default(andamento)
  /// para o relógio de SLA de solução (obrigatório em resolvido/encerrado — CHECK)
  pausaSla Boolean    @default(false) @map("pausa_sla")
  ordem    Int        @default(0)
  ativo    Boolean    @default(true)

  chamados  Chamado[]
  historico ChamadoStatusHistorico[]

  @@unique([id, tipo], map: "uq_status_id_tipo")
  @@map("status")
}

/// Tipo de problema (define área e SLA). IDs preservados
model Problema {
  id             Int     @id @default(autoincrement())
  nome           String  @unique @db.VarChar(120)
  descricao      String? @db.VarChar(500)
  areaId         Int?    @map("area_id")
  slaRespostaMin Int?    @map("sla_resposta_min")
  slaSolucaoMin  Int?    @map("sla_solucao_min")
  ativo          Boolean @default(true)

  area     Area?            @relation(fields: [areaId], references: [id], onDelete: Restrict)
  chamados Chamado[]
  artigos  Artigo[]
  campos   CampoProblema[]
  scripts  ScriptProblema[]

  @@index([areaId], map: "ix_problemas_area")
  @@map("problemas")
}

model Tag {
  id    Int     @id @default(autoincrement())
  nome  String  @unique @db.VarChar(50)
  cor   String  @default("#607d8b") @db.Char(7)
  ativo Boolean @default(true)

  chamados ChamadoTag[]

  @@map("tags")
}

/// Definição de campo personalizado de chamado
model CampoPersonalizado {
  id                 Int       @id @default(autoincrement())
  /// slug estável, ex.: "centro_custo"
  chave              String    @unique @db.VarChar(60)
  rotulo             String    @db.VarChar(120)
  tipo               TipoCampo
  opcoes             String[]  @default([])
  obrigatorio        Boolean   @default(false)
  ajuda              String?   @db.VarChar(300)
  ordem              Int       @default(0)
  /// aparece em todos os tipos de problema
  todosProblemas     Boolean   @default(false) @map("todos_problemas")
  visivelSolicitante Boolean   @default(true) @map("visivel_solicitante")
  ativo              Boolean   @default(true)
  criadoEm           DateTime  @default(now()) @map("criado_em") @db.Timestamptz(3)

  problemas CampoProblema[]
  valores   ChamadoCampoValor[]

  @@map("campos_personalizados")
}

/// Vínculo campo × tipo de problema
model CampoProblema {
  campoId     Int      @map("campo_id")
  problemaId  Int      @map("problema_id")
  /// sobrescreve campos_personalizados.obrigatorio
  obrigatorio Boolean?
  ordem       Int      @default(0)

  campo    CampoPersonalizado @relation(fields: [campoId], references: [id], onDelete: Cascade)
  problema Problema           @relation(fields: [problemaId], references: [id], onDelete: Cascade)

  @@id([campoId, problemaId])
  @@index([problemaId], map: "ix_campo_problemas_problema")
  @@map("campo_problemas")
}

// ═════════════════════════ SLA ═════════════════════════

/// Perfil de jornada (calendário de SLA)
model Jornada {
  id           Int      @id @default(autoincrement())
  nome         String   @unique @db.VarChar(80)
  /// IANA, ex.: America/Sao_Paulo
  timezone     String   @default("America/Sao_Paulo") @db.VarChar(64)
  /// 24x7: ignora horários e feriados
  ininterrupta Boolean  @default(false)
  ativo        Boolean  @default(true)
  criadoEm     DateTime @default(now()) @map("criado_em") @db.Timestamptz(3)
  atualizadoEm DateTime @default(now()) @updatedAt @map("atualizado_em") @db.Timestamptz(3)

  horarios JornadaHorario[]
  feriados Feriado[]
  areas    Area[]
  chamados Chamado[]

  @@map("jornadas")
}

/// Janela útil semanal [inicio_min, fim_min) em hora local; várias por dia permitidas
model JornadaHorario {
  id        Int @id @default(autoincrement())
  jornadaId Int @map("jornada_id")
  /// 0=domingo … 6=sábado
  diaSemana Int @map("dia_semana") @db.SmallInt
  /// minutos desde 00:00 (0–1439)
  inicioMin Int @map("inicio_min") @db.SmallInt
  /// exclusivo (1–1440; 1440 = 24:00)
  fimMin    Int @map("fim_min") @db.SmallInt

  jornada Jornada @relation(fields: [jornadaId], references: [id], onDelete: Cascade)

  @@unique([jornadaId, diaSemana, inicioMin])
  @@map("jornada_horarios")
}

/// Feriado. recorrente = repete todo ano (usa dia/mês; convenção: ano 2000)
model Feriado {
  id         Int      @id @default(autoincrement())
  data       DateTime @db.Date
  nome       String   @db.VarChar(120)
  recorrente Boolean  @default(false)
  /// null = vale para todas as jornadas
  jornadaId  Int?     @map("jornada_id")
  criadoEm   DateTime @default(now()) @map("criado_em") @db.Timestamptz(3)

  jornada Jornada? @relation(fields: [jornadaId], references: [id], onDelete: Cascade)

  @@index([data], map: "ix_feriados_data")
  @@index([jornadaId], map: "ix_feriados_jornada")
  @@map("feriados")
}

// ═════════════════════════ CHAMADOS ═════════════════════════

/// Chamado. Nunca é excluído pela aplicação. IDs preservados
model Chamado {
  id                          Int           @id @default(autoincrement())
  assunto                     String        @db.VarChar(200)
  descricao                   String        @db.Text
  solucao                     String?       @db.Text
  canal                       CanalAbertura @default(web)
  contato                     String?       @db.VarChar(120)
  telefone                    String?       @db.VarChar(40)
  solicitanteId               Int           @map("solicitante_id")
  /// quem registrou (≠ solicitante quando aberto "em nome de")
  abertoPorId                 Int           @map("aberto_por_id")
  operadorId                  Int?          @map("operador_id")
  areaId                      Int           @map("area_id")
  problemaId                  Int?          @map("problema_id")
  prioridadeId                Int           @map("prioridade_id")
  statusId                    Int           @map("status_id")
  /// cópia de status.tipo garantida pela FK composta (status_id, status_tipo)
  statusTipo                  TipoStatus    @map("status_tipo")
  /// início do status atual (vira intervalo no histórico na próxima transição)
  statusDesde                 DateTime      @default(now()) @map("status_desde") @db.Timestamptz(3)
  clienteId                   Int?          @map("cliente_id")
  unidadeId                   Int?          @map("unidade_id")
  departamentoId              Int?          @map("departamento_id")
  localId                     Int?          @map("local_id")
  ativoId                     Int?          @map("ativo_id")
  /// sub-chamado: pai
  chamadoPaiId                Int?          @map("chamado_pai_id")
  abertoEm                    DateTime      @default(now()) @map("aberto_em") @db.Timestamptz(3)
  /// só enquanto está no status de codigo "agendado"
  agendadoPara                DateTime?     @map("agendado_para") @db.Timestamptz(3)
  primeiraRespostaEm          DateTime?     @map("primeira_resposta_em") @db.Timestamptz(3)
  /// solução registrada (tipo resolvido/encerrado); null = EM ABERTO
  resolvidoEm                 DateTime?     @map("resolvido_em") @db.Timestamptz(3)
  fechadoEm                   DateTime?     @map("fechado_em") @db.Timestamptz(3)
  /// prazo para aceite; vencido → job auto-encerra
  aceiteLimiteEm              DateTime?     @map("aceite_limite_em") @db.Timestamptz(3)
  /// jornada usada no SLA (snapshot na abertura/troca de área)
  jornadaId                   Int           @map("jornada_id")
  slaRespostaMin              Int?          @map("sla_resposta_min")
  slaSolucaoMin               Int?          @map("sla_solucao_min")
  prazoRespostaEm             DateTime?     @map("prazo_resposta_em") @db.Timestamptz(3)
  /// null com SLA definido = relógio parado (pausa iniciada antes do prazo)
  prazoSolucaoEm              DateTime?     @map("prazo_solucao_em") @db.Timestamptz(3)
  /// status atual pausa o SLA (snapshot de status.pausa_sla na transição)
  slaPausado                  Boolean       @default(false) @map("sla_pausado")
  /// soma das pausas encerradas em segundos úteis (cache)
  slaPausadoSeg               Int           @default(0) @map("sla_pausado_seg")
  /// gravado na 1ª resposta
  slaRespostaCumprido         Boolean?      @map("sla_resposta_cumprido")
  /// gravado na resolução; limpo ao reabrir
  slaSolucaoCumprido          Boolean?      @map("sla_solucao_cumprido")
  slaAvisoEm                  DateTime?     @map("sla_aviso_em") @db.Timestamptz(3)
  slaEstouroAvisoEm           DateTime?     @map("sla_estouro_aviso_em") @db.Timestamptz(3)
  /// desnormalizado (sem FK) p/ "não lido" na lista
  ultimoAssentamentoId        Int?          @map("ultimo_assentamento_id")
  ultimoAssentamentoPublicoId Int?          @map("ultimo_assentamento_publico_id")
  ultimaAtividadeEm           DateTime      @default(now()) @map("ultima_atividade_em") @db.Timestamptz(3)
  /// lock otimista: updateMany({ where: { id, versao } })
  versao                      Int           @default(0)
  atualizadoEm                DateTime      @default(now()) @updatedAt @map("atualizado_em") @db.Timestamptz(3)
  /// trigger: assunto(A) descricao(B) solucao(C), 'portuguese' + f_unaccent
  busca                       Unsupported("tsvector")?

  solicitante  Usuario       @relation("ChamadoSolicitante", fields: [solicitanteId], references: [id], onDelete: Restrict)
  abertoPor    Usuario       @relation("ChamadoAbertoPor", fields: [abertoPorId], references: [id], onDelete: Restrict)
  operador     Usuario?      @relation("ChamadoOperador", fields: [operadorId], references: [id], onDelete: Restrict)
  area         Area          @relation(fields: [areaId], references: [id], onDelete: Restrict)
  problema     Problema?     @relation(fields: [problemaId], references: [id], onDelete: Restrict)
  prioridade   Prioridade    @relation(fields: [prioridadeId], references: [id], onDelete: Restrict)
  status       Status        @relation(fields: [statusId, statusTipo], references: [id, tipo], onDelete: Restrict, onUpdate: Cascade)
  cliente      Cliente?      @relation(fields: [clienteId], references: [id], onDelete: Restrict)
  unidade      Unidade?      @relation(fields: [unidadeId], references: [id], onDelete: Restrict)
  departamento Departamento? @relation(fields: [departamentoId], references: [id], onDelete: Restrict)
  local        Local?        @relation(fields: [localId], references: [id], onDelete: Restrict)
  ativo        Ativo?        @relation(fields: [ativoId], references: [id], onDelete: Restrict)
  jornada      Jornada       @relation(fields: [jornadaId], references: [id], onDelete: Restrict)
  chamadoPai   Chamado?      @relation("SubChamados", fields: [chamadoPaiId], references: [id], onDelete: Restrict)

  subChamados     Chamado[]                @relation("SubChamados")
  assentamentos   Assentamento[]
  anexos          Anexo[]
  historicoStatus ChamadoStatusHistorico[]
  seguidores      ChamadoSeguidor[]
  leituras        ChamadoLeitura[]
  vinculosOrigem  ChamadoVinculo[]         @relation("VinculoOrigem")
  vinculosDestino ChamadoVinculo[]         @relation("VinculoDestino")
  tags            ChamadoTag[]
  camposValores   ChamadoCampoValor[]
  apontamentos    Apontamento[]
  avaliacao       AvaliacaoChamado?
  notificacoes    Notificacao[]
  mencoes         Mencao[]
  emailsSaida     EmailSaida[]

  @@index([solicitanteId, id(sort: Desc)], map: "ix_chamados_solicitante")
  @@index([areaId, statusTipo, id(sort: Desc)], map: "ix_chamados_area_tipo")
  @@index([operadorId, statusTipo, id(sort: Desc)], map: "ix_chamados_operador_tipo")
  @@index([statusId, id(sort: Desc)], map: "ix_chamados_status")
  @@index([areaId, id(sort: Desc)], map: "ix_chamados_area_em_aberto", where: raw("resolvido_em IS NULL"))
  @@index([operadorId, id(sort: Desc)], map: "ix_chamados_operador_em_aberto", where: raw("resolvido_em IS NULL"))
  @@index([areaId, abertoEm], map: "ix_chamados_fila", where: raw("resolvido_em IS NULL AND operador_id IS NULL"))
  @@index([prazoSolucaoEm], map: "ix_chamados_prazo_solucao", where: raw("resolvido_em IS NULL AND prazo_solucao_em IS NOT NULL"))
  @@index([prazoRespostaEm], map: "ix_chamados_prazo_resposta", where: raw("primeira_resposta_em IS NULL AND prazo_resposta_em IS NOT NULL"))
  @@index([agendadoPara], map: "ix_chamados_agendados", where: raw("agendado_para IS NOT NULL"))
  @@index([aceiteLimiteEm], map: "ix_chamados_aceite", where: raw("aceite_limite_em IS NOT NULL"))
  @@index([jornadaId], map: "ix_chamados_jornada_em_aberto", where: raw("resolvido_em IS NULL"))
  @@index([abertoEm], map: "ix_chamados_aberto_em")
  @@index([fechadoEm], map: "ix_chamados_fechado_em", where: raw("fechado_em IS NOT NULL"))
  @@index([problemaId], map: "ix_chamados_problema")
  @@index([clienteId, id(sort: Desc)], map: "ix_chamados_cliente", where: raw("cliente_id IS NOT NULL"))
  @@index([ativoId, id(sort: Desc)], map: "ix_chamados_ativo", where: raw("ativo_id IS NOT NULL"))
  @@index([chamadoPaiId], map: "ix_chamados_pai", where: raw("chamado_pai_id IS NOT NULL"))
  @@index([busca], type: Gin, map: "ix_chamados_busca")
  @@map("chamados")
}

/// Intervalos FECHADOS de status (o atual está em chamados.status_desde). Base do SLA pausável
model ChamadoStatusHistorico {
  id         Int        @id @default(autoincrement())
  chamadoId  Int        @map("chamado_id")
  statusId   Int        @map("status_id")
  statusTipo TipoStatus @map("status_tipo")
  /// snapshot de status.pausa_sla no intervalo
  pausaSla   Boolean    @map("pausa_sla")
  inicioEm   DateTime   @map("inicio_em") @db.Timestamptz(3)
  fimEm      DateTime   @map("fim_em") @db.Timestamptz(3)
  /// null = sistema/job
  usuarioId  Int?       @map("usuario_id")

  chamado Chamado  @relation(fields: [chamadoId], references: [id], onDelete: Cascade)
  status  Status   @relation(fields: [statusId], references: [id], onDelete: Restrict)
  usuario Usuario? @relation(fields: [usuarioId], references: [id], onDelete: SetNull)

  @@index([chamadoId, inicioEm], map: "ix_historico_chamado")
  @@index([statusId], map: "ix_historico_status")
  @@map("chamado_status_historico")
}

/// Seguidores = destinatários das notificações do chamado
model ChamadoSeguidor {
  chamadoId Int            @map("chamado_id")
  usuarioId Int            @map("usuario_id")
  origem    OrigemSeguidor @default(manual)
  criadoEm  DateTime       @default(now()) @map("criado_em") @db.Timestamptz(3)

  chamado Chamado @relation(fields: [chamadoId], references: [id], onDelete: Cascade)
  usuario Usuario @relation(fields: [usuarioId], references: [id], onDelete: Cascade)

  @@id([chamadoId, usuarioId])
  @@index([usuarioId], map: "ix_seguidores_usuario")
  @@map("chamado_seguidores")
}

/// Confirmação de leitura: ponteiro monotônico (só aumenta, via GREATEST)
model ChamadoLeitura {
  chamadoId                Int      @map("chamado_id")
  usuarioId                Int      @map("usuario_id")
  ultimoAssentamentoLidoId Int      @map("ultimo_assentamento_lido_id")
  lidoEm                   DateTime @default(now()) @map("lido_em") @db.Timestamptz(3)

  chamado Chamado @relation(fields: [chamadoId], references: [id], onDelete: Cascade)
  usuario Usuario @relation(fields: [usuarioId], references: [id], onDelete: Cascade)

  @@id([chamadoId, usuarioId])
  @@index([usuarioId], map: "ix_leituras_usuario")
  @@map("chamado_leituras")
}

/// Chamados relacionados/duplicados (sub-chamado é chamados.chamado_pai_id)
model ChamadoVinculo {
  origemId    Int         @map("origem_id")
  destinoId   Int         @map("destino_id")
  tipo        TipoVinculo @default(relacionado)
  criadoPorId Int         @map("criado_por_id")
  criadoEm    DateTime    @default(now()) @map("criado_em") @db.Timestamptz(3)

  origem    Chamado @relation("VinculoOrigem", fields: [origemId], references: [id], onDelete: Cascade)
  destino   Chamado @relation("VinculoDestino", fields: [destinoId], references: [id], onDelete: Cascade)
  criadoPor Usuario @relation(fields: [criadoPorId], references: [id], onDelete: Restrict)

  @@id([origemId, destinoId])
  @@index([destinoId], map: "ix_vinculos_destino")
  @@map("chamado_vinculos")
}

model ChamadoTag {
  chamadoId Int      @map("chamado_id")
  tagId     Int      @map("tag_id")
  criadoEm  DateTime @default(now()) @map("criado_em") @db.Timestamptz(3)

  chamado Chamado @relation(fields: [chamadoId], references: [id], onDelete: Cascade)
  tag     Tag     @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([chamadoId, tagId])
  @@index([tagId, chamadoId], map: "ix_chamado_tags_tag")
  @@map("chamado_tags")
}

/// Valor de campo personalizado (JSON validado por Zod conforme campo.tipo)
model ChamadoCampoValor {
  chamadoId    Int      @map("chamado_id")
  campoId      Int      @map("campo_id")
  valor        Json
  atualizadoEm DateTime @default(now()) @updatedAt @map("atualizado_em") @db.Timestamptz(3)

  chamado Chamado            @relation(fields: [chamadoId], references: [id], onDelete: Cascade)
  campo   CampoPersonalizado @relation(fields: [campoId], references: [id], onDelete: Restrict)

  @@id([chamadoId, campoId])
  @@index([campoId], map: "ix_campo_valores_campo")
  @@map("chamado_campo_valores")
}

/// Mensagem da timeline (chat em tempo real). Soft-delete justificado: placeholder + integridade de leitura/menções
model Assentamento {
  id           Int              @id @default(autoincrement())
  chamadoId    Int              @map("chamado_id")
  autorId      Int              @map("autor_id")
  tipo         TipoAssentamento @default(comentario)
  /// Markdown (sanitizado na renderização); '' permitido só se excluído
  texto        String           @db.Text
  /// tipo=sistema: status_alterado | atribuido | encaminhado | agendado | resolvido | encerrado | reaberto | anexo | legado …
  evento       String?          @db.VarChar(40)
  /// tipo=sistema: detalhes estruturados (de/para)
  dados        Json?
  /// idempotência do envio via socket (reenvio após reconexão)
  clienteMsgId String?          @map("cliente_msg_id") @db.Uuid
  criadoEm     DateTime         @default(now()) @map("criado_em") @db.Timestamptz(3)
  editadoEm    DateTime?        @map("editado_em") @db.Timestamptz(3)
  excluidoEm   DateTime?        @map("excluido_em") @db.Timestamptz(3)

  chamado      Chamado              @relation(fields: [chamadoId], references: [id], onDelete: Cascade)
  autor        Usuario              @relation(fields: [autorId], references: [id], onDelete: Restrict)
  edicoes      AssentamentoEdicao[]
  mencoes      Mencao[]
  anexos       Anexo[]
  notificacoes Notificacao[]

  @@unique([chamadoId, clienteMsgId])
  @@index([chamadoId, id], map: "ix_assentamentos_chamado")
  @@index([autorId, criadoEm], map: "ix_assentamentos_autor")
  @@map("assentamentos")
}

/// Histórico de edição de mensagem
model AssentamentoEdicao {
  id             Int      @id @default(autoincrement())
  assentamentoId Int      @map("assentamento_id")
  editorId       Int      @map("editor_id")
  textoAnterior  String   @map("texto_anterior") @db.Text
  criadoEm       DateTime @default(now()) @map("criado_em") @db.Timestamptz(3)

  assentamento Assentamento @relation(fields: [assentamentoId], references: [id], onDelete: Cascade)
  editor       Usuario      @relation(fields: [editorId], references: [id], onDelete: Restrict)

  @@index([assentamentoId], map: "ix_edicoes_assentamento")
  @@map("assentamento_edicoes")
}

/// @menção em mensagem
model Mencao {
  id             Int      @id @default(autoincrement())
  assentamentoId Int      @map("assentamento_id")
  usuarioId      Int      @map("usuario_id")
  chamadoId      Int      @map("chamado_id")
  criadoEm       DateTime @default(now()) @map("criado_em") @db.Timestamptz(3)

  assentamento Assentamento @relation(fields: [assentamentoId], references: [id], onDelete: Cascade)
  usuario      Usuario      @relation(fields: [usuarioId], references: [id], onDelete: Cascade)
  chamado      Chamado      @relation(fields: [chamadoId], references: [id], onDelete: Cascade)

  @@unique([assentamentoId, usuarioId])
  @@index([usuarioId], map: "ix_mencoes_usuario")
  @@index([chamadoId], map: "ix_mencoes_chamado")
  @@map("mencoes")
}

/// Metadados de arquivo (conteúdo em disco/S3, endereçado por sha256). Exatamente 1 dono (CHECK)
model Anexo {
  id             Int      @id @default(autoincrement())
  chamadoId      Int?     @map("chamado_id")
  /// mensagem do chat que trouxe o anexo
  assentamentoId Int?     @map("assentamento_id")
  ativoId        Int?     @map("ativo_id")
  artigoId       Int?     @map("artigo_id")
  enviadoPorId   Int      @map("enviado_por_id")
  nome           String   @db.VarChar(255)
  mime           String   @db.VarChar(127)
  tamanho        Int
  sha256         String   @db.Char(64)
  /// local | s3
  storage        String   @default("local") @db.VarChar(20)
  /// anexos/ab/cd/<sha256>
  storageChave   String   @map("storage_chave") @db.VarChar(500)
  /// ativos: nota_fiscal | contrato | manual | garantia | outro
  categoria      String?  @db.VarChar(40)
  criadoEm       DateTime @default(now()) @map("criado_em") @db.Timestamptz(3)

  chamado      Chamado?      @relation(fields: [chamadoId], references: [id], onDelete: Cascade)
  assentamento Assentamento? @relation(fields: [assentamentoId], references: [id], onDelete: SetNull)
  ativo        Ativo?        @relation(fields: [ativoId], references: [id], onDelete: Cascade)
  artigo       Artigo?       @relation(fields: [artigoId], references: [id], onDelete: Cascade)
  enviadoPor   Usuario       @relation(fields: [enviadoPorId], references: [id], onDelete: Restrict)

  @@index([chamadoId], map: "ix_anexos_chamado")
  @@index([assentamentoId], map: "ix_anexos_assentamento")
  @@index([ativoId], map: "ix_anexos_ativo")
  @@index([artigoId], map: "ix_anexos_artigo")
  @@index([sha256], map: "ix_anexos_sha256")
  @@map("anexos")
}

/// Apontamento de horas trabalhadas
model Apontamento {
  id        Int      @id @default(autoincrement())
  chamadoId Int      @map("chamado_id")
  usuarioId Int      @map("usuario_id")
  inicioEm  DateTime @map("inicio_em") @db.Timestamptz(3)
  /// 1–1440 (CHECK)
  minutos   Int
  descricao String?  @db.VarChar(500)
  criadoEm  DateTime @default(now()) @map("criado_em") @db.Timestamptz(3)

  chamado Chamado @relation(fields: [chamadoId], references: [id], onDelete: Cascade)
  usuario Usuario @relation(fields: [usuarioId], references: [id], onDelete: Restrict)

  @@index([chamadoId], map: "ix_apontamentos_chamado")
  @@index([usuarioId, inicioEm], map: "ix_apontamentos_usuario")
  @@map("apontamentos")
}

/// Avaliação/aceite final (1:1). Rejeição não gera linha: reabre + assentamento
model AvaliacaoChamado {
  chamadoId   Int      @id @map("chamado_id")
  /// null quando automatico
  avaliadorId Int?     @map("avaliador_id")
  /// 1–5
  nota        Int?     @db.SmallInt
  comentario  String?  @db.VarChar(1000)
  /// auto-encerrado por prazo de aceite
  automatico  Boolean  @default(false)
  criadoEm    DateTime @default(now()) @map("criado_em") @db.Timestamptz(3)

  chamado   Chamado  @relation(fields: [chamadoId], references: [id], onDelete: Cascade)
  avaliador Usuario? @relation(fields: [avaliadorId], references: [id], onDelete: Restrict)

  @@index([criadoEm], map: "ix_avaliacoes_criado_em")
  @@map("avaliacoes")
}

/// Feed de atividade/notificações do usuário. IDs preservados
model Notificacao {
  id             Int             @id @default(autoincrement())
  usuarioId      Int             @map("usuario_id")
  tipo           TipoNotificacao
  chamadoId      Int?            @map("chamado_id")
  assentamentoId Int?            @map("assentamento_id")
  atorId         Int?            @map("ator_id")
  texto          String          @db.VarChar(300)
  dados          Json?
  lidaEm         DateTime?       @map("lida_em") @db.Timestamptz(3)
  criadoEm       DateTime        @default(now()) @map("criado_em") @db.Timestamptz(3)

  usuario      Usuario       @relation("NotificacaoDestinatario", fields: [usuarioId], references: [id], onDelete: Cascade)
  ator         Usuario?      @relation("NotificacaoAtor", fields: [atorId], references: [id], onDelete: SetNull)
  chamado      Chamado?      @relation(fields: [chamadoId], references: [id], onDelete: Cascade)
  assentamento Assentamento? @relation(fields: [assentamentoId], references: [id], onDelete: SetNull)

  @@index([usuarioId, id(sort: Desc)], map: "ix_notificacoes_feed")
  @@index([usuarioId, tipo, id(sort: Desc)], map: "ix_notificacoes_feed_tipo")
  @@index([usuarioId, chamadoId], map: "ix_notificacoes_nao_lidas", where: raw("lida_em IS NULL"))
  @@index([criadoEm], map: "ix_notificacoes_criado_em")
  @@map("notificacoes")
}

// ═════════════════════════ INVENTÁRIO ═════════════════════════

model TipoAtivo {
  id    Int     @id @default(autoincrement())
  nome  String  @unique @db.VarChar(80)
  ativo Boolean @default(true)

  modelos ModeloAtivo[]
  ativos  Ativo[]

  @@map("tipos_ativo")
}

model Fabricante {
  id    Int     @id @default(autoincrement())
  nome  String  @unique @db.VarChar(100)
  site  String? @db.VarChar(200)
  ativo Boolean @default(true)

  modelos ModeloAtivo[]

  @@map("fabricantes")
}

/// Modelo de equipamento (especificações padrão em JSON)
model ModeloAtivo {
  id             Int     @id @default(autoincrement())
  tipoId         Int     @map("tipo_id")
  fabricanteId   Int?    @map("fabricante_id")
  nome           String  @db.VarChar(120)
  especificacoes Json?
  ativo          Boolean @default(true)

  tipo       TipoAtivo   @relation(fields: [tipoId], references: [id], onDelete: Restrict)
  fabricante Fabricante? @relation(fields: [fabricanteId], references: [id], onDelete: Restrict)
  ativos     Ativo[]

  @@unique([tipoId, nome])
  @@index([fabricanteId], map: "ix_modelos_fabricante")
  @@map("modelos_ativo")
}

/// Ativo de inventário (antigo "equipamentos"). IDs preservados
model Ativo {
  id               Int           @id @default(autoincrement())
  /// patrimônio
  etiqueta         String        @unique @db.VarChar(60)
  serie            String?       @db.VarChar(100)
  /// descrição curta/hostname
  nome             String?       @db.VarChar(150)
  tipoId           Int           @map("tipo_id")
  modeloId         Int?          @map("modelo_id")
  situacao         SituacaoAtivo @default(em_uso)
  clienteId        Int?          @map("cliente_id")
  unidadeId        Int?          @map("unidade_id")
  departamentoId   Int?          @map("departamento_id")
  localId          Int?          @map("local_id")
  responsavelId    Int?          @map("responsavel_id")
  /// legado: responsável sem cadastro
  responsavelTexto String?       @map("responsavel_texto") @db.VarChar(120)
  fornecedor       String?       @db.VarChar(120)
  notaFiscal       String?       @map("nota_fiscal") @db.VarChar(60)
  valorAquisicao   Decimal?      @map("valor_aquisicao") @db.Decimal(12, 2)
  dataAquisicao    DateTime?     @map("data_aquisicao") @db.Date
  garantiaAte      DateTime?     @map("garantia_ate") @db.Date
  garantiaObs      String?       @map("garantia_obs") @db.VarChar(300)
  observacao       String?       @db.Text
  criadoEm         DateTime      @default(now()) @map("criado_em") @db.Timestamptz(3)
  atualizadoEm     DateTime      @default(now()) @updatedAt @map("atualizado_em") @db.Timestamptz(3)
  /// trigger: 'simple' de etiqueta/serie/nome/observacao
  busca            Unsupported("tsvector")?
  /// trigger: lower(f_unaccent(etiqueta serie nome)) — busca parcial
  buscaNorm        String?       @map("busca_norm") @db.Text

  tipo          TipoAtivo           @relation(fields: [tipoId], references: [id], onDelete: Restrict)
  modelo        ModeloAtivo?        @relation(fields: [modeloId], references: [id], onDelete: Restrict)
  cliente       Cliente?            @relation(fields: [clienteId], references: [id], onDelete: Restrict)
  unidade       Unidade?            @relation(fields: [unidadeId], references: [id], onDelete: Restrict)
  departamento  Departamento?       @relation(fields: [departamentoId], references: [id], onDelete: Restrict)
  local         Local?              @relation(fields: [localId], references: [id], onDelete: Restrict)
  responsavel   Usuario?            @relation(fields: [responsavelId], references: [id], onDelete: Restrict)
  chamados      Chamado[]
  componentes   ComponenteAtivo[]
  movimentacoes AtivoMovimentacao[]
  anexos        Anexo[]

  @@index([tipoId], map: "ix_ativos_tipo")
  @@index([modeloId], map: "ix_ativos_modelo")
  @@index([situacao], map: "ix_ativos_situacao")
  @@index([localId], map: "ix_ativos_local")
  @@index([responsavelId], map: "ix_ativos_responsavel")
  @@index([clienteId], map: "ix_ativos_cliente")
  @@index([garantiaAte], map: "ix_ativos_garantia", where: raw("garantia_ate IS NOT NULL"))
  @@index([busca], type: Gin, map: "ix_ativos_busca")
  @@index([buscaNorm(ops: raw("gin_trgm_ops"))], type: Gin, map: "ix_ativos_busca_norm_trgm")
  @@map("ativos")
}

/// Componente/especificação instalada (histórico por removido_em)
model ComponenteAtivo {
  id          Int       @id @default(autoincrement())
  ativoId     Int       @map("ativo_id")
  /// Processador | Memória | Disco | Placa de vídeo | Sistema operacional | …
  tipo        String    @db.VarChar(60)
  descricao   String    @db.VarChar(200)
  capacidade  String?   @db.VarChar(60)
  serie       String?   @db.VarChar(100)
  quantidade  Int       @default(1)
  instaladoEm DateTime? @map("instalado_em") @db.Date
  removidoEm  DateTime? @map("removido_em") @db.Date
  criadoEm    DateTime  @default(now()) @map("criado_em") @db.Timestamptz(3)

  ativo Ativo @relation(fields: [ativoId], references: [id], onDelete: Cascade)

  @@index([ativoId], map: "ix_componentes_ativo")
  @@map("componentes_ativo")
}

/// Histórico de localização/responsável/situação (log de eventos)
model AtivoMovimentacao {
  id                    Int                   @id @default(autoincrement())
  ativoId               Int                   @map("ativo_id")
  tipo                  TipoMovimentacaoAtivo
  localAnteriorId       Int?                  @map("local_anterior_id")
  localNovoId           Int?                  @map("local_novo_id")
  responsavelAnteriorId Int?                  @map("responsavel_anterior_id")
  responsavelNovoId     Int?                  @map("responsavel_novo_id")
  situacaoAnterior      SituacaoAtivo?        @map("situacao_anterior")
  situacaoNova          SituacaoAtivo?        @map("situacao_nova")
  observacao            String?               @db.VarChar(500)
  autorId               Int                   @map("autor_id")
  criadoEm              DateTime              @default(now()) @map("criado_em") @db.Timestamptz(3)

  ativo               Ativo    @relation(fields: [ativoId], references: [id], onDelete: Cascade)
  localAnterior       Local?   @relation("MovLocalAnterior", fields: [localAnteriorId], references: [id], onDelete: Restrict)
  localNovo           Local?   @relation("MovLocalNovo", fields: [localNovoId], references: [id], onDelete: Restrict)
  responsavelAnterior Usuario? @relation("MovRespAnterior", fields: [responsavelAnteriorId], references: [id], onDelete: Restrict)
  responsavelNovo     Usuario? @relation("MovRespNovo", fields: [responsavelNovoId], references: [id], onDelete: Restrict)
  autor               Usuario  @relation("MovAutor", fields: [autorId], references: [id], onDelete: Restrict)

  @@index([ativoId, criadoEm(sort: Desc)], map: "ix_movimentacoes_ativo")
  @@map("ativo_movimentacoes")
}

// ═════════════════════════ CONHECIMENTO ═════════════════════════

model CategoriaArtigo {
  id     Int     @id @default(autoincrement())
  nome   String  @db.VarChar(100)
  paiId  Int?    @map("pai_id")
  ordem  Int     @default(0)
  ativo  Boolean @default(true)

  pai     CategoriaArtigo?  @relation("CategoriaHierarquia", fields: [paiId], references: [id], onDelete: Restrict)
  filhas  CategoriaArtigo[] @relation("CategoriaHierarquia")
  artigos Artigo[]

  @@unique([paiId, nome])
  @@map("categorias_artigo")
}

/// Artigo da base de conhecimento (antigo "faq"). IDs preservados
model Artigo {
  id            Int                @id @default(autoincrement())
  titulo        String             @db.VarChar(200)
  slug          String             @unique @db.VarChar(220)
  resumo        String?            @db.VarChar(500)
  /// Markdown
  conteudo      String             @db.Text
  categoriaId   Int?               @map("categoria_id")
  /// sugestão de artigo ao abrir chamado deste tipo
  problemaId    Int?               @map("problema_id")
  situacao      SituacaoArtigo     @default(rascunho)
  visibilidade  VisibilidadeArtigo @default(publico)
  autorId       Int?               @map("autor_id")
  visualizacoes Int                @default(0)
  publicadoEm   DateTime?          @map("publicado_em") @db.Timestamptz(3)
  criadoEm      DateTime           @default(now()) @map("criado_em") @db.Timestamptz(3)
  atualizadoEm  DateTime           @default(now()) @updatedAt @map("atualizado_em") @db.Timestamptz(3)
  /// trigger: titulo(A) resumo(B) conteudo(C), 'portuguese' + f_unaccent
  busca         Unsupported("tsvector")?

  categoria CategoriaArtigo? @relation(fields: [categoriaId], references: [id], onDelete: Restrict)
  problema  Problema?        @relation(fields: [problemaId], references: [id], onDelete: Restrict)
  autor     Usuario?         @relation(fields: [autorId], references: [id], onDelete: Restrict)
  anexos    Anexo[]

  @@index([situacao, visibilidade], map: "ix_artigos_situacao")
  @@index([categoriaId], map: "ix_artigos_categoria")
  @@index([problemaId], map: "ix_artigos_problema")
  @@index([busca], type: Gin, map: "ix_artigos_busca")
  @@map("artigos")
}

/// Script de atendimento (roteiro para operadores)
model ScriptAtendimento {
  id           Int      @id @default(autoincrement())
  titulo       String   @db.VarChar(200)
  conteudo     String   @db.Text
  ativo        Boolean  @default(true)
  criadoEm     DateTime @default(now()) @map("criado_em") @db.Timestamptz(3)
  atualizadoEm DateTime @default(now()) @updatedAt @map("atualizado_em") @db.Timestamptz(3)

  problemas ScriptProblema[]

  @@map("scripts_atendimento")
}

model ScriptProblema {
  scriptId   Int @map("script_id")
  problemaId Int @map("problema_id")

  script   ScriptAtendimento @relation(fields: [scriptId], references: [id], onDelete: Cascade)
  problema Problema          @relation(fields: [problemaId], references: [id], onDelete: Cascade)

  @@id([scriptId, problemaId])
  @@index([problemaId], map: "ix_script_problemas_problema")
  @@map("script_problemas")
}

// ═════════════════════════ COMUNICAÇÃO ═════════════════════════

/// Mural de avisos
model Aviso {
  id       Int          @id @default(autoincrement())
  titulo   String       @db.VarChar(200)
  conteudo String       @db.Text
  nivel    NivelAviso   @default(info)
  destino  DestinoAviso @default(todos)
  /// obrigatório quando destino = area (CHECK)
  areaId   Int?         @map("area_id")
  inicioEm DateTime     @default(now()) @map("inicio_em") @db.Timestamptz(3)
  fimEm    DateTime?    @map("fim_em") @db.Timestamptz(3)
  ativo    Boolean      @default(true)
  autorId  Int          @map("autor_id")
  criadoEm DateTime     @default(now()) @map("criado_em") @db.Timestamptz(3)

  area     Area?          @relation(fields: [areaId], references: [id], onDelete: Restrict)
  autor    Usuario        @relation(fields: [autorId], references: [id], onDelete: Restrict)
  leituras AvisoLeitura[]

  @@index([inicioEm], map: "ix_avisos_inicio")
  @@map("avisos")
}

/// Aviso dispensado pelo usuário
model AvisoLeitura {
  avisoId   Int      @map("aviso_id")
  usuarioId Int      @map("usuario_id")
  lidoEm    DateTime @default(now()) @map("lido_em") @db.Timestamptz(3)

  aviso   Aviso   @relation(fields: [avisoId], references: [id], onDelete: Cascade)
  usuario Usuario @relation(fields: [usuarioId], references: [id], onDelete: Cascade)

  @@id([avisoId, usuarioId])
  @@index([usuarioId], map: "ix_aviso_leituras_usuario")
  @@map("aviso_leituras")
}

/// Template de e-mail por evento (variáveis {{chamado.id}} etc.)
model TemplateEmail {
  id           Int      @id @default(autoincrement())
  /// chamado_aberto | chamado_comentario | chamado_mencao | chamado_atribuido | chamado_resolvido | chamado_encerrado | sla_alerta | senha_redefinir
  codigo       String   @unique @db.VarChar(60)
  nome         String   @db.VarChar(120)
  assunto      String   @db.VarChar(200)
  corpoHtml    String   @map("corpo_html") @db.Text
  corpoTexto   String?  @map("corpo_texto") @db.Text
  ativo        Boolean  @default(true)
  atualizadoEm DateTime @default(now()) @updatedAt @map("atualizado_em") @db.Timestamptz(3)

  @@map("templates_email")
}

/// Outbox de e-mails (gravado na mesma transação; job pg-boss envia)
model EmailSaida {
  id                 Int         @id @default(autoincrement())
  para               String      @db.VarChar(254)
  assunto            String      @db.VarChar(300)
  html               String      @db.Text
  texto              String?     @db.Text
  templateCodigo     String?     @map("template_codigo") @db.VarChar(60)
  chamadoId          Int?        @map("chamado_id")
  usuarioId          Int?        @map("usuario_id")
  /// ex.: "notif:123:email" — impede envio duplicado
  chaveIdempotencia  String?     @unique @map("chave_idempotencia") @db.VarChar(150)
  status             StatusEmail @default(pendente)
  tentativas         Int         @default(0)
  proximaTentativaEm DateTime    @default(now()) @map("proxima_tentativa_em") @db.Timestamptz(3)
  erro               String?     @db.VarChar(1000)
  criadoEm           DateTime    @default(now()) @map("criado_em") @db.Timestamptz(3)
  enviadoEm          DateTime?   @map("enviado_em") @db.Timestamptz(3)

  chamado Chamado? @relation(fields: [chamadoId], references: [id], onDelete: SetNull)
  usuario Usuario? @relation(fields: [usuarioId], references: [id], onDelete: SetNull)

  @@index([proximaTentativaEm], map: "ix_emails_pendentes", where: raw("enviado_em IS NULL"))
  @@map("emails_saida")
}

/// Configuração chave/valor (valor JSON tipado pelo registro Zod em packages/shared)
model Config {
  chave        String   @id @db.VarChar(80)
  valor        Json
  atualizadoEm DateTime @default(now()) @updatedAt @map("atualizado_em") @db.Timestamptz(3)

  @@map("config")
}
```

`apps/api/prisma.config.ts`:
```ts
import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
  datasource: { url: env('DATABASE_URL') },
});
```

**Regras de fallback (sem decisão em aberto para o Haiku):**

| Sintoma | Correção |
|---|---|
| (a) `prisma validate` acusa "has no default operator class" em `busca` | Use `@@index([busca(ops: raw("tsvector_ops"))], type: Gin, …)` |
| (b) A mesma mensagem no índice BRIN | Use `criadoEm(ops: TimestampTzMinMaxOps)` |
| (c) Rodar `prisma migrate dev` de novo, depois do init, não responde "Already in sync" por causa de índice parcial | Rode `prisma db pull --print` e copie exatamente o `where: raw(...)` que ele imprime |
| (d) A FK composta com enum for rejeitada | Troque por `fields: [statusId], references: [id]`, remova `@@unique([id, tipo])` e mantenha só os CHECKs |

---

## 2. SQL extra da migração `init`

**Procedimento:**
1. Rode `pnpm --filter api exec prisma migrate dev --create-only --name init`.
2. No `migration.sql` gerado, cole o **bloco A no topo** e o **bloco B no fim**.
3. Rode `pnpm --filter api exec prisma migrate dev`.
4. Rode `migrate dev` de novo. A resposta precisa ser "Already in sync" (critério de aceite).

**Bloco A (topo):**
```sql
-- ===== A) Extensões + unaccent imutável (antes do DDL gerado; o índice gin_trgm_ops depende de pg_trgm) =====
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- unaccent() é STABLE (procura o dicionário via search_path) → não pode ser usado em índice/coluna gerada.
-- ERRADO (não usar): CREATE FUNCTION f_unaccent(text) RETURNS text AS $$ SELECT unaccent($1) $$ LANGUAGE sql IMMUTABLE;
--   (depende de search_path → quebra em pg_dump/pg_restore, que rodam com search_path vazio).
-- CERTO: função e dicionário qualificados pelo schema, corpo SQL-standard (PG14+) resolvido na criação.
CREATE OR REPLACE FUNCTION public.f_unaccent(text)
  RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
BEGIN ATOMIC
  SELECT public.unaccent('public.unaccent'::regdictionary, $1);
END;
-- Se as regras do unaccent mudarem, rode REINDEX nos índices que dependem dela.
```

**Bloco B (fim):**
```sql
-- ===== B1) Triggers de busca (colunas busca/busca_norm declaradas no Prisma; índices GIN também) =====
CREATE OR REPLACE FUNCTION public.tg_chamados_busca() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.busca :=
       setweight(to_tsvector('portuguese', public.f_unaccent(coalesce(NEW.assunto, ''))), 'A')
    || setweight(to_tsvector('portuguese', public.f_unaccent(left(coalesce(NEW.descricao, ''), 200000))), 'B')
    || setweight(to_tsvector('portuguese', public.f_unaccent(left(coalesce(NEW.solucao, ''), 100000))), 'C');
  RETURN NEW;
END $$;
CREATE TRIGGER tg_chamados_busca BEFORE INSERT OR UPDATE OF assunto, descricao, solucao
  ON public.chamados FOR EACH ROW EXECUTE FUNCTION public.tg_chamados_busca();

CREATE OR REPLACE FUNCTION public.tg_artigos_busca() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.busca :=
       setweight(to_tsvector('portuguese', public.f_unaccent(coalesce(NEW.titulo, ''))), 'A')
    || setweight(to_tsvector('portuguese', public.f_unaccent(coalesce(NEW.resumo, ''))), 'B')
    || setweight(to_tsvector('portuguese', public.f_unaccent(left(coalesce(NEW.conteudo, ''), 200000))), 'C');
  RETURN NEW;
END $$;
CREATE TRIGGER tg_artigos_busca BEFORE INSERT OR UPDATE OF titulo, resumo, conteudo
  ON public.artigos FOR EACH ROW EXECUTE FUNCTION public.tg_artigos_busca();

CREATE OR REPLACE FUNCTION public.tg_usuarios_busca() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE t text;
BEGIN
  t := lower(public.f_unaccent(concat_ws(' ', NEW.nome, NEW.login, NEW.email)));
  NEW.busca_norm := t;
  NEW.busca := to_tsvector('simple', t);
  RETURN NEW;
END $$;
CREATE TRIGGER tg_usuarios_busca BEFORE INSERT OR UPDATE OF nome, login, email
  ON public.usuarios FOR EACH ROW EXECUTE FUNCTION public.tg_usuarios_busca();

CREATE OR REPLACE FUNCTION public.tg_ativos_busca() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE t text;
BEGIN
  t := lower(public.f_unaccent(concat_ws(' ', NEW.etiqueta, NEW.serie, NEW.nome)));
  NEW.busca_norm := t;
  NEW.busca := setweight(to_tsvector('simple', t), 'A')
            || setweight(to_tsvector('simple', lower(public.f_unaccent(left(coalesce(NEW.observacao, ''), 50000)))), 'C');
  RETURN NEW;
END $$;
CREATE TRIGGER tg_ativos_busca BEFORE INSERT OR UPDATE OF etiqueta, serie, nome, observacao
  ON public.ativos FOR EACH ROW EXECUTE FUNCTION public.tg_ativos_busca();

-- ===== B2) CHECK constraints =====
ALTER TABLE usuarios ADD CONSTRAINT ck_usuarios_login CHECK (login = lower(btrim(login)) AND char_length(login) BETWEEN 2 AND 60);
ALTER TABLE usuarios ADD CONSTRAINT ck_usuarios_email CHECK (email IS NULL OR (email = lower(btrim(email)) AND position('@' in email) > 1));
ALTER TABLE prioridades ADD CONSTRAINT ck_prioridades_cor CHECK (cor ~ '^#[0-9a-fA-F]{6}$');
ALTER TABLE status ADD CONSTRAINT ck_status_cor CHECK (cor ~ '^#[0-9a-fA-F]{6}$');
ALTER TABLE tags ADD CONSTRAINT ck_tags_cor CHECK (cor ~ '^#[0-9a-fA-F]{6}$');
ALTER TABLE status ADD CONSTRAINT ck_status_pausa_final CHECK (tipo NOT IN ('resolvido','encerrado') OR pausa_sla);
ALTER TABLE prioridades ADD CONSTRAINT ck_prioridades_sla CHECK ((sla_resposta_min IS NULL OR sla_resposta_min > 0) AND (sla_solucao_min IS NULL OR sla_solucao_min > 0));
ALTER TABLE problemas ADD CONSTRAINT ck_problemas_sla CHECK ((sla_resposta_min IS NULL OR sla_resposta_min > 0) AND (sla_solucao_min IS NULL OR sla_solucao_min > 0));
ALTER TABLE jornada_horarios ADD CONSTRAINT ck_jornada_horarios CHECK (dia_semana BETWEEN 0 AND 6 AND inicio_min >= 0 AND fim_min <= 1440 AND fim_min > inicio_min);

ALTER TABLE chamados ADD CONSTRAINT ck_chamados_assunto  CHECK (char_length(btrim(assunto)) > 0);
ALTER TABLE chamados ADD CONSTRAINT ck_chamados_resolvido CHECK ((status_tipo IN ('resolvido','encerrado')) = (resolvido_em IS NOT NULL));
ALTER TABLE chamados ADD CONSTRAINT ck_chamados_fechado  CHECK ((status_tipo = 'encerrado') = (fechado_em IS NOT NULL));
ALTER TABLE chamados ADD CONSTRAINT ck_chamados_aceite   CHECK (aceite_limite_em IS NULL OR status_tipo = 'resolvido');
ALTER TABLE chamados ADD CONSTRAINT ck_chamados_agendado CHECK (agendado_para IS NULL OR resolvido_em IS NULL);
ALTER TABLE chamados ADD CONSTRAINT ck_chamados_datas CHECK (
      (resolvido_em IS NULL OR resolvido_em >= aberto_em)
  AND (fechado_em IS NULL OR fechado_em >= resolvido_em)
  AND (primeira_resposta_em IS NULL OR primeira_resposta_em >= aberto_em));
ALTER TABLE chamados ADD CONSTRAINT ck_chamados_sla CHECK (
      (sla_resposta_min IS NULL OR sla_resposta_min > 0)
  AND (sla_solucao_min IS NULL OR sla_solucao_min > 0) AND sla_pausado_seg >= 0);
ALTER TABLE chamados ADD CONSTRAINT ck_chamados_pai CHECK (chamado_pai_id IS NULL OR chamado_pai_id <> id);

ALTER TABLE chamado_status_historico ADD CONSTRAINT ck_historico_intervalo CHECK (fim_em >= inicio_em);
ALTER TABLE chamado_vinculos ADD CONSTRAINT ck_vinculos CHECK (origem_id <> destino_id AND (tipo <> 'relacionado' OR origem_id < destino_id));
ALTER TABLE assentamentos ADD CONSTRAINT ck_assentamentos_texto CHECK (excluido_em IS NOT NULL OR char_length(btrim(texto)) > 0);
ALTER TABLE anexos ADD CONSTRAINT ck_anexos_dono CHECK (num_nonnulls(chamado_id, ativo_id, artigo_id) = 1);
ALTER TABLE anexos ADD CONSTRAINT ck_anexos_assentamento CHECK (assentamento_id IS NULL OR chamado_id IS NOT NULL);
ALTER TABLE anexos ADD CONSTRAINT ck_anexos_arquivo CHECK (tamanho > 0 AND sha256 ~ '^[0-9a-f]{64}$');
ALTER TABLE apontamentos ADD CONSTRAINT ck_apontamentos_minutos CHECK (minutos BETWEEN 1 AND 1440);
ALTER TABLE avaliacoes ADD CONSTRAINT ck_avaliacoes CHECK ((nota IS NULL OR nota BETWEEN 1 AND 5) AND (automatico OR (nota IS NOT NULL AND avaliador_id IS NOT NULL)));
ALTER TABLE campos_personalizados ADD CONSTRAINT ck_campos_opcoes CHECK (tipo NOT IN ('selecao','selecao_multipla') OR cardinality(opcoes) > 0);
ALTER TABLE avisos ADD CONSTRAINT ck_avisos CHECK ((fim_em IS NULL OR fim_em > inicio_em) AND (destino <> 'area' OR area_id IS NOT NULL));
ALTER TABLE sessoes ADD CONSTRAINT ck_sessoes_expira CHECK (expira_em > criado_em);
ALTER TABLE tokens_api ADD CONSTRAINT ck_tokens_api_expira CHECK (expira_em IS NULL OR expira_em > criado_em);
ALTER TABLE usuario_mfa ADD CONSTRAINT ck_usuario_mfa_cripto CHECK (octet_length(iv) = 12 AND octet_length(auth_tag) = 16);
ALTER TABLE ativos ADD CONSTRAINT ck_ativos_valor CHECK (valor_aquisicao IS NULL OR valor_aquisicao >= 0);
ALTER TABLE componentes_ativo ADD CONSTRAINT ck_componentes_qtd CHECK (quantidade > 0);
ALTER TABLE emails_saida ADD CONSTRAINT ck_emails_tentativas CHECK (tentativas >= 0);

-- ===== B3) Auditoria somente-inserção (expurgo só > 365 dias; TRUNCATE em testes não dispara) =====
CREATE OR REPLACE FUNCTION public.tg_auditoria_imutavel() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.criado_em < now() - interval '365 days' THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'auditoria é somente inserção (%)', TG_OP USING ERRCODE = '42501';
END $$;
CREATE TRIGGER tg_auditoria_imutavel BEFORE UPDATE OR DELETE ON public.auditoria
  FOR EACH ROW EXECUTE FUNCTION public.tg_auditoria_imutavel();
```

**Índices parciais** (já declarados no Prisma, todos com predicado `IS NULL` / `IS NOT NULL`):
- `ix_chamados_area_em_aberto`, `ix_chamados_operador_em_aberto`, `ix_chamados_fila`
- `ix_chamados_prazo_solucao`, `ix_chamados_prazo_resposta`
- `ix_chamados_agendados`, `ix_chamados_aceite`, `ix_chamados_jornada_em_aberto`
- `ix_chamados_fechado_em`, `ix_chamados_cliente`, `ix_chamados_ativo`, `ix_chamados_pai`
- `ix_notificacoes_nao_lidas`, `ix_sessoes_usuario_ativas`, `ix_ativos_garantia`, `ix_emails_pendentes`

**Regra de consulta (obrigatória):** "em aberto" é sempre `where: { resolvidoEm: null }`. Nunca filtre por `statusTipo: { in: [...] }` quando quiser usar esses índices.

**Em migrações futuras com tabelas grandes:** use `ADD CONSTRAINT … NOT VALID` seguido de `VALIDATE CONSTRAINT`, e `CREATE INDEX CONCURRENTLY` em migração própria.

**Busca global (Ctrl+K)** usa `$queryRaw` com tagged template.
- O termo é montado no TypeScript:
  1. remover acentos com `normalize('NFD').replace(/\p{M}/gu,'')`;
  2. converter para minúsculas;
  3. separar por `[^\p{L}\p{N}]+`;
  4. manter no máximo 8 tokens com 2 ou mais caracteres;
  5. juntar como `tok:*` unidos por `' & '`.
- Como sobram só letras e dígitos, não existe injeção na sintaxe do tsquery.

```sql
-- chamados (mesmo escopo da lista) e artigos (situacao='publicado' + visibilidade conforme permissão)
SELECT c.id, c.assunto, ts_rank_cd(c.busca, q) AS rank
FROM chamados c, to_tsquery('portuguese', public.f_unaccent(${termo})) q
WHERE c.busca @@ q AND (${escopoSql}) ORDER BY rank DESC, c.id DESC LIMIT 5;
-- usuários/ativos: palavra inteira OU fragmento (trigrama, ≥3 chars; termoLike com % e _ escapados)
SELECT id, nome FROM usuarios
WHERE ativo AND (busca @@ to_tsquery('simple', public.f_unaccent(${termo})) OR busca_norm LIKE ${'%' + termoLike + '%'})
LIMIT 5;
```

**Confirmação de leitura monotônica** (o ponteiro nunca volta):
```sql
INSERT INTO chamado_leituras (chamado_id, usuario_id, ultimo_assentamento_lido_id, lido_em)
VALUES ($1, $2, $3, now())
ON CONFLICT (chamado_id, usuario_id) DO UPDATE
SET ultimo_assentamento_lido_id = GREATEST(chamado_leituras.ultimo_assentamento_lido_id, EXCLUDED.ultimo_assentamento_lido_id),
    lido_em = now();
```

---

## 3. Consultas críticas e o índice que atende cada uma

| # | Consulta | Índice |
|---|---|---|
| 1 | Login: `usuarios WHERE login=$1` | `usuarios_login_key` (unique) |
| 2 | Sessão por cookie: `sessoes WHERE token_hash=$1` (+ revogada/expira) | `sessoes_token_hash_key` |
| 3 | Bloqueio: `count tentativas_login WHERE login=$1 AND criado_em>now()-15min AND NOT sucesso` / por `ip` | `ix_tentativas_login_login` / `ix_tentativas_login_ip` |
| 4 | Token de API: `tokens_api WHERE token_hash=$1` | `tokens_api_token_hash_key` |
| 5 | Lista do operador, em aberto: `(area_id = ANY($areas) OR operador_id=$u OR solicitante_id=$u) AND resolvido_em IS NULL ORDER BY id DESC LIMIT 25` | BitmapOr de `ix_chamados_area_em_aberto` + `ix_chamados_operador_em_aberto` + `ix_chamados_solicitante` |
| 6 | Mesma lista com todos os status ou filtro `status_tipo` | `ix_chamados_area_tipo` + `ix_chamados_operador_tipo` + `ix_chamados_solicitante` |
| 7 | Lista do usuário: `solicitante_id=$u ORDER BY id DESC` | `ix_chamados_solicitante` |
| 8 | Filtro por `status_id` | `ix_chamados_status` |
| 9 | Fila sem operador: `area_id = ANY($) AND operador_id IS NULL AND resolvido_em IS NULL ORDER BY aberto_em` | `ix_chamados_fila` |
| 10 | Painel: abertos (`resolvido_em IS NULL`), "meus" (`operador_id=$u AND resolvido_em IS NULL`) | `ix_chamados_area_em_aberto` / `ix_chamados_operador_em_aberto` (index-only) |
| 11 | SLA estourado: `resolvido_em IS NULL AND prazo_solucao_em < now()` | `ix_chamados_prazo_solucao` (substitui o legado, que carregava todos os chamados abertos na memória) |
| 12 | Job de alerta de SLA: `prazo_solucao_em BETWEEN now() AND now()+30min AND sla_aviso_em IS NULL` | `ix_chamados_prazo_solucao` |
| 13 | Resposta pendente estourada: `primeira_resposta_em IS NULL AND prazo_resposta_em < now()` | `ix_chamados_prazo_resposta` |
| 14 | Abertos hoje / relatório por período: `aberto_em >= $d` / `BETWEEN` | `ix_chamados_aberto_em` |
| 15 | Fechados hoje / período: `fechado_em >= $d` | `ix_chamados_fechado_em` |
| 16 | Job de auto-encerramento: `aceite_limite_em < now()` | `ix_chamados_aceite` |
| 17 | Job que libera agendados: `agendado_para <= now()` | `ix_chamados_agendados` |
| 18 | Recalcular SLA quando a jornada muda: `jornada_id=$j AND resolvido_em IS NULL` | `ix_chamados_jornada_em_aberto` |
| 19 | Chamados de um ativo / de um cliente / sub-chamados | `ix_chamados_ativo` / `ix_chamados_cliente` / `ix_chamados_pai` |
| 20 | Timeline: `assentamentos WHERE chamado_id=$c AND id>$cursor ORDER BY id LIMIT 50` (usuário: `AND tipo<>'privado'`) | `ix_assentamentos_chamado` |
| 21 | Envio idempotente: `(chamado_id, cliente_msg_id)` | unique `assentamentos_chamado_id_cliente_msg_id_key` |
| 22 | "Não lido" na lista: `LEFT JOIN chamado_leituras l ON (l.chamado_id=c.id AND l.usuario_id=$u)` comparado com `c.ultimo_assentamento_id` | PK `chamado_leituras` |
| 23 | "Visto por": `chamado_leituras WHERE chamado_id=$c` | prefixo da PK |
| 24 | Feed de atividade: `notificacoes WHERE usuario_id=$u ORDER BY id DESC LIMIT 30` | `ix_notificacoes_feed` |
| 25 | Feed filtrado (Menções etc.): `usuario_id=$u AND tipo=$t ORDER BY id DESC` | `ix_notificacoes_feed_tipo` |
| 26 | Badge de não lidas e "marcar lidas do chamado": `usuario_id=$u [AND chamado_id=$c] AND lida_em IS NULL` | `ix_notificacoes_nao_lidas` |
| 27 | Destinatários de evento: `chamado_seguidores WHERE chamado_id=$c` / "chamados que sigo" | PK / `ix_seguidores_usuario` |
| 28 | Autocomplete de @menção: `usuarios WHERE ativo AND busca_norm LIKE '%x%' LIMIT 8` | `ix_usuarios_busca_norm_trgm` |
| 29 | Ctrl+K: chamados, artigos, ativos, usuários | `ix_chamados_busca`, `ix_artigos_busca`, `ix_ativos_busca` + `ix_ativos_busca_norm_trgm`, `ix_usuarios_busca` + trgm |
| 30 | Sugestão de FAQ ao digitar: `artigos WHERE situacao='publicado' AND busca @@ q [AND problema_id=$p]` | `ix_artigos_busca` (+ `ix_artigos_problema`) |
| 31 | Operadores de uma área (notificar novo chamado): `usuarios.area_id=$a` ∪ `usuario_areas.area_id=$a` | `ix_usuarios_area` / `ix_usuario_areas_area` |
| 32 | Inventário: filtros por situação/local/tipo/responsável; garantias vencendo | `ix_ativos_*`; `ix_ativos_garantia` |
| 33 | Histórico do ativo: `ativo_movimentacoes WHERE ativo_id ORDER BY criado_em DESC` | `ix_movimentacoes_ativo` |
| 34 | Intervalos de status para o SLA: `chamado_status_historico WHERE chamado_id=$c ORDER BY inicio_em` | `ix_historico_chamado` |
| 35 | Horas por chamado / por operador no período | `ix_apontamentos_chamado` / `ix_apontamentos_usuario` |
| 36 | Auditoria: por entidade, por ator, por período | `ix_auditoria_entidade` / `ix_auditoria_ator` / `ix_auditoria_criado_em_brin` |
| 37 | Outbox de e-mail: `enviado_em IS NULL AND proxima_tentativa_em <= now() AND status='pendente'` | `ix_emails_pendentes` |
| 38 | Expurgo de sessões, tentativas e notificações | `ix_sessoes_expira_em`, `ix_tentativas_login_*`, `ix_notificacoes_criado_em` |
| 39 | GC de arquivos: `anexos WHERE sha256=$h` | `ix_anexos_sha256` |

**Ficaram sem índice de propósito:** `chamados.prioridade_id`, `local_id`, `unidade_id` e `departamento_id`. A seletividade é baixa e a exclusão desses cadastros é rara (só admin). A ordenação por prioridade é feita em memória, sobre a página já filtrada.

**Paginação:** a timeline e o feed usam cursor (keyset por `id`). A lista de chamados continua com `OFFSET`, limitado a 200 por página, como hoje.

---

## 4. Seed (`apps/api/prisma/seed.ts`, executado com `prisma db seed`)

O seed tem duas funções exportadas, e ambas recebem `Prisma.TransactionClient`.

**`seedBase(tx)` — idempotente, roda sempre (inclusive dentro do script de migração):**
1. **Permissões:** `upsert` por `codigo` de todo o catálogo de `packages/shared/src/permissoes.ts`.
2. **Papéis de sistema** `admin` / `operador` / `usuario` (`sistema=true`):
   - `admin` recebe **todas** as permissões a cada execução, com `createMany skipDuplicates`.
   - `operador` e `usuario` recebem o conjunto padrão **só quando o papel é criado**. Assim, ajustes feitos depois pelo admin não são sobrescritos.
3. **Jornadas** (`upsert` por `nome`):
   - "24x7" com `ininterrupta=true`;
   - "Comercial" (seg–sex 08:00–12:00 e 13:00–18:00 = `[480,720]`, `[780,1080]` nos dias 1–5).
4. **Feriados nacionais fixos** (`recorrente=true`, `jornadaId=null`, data no ano 2000):
   - 01-01, 04-21, 05-01, 09-07, 10-12, 11-02, 11-15, 11-20, 12-25.
   - Idempotência via `findFirst({nome, recorrente:true, jornadaId:null})` antes de criar.
   - Feriados móveis (Carnaval, Sexta-feira Santa, Corpus Christi) o admin cadastra manualmente.
5. **Templates de e-mail:** `upsert` por `codigo` com `update: {}` (só cria).
6. **Config padrão:** `createMany skipDuplicates`, nunca sobrescreve. Registro (validado por Zod em `packages/shared/src/config.ts`):

| chave | tipo | padrão | chave legado |
|---|---|---|---|
| sistema.nome | string | "Vinimon" | nome_sistema |
| sistema.organizacao | string | "Minha Empresa" | organizacao |
| sistema.timezone | string IANA | "America/Sao_Paulo" | — |
| sessao.horas | int 1–168 | 8 | sessao_horas |
| anexos.permitir | bool | true | permitir_anexos ('1') |
| anexos.tamanho_max_mb | int 1–50 | 10 | — |
| sla.jornada_padrao_id | int | id da "24x7" (equivale ao comportamento atual) | — |
| sla.alerta_min | int | 30 | — |
| chamado.exigir_aceite | bool | false (equivalente ao atual) | — |
| chamado.aceite_dias | int | 3 | — |
| chamado.reabrir_dias | int (0 = sem limite) | 0 | — |
| seguranca.login_max_falhas | int | 5 | — |
| seguranca.login_bloqueio_min | int | 15 | — |
| seguranca.senha_min | int | 10 | — |
| seguranca.mfa_obrigatorio_papeis | string[] | [] | — |
| notificacoes.retencao_dias | int | 180 | — |

**Catálogo de permissões e padrões por papel** (`permissoes.ts`):
- **Chamados:** `chamado.abrir`, `chamado.abrir_em_nome`, `chamado.ver_proprios`, `chamado.ver_area`, `chamado.ver_todos`, `chamado.comentar`, `chamado.privado`, `chamado.assumir`, `chamado.atribuir`, `chamado.alterar_status`, `chamado.alterar_prioridade`, `chamado.agendar`, `chamado.resolver`, `chamado.encerrar_proprio`, `chamado.reabrir`, `chamado.vincular`, `chamado.apontar_horas`, `chamado.editar_campos`, `chamado.moderar_mensagens`.
- **Demais grupos:** `anexo.enviar`, `painel.ver`, `relatorio.ver`, `ativo.ver`, `ativo.gerenciar`, `kb.ver_interno`, `kb.gerenciar`, `script.ver`, `script.gerenciar`, `aviso.gerenciar`, `cadastro.gerenciar`, `sla.gerenciar`, `usuario.gerenciar`, `papel.gerenciar`, `config.gerenciar`, `template_email.gerenciar`, `auditoria.ver`, `token_api.usar`.
- **operador:** abrir, abrir_em_nome, ver_proprios, ver_area, comentar, privado, assumir, atribuir, alterar_status, alterar_prioridade, agendar, resolver, encerrar_proprio, reabrir, vincular, apontar_horas, editar_campos, anexo.enviar, painel.ver, relatorio.ver, ativo.ver, ativo.gerenciar, kb.ver_interno, kb.gerenciar, script.ver.
- **usuario:** abrir, ver_proprios, comentar, encerrar_proprio, reabrir, anexo.enviar, painel.ver.
- **Escopo de visualização:**
  - `ver_todos` vê tudo.
  - `ver_area` vê: `area_id ∈ {area_id do usuário} ∪ usuario_areas`, OU `operador_id = eu`, OU `solicitante_id = eu`.
  - `ver_proprios` vê: `solicitante_id = eu`.

**`seedInicial(tx)` — só roda se `count(usuarios) = 0` e `SEED_INICIAL !== '0'`.** Equivale ao seed atual:
- **Áreas:** TI (atende), Manutenção Predial (atende), Recursos Humanos (não atende), Financeiro (não atende).
- **Prioridades:** Baixa `#2e8b57`/1, Média `#d9a400`/2, Alta `#e67300`/3, Crítica `#c62828`/4.
- **Status** (nome / cor / tipo / codigo / pausaSla / ordem):
  - Aguardando atendimento / `#1565c0` / aberto / inicial / false / 100
  - Em atendimento / `#6a1b9a` / andamento / em_atendimento / false / 200
  - Pendente (aguardando usuário) / `#d9a400` / pendente / aguardando_usuario / true / 300
  - Agendado / `#00838f` / pendente / agendado / true / 310
  - Aguardando aceite / `#2e7d32` / resolvido / aguardando_aceite / true / 400
  - Encerrado / `#546e7a` / encerrado / encerrado / true / 500
- **Problemas** (horas atuais × 60):
  - Área TI: Computador não liga 120/480, Rede/Internet 60/360, Impressora 240/1440, Instalação de software 480/2880, Acesso/Senha 60/240.
  - Área Manutenção: Ar-condicionado 240/2880, Elétrica 120/1440, Hidráulica 240/1440.
- **Locais:** os 4 atuais.
- **Inventário:**
  - Tipos de ativo: Desktop, Notebook, Impressora, Monitor, Outros.
  - Fabricantes: Dell, Lenovo, HP.
  - Modelos e ativos: PAT-0001, PAT-0002 e PAT-0003, com os dados atuais (`responsavelTexto`).
- **Conhecimento:** categoria "Geral" e os 2 artigos atuais (publicados, visibilidade pública).
- **Usuários:** **somente o admin.** As contas operador/usuario com senha fixa deixam de existir; com `SEED_DEMO=1`, essas duas são criadas com senha aleatória impressa no console.

**Criação do admin (núcleo):**
```ts
const informada = process.env.ADMIN_PASSWORD;
if (informada !== undefined && informada.length < 12) throw new Error('ADMIN_PASSWORD deve ter ao menos 12 caracteres');
const senha = informada ?? randomBytes(18).toString('base64url');   // 24 chars
await tx.usuario.create({ data: {
  login: 'admin', nome: 'Administrador', email: 'admin@exemplo.com',
  senhaHash: await hash(senha, { memoryCost: 19456, timeCost: 2, parallelism: 1 }), // @node-rs/argon2 (padrão = Argon2id; não importar o const enum Algorithm)
  senhaAlgoritmo: 'argon2id', trocarSenha: true, papelId: papelAdmin.id, areaId: areaTI.id } });
return informada ? null : senha;
```
O `main()` roda `seedBase` + `seedInicial` dentro de `prisma.$transaction(fn, { timeout: 60_000 })`. **Depois do commit**, se houver senha gerada, imprime uma única vez:
```
==============================================================
 Administrador criado — login: admin
 Senha: <senha>   (exibida SOMENTE agora; troca obrigatória no 1º login)
==============================================================
```
Com `ADMIN_PASSWORD`, imprime "(definida por ADMIN_PASSWORD)". A senha nunca passa pelo logger (pino).

---

## 5. Migração do SQLite atual para o Postgres

**Arquivo:** `apps/api/scripts/migrar-legado.ts`, executado com `tsx`.
- **Uso:** `pnpm --filter api migrar:legado -- --sqlite ../../data/VINIMON.db [--storage ./storage] [--dry-run] [--exigir-troca-todos]`
- **Bibliotecas:** `node:sqlite` (`DatabaseSync`, leitura), cliente Prisma gerado + `@prisma/adapter-pg` (escrita), `node:crypto` (sha256 e scrypt), `node:fs/promises`, `node:util` (`parseArgs`), `recalcularSla` (seção 6).
- **Bancos legados:** o mesmo script atende `data/ocomon.db`. Esse banco mais antigo não tem a tabela `notificacoes`; a presença das tabelas é verificada em `sqlite_master`.

### 5.1 Mapeamento tabela → model

| SQLite | Model | Regras |
|---|---|---|
| areas | Area | id, nome, atende, ativo; jornadaId = null |
| prioridades | Prioridade | id, nome, cor (fora de `#RRGGBB` vira `#888888` + aviso), ordem; ativo = true |
| status | Status | `tipo` texto → enum; `pausaSla = tipo ∈ {pendente, encerrado}`; `ordem = base(tipo) + id` (aberto 100, andamento 200, pendente 300, encerrado 500). `codigo`: menor id de cada tipo → inicial / em_atendimento / aguardando_usuario / encerrado; nome "Agendado" → agendado |
| problemas | Problema | `sla_*_h × 60` → `sla*Min`; 0 → null (o legado já tratava 0 como "sem SLA") |
| locais | Local | id, nome, ativo; unidadeId = null |
| usuarios | Usuario | `login = lower(trim)` (colisão = **erro**); email lower/trim; email inválido ou duplicado → null para os ids maiores + aviso; `senhaHash` mantido, `senhaAlgoritmo = scrypt_legado`; `nivel` 1/2/3 → papel admin/operador/usuario; `trocarSenha` = senha padrão detectada (abaixo) ou `--exigir-troca-todos` |
| equipamentos | TipoAtivo + ModeloAtivo + Ativo | `tipo` distinto (null → "Outros") → TipoAtivo; (tipo, modelo) → ModeloAtivo (fabricante null); `situacao` 'Em uso' / 'Em estoque' / 'Em manutenção' / 'Baixado' → enum (desconhecido → em_uso + aviso); `responsavel`: nome normalizado (sem acento, minúsculo, espaços colapsados) com **um** único usuário correspondente → `responsavelId`, senão `responsavelTexto`; serie, observacao, localId |
| faq | CategoriaArtigo("Geral") + Artigo | id, titulo, conteudo, problemaId; ativo → situacao publicado/rascunho; visibilidade publico; `slug = slugify(titulo)+'-'+id`; publicadoEm = now se publicado |
| chamados | Chamado | ver 5.3 |
| assentamentos | Assentamento | id, chamadoId, `autorId = usuario_id`, tipo, texto, criadoEm; `evento = 'legado'` quando tipo é sistema |
| anexos | Anexo + arquivo | BLOB → disco com sha256 (5.4); `enviadoPorId = usuario_id`; tamanho = bytes reais |
| notificacoes (se existir) | Notificacao | acao→tipo: comentar→comentario, assumir→atribuido, status→status_alterado, prioridade→prioridade_alterada, encaminhar→encaminhado, agendar→agendado, encerrar→encerrado, reabrir→reaberto, anexar→anexo, outros→atualizado; `lida=1` → `lidaEm = criado_em`; `assentamentoId` inexistente → null; `atorId` = autor do assentamento, se houver |
| config | Config | nome_sistema→sistema.nome, organizacao→sistema.organizacao, sessao_horas→sessao.horas (número, limitado a 1–168), permitir_anexos→anexos.permitir (`'1'` → true); usa `upsert` (legado vence o padrão); chave desconhecida → aviso |
| (derivado) | ChamadoSeguidor | por chamado: solicitante (origem solicitante), operador (operador), autores distintos de assentamentos (comentario) — reproduz quem o legado notificava |
| (derivado) | ChamadoLeitura | para cada seguidor: `ultimoAssentamentoLidoId = max(id)` do chamado, `lidoEm = agora` |

### 5.2 Algoritmo
1. **Cópia segura:** copiar `<db>`, `<db>-wal` e `<db>-shm` (os que existirem) para `os.tmpdir()/vinimon-legado-<ts>/`. Abrir a cópia com `new DatabaseSync(copia)` e rodar `PRAGMA wal_checkpoint(TRUNCATE)`. `PRAGMA integrity_check` precisa retornar `ok`. O arquivo original nunca é aberto.
2. **Leitura:** `SELECT * FROM <tabela> ORDER BY id`. Para anexos, ler só os metadados, sem `dados`.
3. **Validar e normalizar** com função pura `validar(L) → { erros, avisos, norm }`.
   - Qualquer erro aborta com exit 1 **sem gravar nada**.
   - **São erros:**
     - data ISO inválida;
     - FK órfã (ex.: `chamado.status_id` inexistente);
     - `nivel ∉ {1,2,3}`;
     - colisão de login;
     - texto acima do `VarChar` de destino (lista tabela/id/coluna);
     - assunto vazio.
   - **Normalizações (registradas como aviso):**
     - status de tipo encerrado sem `data_fechamento` → `resolvidoEm = fechadoEm = último assentamento ?? abertura`;
     - status não encerrado com `data_fechamento` → limpar `resolvidoEm`/`fechadoEm` (a solução é mantida);
     - `primeira_resposta < abertura` → igualar à abertura.
4. **Senhas padrão:**
   - Para os logins `admin`, `operador` e `usuario`, verificar o hash legado contra `admin123`, `operador123` e `usuario123`, respectivamente (são só 3 verificações scrypt). Se bater, `trocarSenha = true` e o relatório mostra um aviso em destaque.
   - Com `--exigir-troca-todos`, todos os usuários ficam com `trocarSenha = true`. É o recomendado se o repositório foi compartilhado, porque os `.db` com hashes estão commitados.
5. **Arquivos** (5.4). No `--dry-run` só calcula o sha256, sem gravar.
6. **Transação única:**
   - `prisma.$transaction(async tx => {…}, { maxWait: 30_000, timeout: 30*60_000 })`.
   - **Preflight:** se `config['legado.migracao']` não existe e `count(usuarios) > 0`, abortar com "destino já tem dados; use banco vazio (`prisma migrate reset`)".
   - **Ordem de execução:**
     1. `seedBase(tx)`;
     2. mapas papel por nível e jornada 24x7 (`findFirstOrThrow({ where: { ininterrupta: true }, orderBy: { id: 'asc' } })`);
     3. `createMany({ data: lote, skipDuplicates: true })` em lotes de 1000, nesta sequência: areas → prioridades → status → problemas → locais → usuarios → tipos_ativo (depois `findMany` para montar o mapa) → modelos_ativo (idem) → ativos → categorias_artigo → artigos → chamados → assentamentos → anexos → notificacoes → chamado_seguidores → chamado_leituras;
     4. config (`upsert`);
     5. **ajuste das sequences**;
     6. **status de sistema faltantes**: para cada codigo obrigatório (inicial, em_atendimento, aguardando_usuario, agendado, aguardando_aceite, encerrado) sem status, criar o padrão do seed; se o nome já existir, usar o sufixo " (sistema)";
     7. **atualização dos campos desnormalizados**;
     8. marcador `config['legado.migracao'] = { em, origem, contagens }`.
   - Os triggers de busca disparam nos INSERTs.
7. **`--dry-run`:** faz tudo dentro da transação, inclusive CHECKs e FKs, e no final `throw new DryRunRollback()`. Isso desfaz tudo; o script captura o erro, imprime o relatório e sai com 0.
8. **Relatório:** por tabela, linhas lidas / inseridas / já existentes; avisos; arquivos (total, novos, deduplicados, bytes).

**Idempotência:**
- Toda inserção é `skipDuplicates` pelo id preservado, ou pela chave natural nos derivados.
- Arquivos são endereçados por conteúdo, e a sequence é recalculada a cada execução.
- Uma reexecução não duplica nada e não falha; só completa o que faltou.
- Para o corte definitivo após um ensaio: `prisma migrate reset --force` e uma nova execução.

**Ajuste das sequences e campos desnormalizados:**
```ts
const TABELAS_ID_PRESERVADO = ['areas','prioridades','status','problemas','locais','usuarios','ativos','artigos','chamados','assentamentos','anexos','notificacoes'] as const;
for (const t of TABELAS_ID_PRESERVADO)   // nomes vindos de lista fixa → sem injeção
  await tx.$queryRawUnsafe(`SELECT setval(pg_get_serial_sequence('${t}', 'id'), COALESCE((SELECT MAX(id) FROM "${t}"), 0) + 1, false)`);
await tx.$executeRaw`
  UPDATE chamados c SET ultimo_assentamento_id = s.max_id, ultimo_assentamento_publico_id = s.max_pub,
         ultima_atividade_em = GREATEST(c.aberto_em, s.max_em)
  FROM (SELECT chamado_id, MAX(id) max_id, MAX(id) FILTER (WHERE tipo <> 'privado') max_pub, MAX(criado_em) max_em
        FROM assentamentos GROUP BY chamado_id) s
  WHERE s.chamado_id = c.id`;
```

### 5.3 Transformação de chamado (função pura)
- **Campos diretos:** `id`, `assunto`, `descricao`, `solucao`, `contato`, `telefone`, `solicitanteId = usuario_id`, `operadorId`, `areaId`, `problemaId`, `prioridadeId`, `statusId`, `localId`, `ativoId = equipamento_id`.
- **Status:**
  - `statusTipo` = tipo normalizado do status;
  - `slaPausado` = `pausaSla` desse status.
- **Quem abriu:** `abertoPorId` = `usuario_id` do primeiro assentamento do tipo sistema cujo texto começa com "Chamado aberto"; se não houver, o solicitante.
- **Datas:**
  - `abertoEm = data_abertura`;
  - `primeiraRespostaEm = data_primeira_resposta`;
  - `resolvidoEm = fechadoEm = data_fechamento`, só quando encerrado;
  - `agendadoPara = data_agendamento` só se o status atual tem codigo `agendado` (caso contrário null; o histórico fica no texto do assentamento);
  - `statusDesde` = `fechadoEm` se encerrado, senão o `criado_em` máximo dos assentamentos de sistema, senão `abertoEm`.
- **SLA:**
  - `jornadaId` = 24x7, o que preserva a semântica do legado;
  - `slaRespostaMin` / `slaSolucaoMin` = horas do problema × 60;
  - prazos e flags de cumprimento vêm de `recalcularSla({ …, pausas: slaPausado ? [{ inicio: statusDesde, fim: null }] : [] }, cal24x7)`;
  - não há histórico de status no legado, então `slaPausadoSeg = 0`;
  - mudança de comportamento, documentada: um chamado legado que hoje está em status pendente passa a ficar com o relógio parado desde `statusDesde`.

### 5.4 BLOB → disco
```ts
async function gravarArquivo(storage: string, buf: Uint8Array, dryRun: boolean) {
  const sha256 = createHash('sha256').update(buf).digest('hex');
  const chave = `anexos/${sha256.slice(0, 2)}/${sha256.slice(2, 4)}/${sha256}`;
  if (dryRun) return { sha256, chave, novo: false };
  const destino = join(storage, chave);
  try { if ((await stat(destino)).size === buf.byteLength) return { sha256, chave, novo: false }; } catch {}
  await mkdir(dirname(destino), { recursive: true });
  const tmp = `${destino}.tmp-${process.pid}`;
  await writeFile(tmp, buf, { mode: 0o640 });
  await rename(tmp, destino);                     // atômico
  return { sha256, chave, novo: true };
}
// um BLOB por vez (memória constante):
const { dados } = lite.prepare('SELECT dados FROM anexos WHERE id = ?').get(id) as { dados: Uint8Array };
```
Os arquivos são gravados **antes** da transação. Se a transação falhar, sobram só órfãos inofensivos, que o job de GC remove: arquivos sem nenhuma linha em `anexos` e com mais de 24 h.

### 5.5 Hash scrypt mantido e rehash para argon2 no login
```ts
const scrypt = promisify(_scrypt) as (s: string, salt: string, n: number, o: object) => Promise<Buffer>;
export async function verificarScryptLegado(senha: string, armazenado: string) {
  const [salt, hex] = armazenado.split(':');
  if (!/^[0-9a-f]{32}$/.test(salt ?? '') || !/^[0-9a-f]{128}$/.test(hex ?? '')) return false;
  // ATENÇÃO: o legado usa a STRING hex do salt como salt (não os bytes decodificados) — scryptSync(senha, salt, 64)
  const calc = await scrypt(senha, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const orig = Buffer.from(hex, 'hex');
  return calc.length === orig.length && timingSafeEqual(calc, orig);
}
// No login: se senhaAlgoritmo === 'scrypt_legado' e conferir → update { senhaHash: await hash(senha, OPC_ARGON2), senhaAlgoritmo: 'argon2id' }
```

**Depois da migração** (tarefa de segurança):
- Remover `data/*.db*` do índice do git (`git rm --cached`) e adicionar ao `.gitignore`.
- Se o repositório já foi compartilhado, usar `--exigir-troca-todos` e considerar reescrever o histórico com `git filter-repo`.

---

## 6. SLA com jornada, feriados e pausas

### 6.1 Onde os dados ficam
- **`chamados`:**
  - **snapshot da regra:** `jornada_id`, `sla_resposta_min`, `sla_solucao_min`;
  - **resultados:** `prazo_resposta_em`, `prazo_solucao_em`, `sla_resposta_cumprido`, `sla_solucao_cumprido`;
  - **estado do relógio:** `status_desde`, `sla_pausado`, `sla_pausado_seg` (cache);
  - **deduplicação de alertas:** `sla_aviso_em`, `sla_estouro_aviso_em`.
- **`chamado_status_historico`:** intervalos **fechados** `(inicio_em, fim_em, pausa_sla snapshot)`. O intervalo atual não é gravado ali; ele é `status_desde` até agora. Com isso não existe a regra "uma linha aberta por chamado".
- **`jornadas` / `jornada_horarios` / `feriados`:** o calendário. O fuso vem de `jornadas.timezone`; o padrão de novas jornadas é `config sistema.timezone = America/Sao_Paulo`. O TZ do processo nunca é usado.
- **Precedência da regra:**
  - SLA: problema → prioridade → sem SLA.
  - Jornada: `areas.jornada_id` → `config sla.jornada_padrao_id`.
- **Escopo das pausas:** só o SLA de **solução** pausa. O de resposta nunca pausa, porque qualquer ação do operador já registra a primeira resposta.

### 6.2 Funções puras — `apps/api/src/modules/sla/calendario.ts` (luxon)
```ts
import { DateTime } from 'luxon';
export type Horario = { diaSemana: number; inicioMin: number; fimMin: number }; // 0=dom; [inicio,fim) local; fim ≤ 1440
export type CalendarioSla = {
  timezone: string; ininterrupta: boolean; horarios: Horario[];
  feriados: ReadonlySet<string>;            // 'yyyy-MM-dd' (não recorrentes)
  feriadosRecorrentes: ReadonlySet<string>; // 'MM-dd'
};
export class ErroCalendarioSla extends Error {}
const LIMITE_DIAS = 3660;

function porDia(cal: CalendarioSla): Array<Array<[number, number]>> {   // memoizar em WeakMap
  const d: Array<Array<[number, number]>> = [[], [], [], [], [], [], []];
  for (const h of cal.horarios) {
    if (!Number.isInteger(h.diaSemana) || h.diaSemana < 0 || h.diaSemana > 6) throw new ErroCalendarioSla('diaSemana inválido');
    if (!(h.inicioMin >= 0 && h.fimMin <= 1440 && h.fimMin > h.inicioMin)) throw new ErroCalendarioSla('janela inválida');
    d[h.diaSemana].push([h.inicioMin, h.fimMin]);
  }
  for (const j of d) { j.sort((a, b) => a[0] - b[0]); for (let i = 1; i < j.length; i++) if (j[i][0] < j[i - 1][1]) throw new ErroCalendarioSla('janelas sobrepostas'); }
  if (!cal.ininterrupta && d.every(j => j.length === 0)) throw new ErroCalendarioSla('jornada sem horários');
  return d;
}
const instante = (dia: DateTime, min: number) => min >= 1440
  ? dia.plus({ days: 1 }).startOf('day').toMillis()                                    // 24:00 = 00:00 do dia seguinte
  : dia.set({ hour: Math.floor(min / 60), minute: min % 60, second: 0, millisecond: 0 }).toMillis(); // hora de parede (DST-safe)
function janelasDoDia(dia: DateTime, d: Array<Array<[number, number]>>, cal: CalendarioSla): Array<[number, number]> {
  if (cal.feriados.has(dia.toFormat('yyyy-MM-dd')) || cal.feriadosRecorrentes.has(dia.toFormat('MM-dd'))) return [];
  return d[dia.weekday % 7].map(([i, f]) => [instante(dia, i), instante(dia, f)]);   // luxon 1=seg…7=dom → 0=dom
}

export function msUteisEntre(inicio: Date, fim: Date, cal: CalendarioSla): number {
  const a = inicio.getTime(), b = fim.getTime();
  if (!(b > a)) return 0;
  if (cal.ininterrupta) return b - a;
  const d = porDia(cal); let total = 0;
  let dia = DateTime.fromMillis(a, { zone: cal.timezone }).startOf('day');
  for (let i = 0; dia.toMillis() < b; i++, dia = dia.plus({ days: 1 })) {
    if (i > LIMITE_DIAS * 10) throw new ErroCalendarioSla('intervalo longo demais');
    for (const [ji, jf] of janelasDoDia(dia, d, cal)) { const x = Math.max(ji, a), y = Math.min(jf, b); if (y > x) total += y - x; }
  }
  return total;
}

export function adicionarMsUteis(inicio: Date, ms: number, cal: CalendarioSla): Date {
  if (!Number.isFinite(ms) || ms < 0) throw new ErroCalendarioSla('duração inválida');
  if (ms === 0) return new Date(inicio.getTime());
  if (cal.ininterrupta) return new Date(inicio.getTime() + ms);
  const d = porDia(cal), a = inicio.getTime(); let restante = ms;
  let dia = DateTime.fromMillis(a, { zone: cal.timezone }).startOf('day');
  for (let i = 0; i < LIMITE_DIAS; i++, dia = dia.plus({ days: 1 })) {
    for (const [ji, jf] of janelasDoDia(dia, d, cal)) {
      const x = Math.max(ji, a); if (x >= jf) continue;
      if (restante <= jf - x) return new Date(x + restante);   // pode terminar exatamente no fim da janela
      restante -= jf - x;
    }
  }
  throw new ErroCalendarioSla('prazo além de 3660 dias');
}
export const minutosUteisEntre = (i: Date, f: Date, c: CalendarioSla) => Math.floor(msUteisEntre(i, f, c) / 60_000);
export const adicionarMinutosUteis = (i: Date, min: number, c: CalendarioSla) => adicionarMsUteis(i, Math.round(min * 60_000), c);
export const adicionarHorasUteis = (i: Date, h: number, c: CalendarioSla) => adicionarMsUteis(i, Math.round(h * 3_600_000), c);
```
Ao carregar feriados do Prisma (`@db.Date`), a data vem como meia-noite UTC. Use `toISOString().slice(0,10)` para `'yyyy-MM-dd'` e `.slice(5,10)` para `'MM-dd'` dos recorrentes. Nunca use os getters locais.

### 6.3 Recalculo — `apps/api/src/modules/sla/recalculo.ts`
```ts
export type IntervaloPausa = { inicio: Date; fim: Date | null };   // fim null = pausa em curso
export type EntradaSla = { abertoEm: Date; slaRespostaMin: number | null; slaSolucaoMin: number | null;
  primeiraRespostaEm: Date | null; resolvidoEm: Date | null; pausas: IntervaloPausa[] };
export type ResultadoSla = { prazoRespostaEm: Date | null; prazoSolucaoEm: Date | null; slaPausadoSeg: number;
  slaRespostaCumprido: boolean | null; slaSolucaoCumprido: boolean | null };

export function recalcularSla(e: EntradaSla, cal: CalendarioSla): ResultadoSla {
  const prazoRespostaEm = e.slaRespostaMin ? adicionarMinutosUteis(e.abertoEm, e.slaRespostaMin, cal) : null;
  const slaRespostaCumprido = prazoRespostaEm && e.primeiraRespostaEm ? e.primeiraRespostaEm.getTime() <= prazoRespostaEm.getTime() : null;
  let pausadoMs = 0; let atual: IntervaloPausa | null = null;
  const teto = e.resolvidoEm?.getTime() ?? Infinity;
  for (const p of e.pausas) {
    if (p.fim === null) { atual = p; continue; }
    const ini = new Date(Math.max(p.inicio.getTime(), e.abertoEm.getTime()));
    const fim = new Date(Math.min(p.fim.getTime(), teto));
    pausadoMs += msUteisEntre(ini, fim, cal);
  }
  const slaPausadoSeg = Math.floor(pausadoMs / 1000);
  const base = { prazoRespostaEm, slaPausadoSeg, slaRespostaCumprido };
  if (!e.slaSolucaoMin) return { ...base, prazoSolucaoEm: null, slaSolucaoCumprido: null };
  const prazo = adicionarMsUteis(e.abertoEm, e.slaSolucaoMin * 60_000 + pausadoMs, cal);
  if (e.resolvidoEm) return { ...base, prazoSolucaoEm: prazo, slaSolucaoCumprido: e.resolvidoEm.getTime() <= prazo.getTime() };
  if (atual && atual.inicio.getTime() <= prazo.getTime()) return { ...base, prazoSolucaoEm: null, slaSolucaoCumprido: null }; // parado antes de estourar
  return { ...base, prazoSolucaoEm: prazo, slaSolucaoCumprido: null };   // correndo, ou pausado depois de estourar (continua estourado)
}
```
**Por que o modelo é correto:** o prazo é `adicionar(abertoEm, SLA + pausas)`. Isso equivale a dizer que o tempo útil corrido sem pausas ultrapassa o SLA. Uma pausa depois do estouro nunca "desestoura" o chamado.

**Entrada das pausas:** as linhas de `chamado_status_historico` com `pausa_sla = true`, ordenadas por `inicio_em`, mais `{ inicio: status_desde, fim: null }` quando `chamados.sla_pausado = true`.

**Situação para a UI** (`packages/shared/src/sla.ts`, sem luxon): `situacaoSolucao(c, agora, alertaMin)` retorna:
- `sem_sla`, se não há SLA de solução;
- se resolvido: `cumprido` ou `violado`;
- se `prazo` é null: `pausado`;
- se `prazo < agora`: `estourado`;
- se faltam no máximo `alertaMin`: `em_risco`;
- senão: `no_prazo`.

"Estourado" nunca é gravado para chamado aberto; é sempre `prazo < now()`.

### 6.4 Transição de status (service, numa transação) e quando recalcular
`aplicarTransicaoStatus(tx, chamadoId, novoStatusId, atorId, agora)`:
1. Ler o chamado (pegar `versao`) e o novo status. Se for o mesmo status, não faz nada.
2. Inserir no histórico `{ statusId/statusTipo/pausaSla do atual = chamado.slaPausado, inicioEm: statusDesde, fimEm: agora }`.
3. Ajustar as datas conforme o tipo novo:
   - `resolvido` ou `encerrado`: `resolvidoEm ??= agora`.
   - `encerrado`: `fechadoEm ??= agora`.
   - `aberto`, `andamento` ou `pendente`: zerar `resolvidoEm`, `fechadoEm` e `aceiteLimiteEm` (reabertura).
   - `resolvido`: `aceiteLimiteEm = agora + aceite_dias`.
   - Se o codigo do novo status não for `agendado`: `agendadoPara = null`.
4. Executar `updateMany({ where: { id, versao } })` com `statusId`, `statusTipo`, `statusDesde = agora`, `slaPausado = novo.pausaSla`, as datas e `versao + 1`. Se `count === 0`, conflito (409).
5. Rodar `recalcularSla` e gravar os campos de SLA. Se o prazo mudou, zerar `slaAvisoEm` / `slaEstouroAvisoEm`.

**Quando recalcular:**
1. **Na abertura:** gravar snapshot dos minutos e da jornada, e `statusDesde = abertoEm`.
2. **Em toda transição de status:** assumir, agendar, resolver, encerrar, reabrir, aceite/rejeição, auto-encerramento, liberação de agendado.
3. **Na primeira resposta.**
4. **Na troca de problema ou prioridade** (novo snapshot de minutos) **ou de área** (nova jornada). O recálculo usa o histórico completo.
5. **Ao editar jornada, horários ou feriados:** job pg-boss `sla.recalcular-jornada {jornadaId}` sobre `resolvido_em IS NULL AND jornada_id = $j`, em lotes de 200. Chamados já resolvidos não mudam.
6. **Job `sla.alertas` a cada 5 min:** "prestes a vencer" (prazo dentro de `sla.alerta_min` e `sla_aviso_em` null) e "estourado" (`prazo < now()` e `sla_estouro_aviso_em` null).
7. **Jobs `chamado.auto-encerrar` e `chamado.liberar-agendados`**, ambos chamando `aplicarTransicaoStatus`.

**Cache do calendário:** em memória por `jornadaId`, com TTL de 60 s, invalidado na edição.

### 6.5 Casos de teste (vitest)

**Configuração dos testes:**
- Fuso `America/Sao_Paulo` (UTC−3, sem horário de verão).
- Jornada "Comercial": seg–sex `[480,720]` e `[780,1080]`, sem feriados, salvo quando o caso indica.
- Rodar a suíte duas vezes: `TZ=UTC` e `TZ=Asia/Tokyo`. Os resultados têm de ser idênticos.

| # | Cenário | Entrada | Esperado |
|---|---|---|---|
| 1 | 24x7 | add(2026-10-23T20:00Z, 240 min) | 2026-10-24T00:00Z |
| 2 | Sexta 17h + 2h | add(2026-10-23T20:00Z, 120) | 2026-10-26T12:00Z (seg 09:00) |
| 3 | Sábado | add(2026-10-24T13:00Z, 60) | 2026-10-26T12:00Z |
| 4 | Antes do expediente | add(2026-10-26T09:00Z, 30) | 2026-10-26T11:30Z |
| 5 | Almoço | add(2026-10-26T14:30Z [11:30], 60) | 2026-10-26T16:30Z [13:30] |
| 6 | Termina no fim da janela | add(2026-10-26T20:00Z [17:00], 60) | 2026-10-26T21:00Z (18:00, não terça 08:00) |
| 7 | Feriado não recorrente 2026-11-02 | add(2026-10-30T20:00Z, 120) | 2026-11-03T12:00Z |
| 8 | Feriado recorrente '12-25' | add(2026-12-24T20:00Z, 120) | 2026-12-28T12:00Z |
| 9 | Minutos entre | entre(2026-10-23T20:00Z, 2026-10-26T12:00Z) | 120 |
| 10 | Intervalo invertido ou vazio | fim ≤ início | 0 |
| 11 | Zero minutos | add(sáb 2026-10-24T13:00Z, 0) | o próprio início |
| 12 | Propriedade (fast-check) | início aleatório em 2026, m ∈ [1, 20000] | `entre(i, add(i,m)) === m` |
| 13 | Turno noturno: seg `[1320,1440]` + ter `[0,360]` | add(2026-10-27T02:00Z [seg 23:00], 180) | 2026-10-27T05:00Z [ter 02:00] |
| 14 | DST America/New_York, todos os dias `[0,1440]` não ininterrupta | ms(2026-03-08T05:00Z, 2026-03-09T04:00Z) e ms(2026-11-01T04:00Z, 2026-11-02T05:00Z) | 23 h e 25 h |
| 15 | Milissegundos | add(2026-10-26T11:00:30.500Z, 1) | 2026-10-26T11:01:30.500Z |
| 16 | Jornada sem horários (não ininterrupta) | qualquer chamada | `ErroCalendarioSla` |
| 17 | Janelas sobrepostas ou fim ≤ início | validação | `ErroCalendarioSla` |
| 18 | SLA longo: 16 200 min a partir de 2026-10-26T11:00Z | — | 2026-12-04T21:00Z, em menos de 50 ms |
| 19 | Pausa no expediente | aberto 2026-10-26T11:00Z, SLA 240, pausa 12:00Z–13:00Z | prazo 2026-10-26T17:00Z, pausadoSeg 3600 (sem pausa: 15:00Z) |
| 20 | Pausa fora do expediente | aberto 2026-10-23T19:00Z, SLA 240, pausa sáb 13:00Z → dom 13:00Z | prazo 2026-10-26T13:00Z, pausadoSeg 0 |
| 21a | Pausa em curso antes do prazo | aberto 11:00Z, SLA 240, pausa em curso desde 2026-10-26T12:00Z | prazoSolucaoEm null |
| 21b | Pausa em curso depois do prazo | pausa em curso desde 2026-10-26T16:30Z | prazo 2026-10-26T15:00Z (estourado) |
| 22 | Resolução | resolvido 14:00Z → cumprido true; 16:30Z → false | — |
| 22b | Reaberto | pausa (resolvido→reaberto) 14:00Z–17:00Z, resolvidoEm null | prazo 2026-10-26T18:00Z |
| 23 | Pausa após estouro não desestoura (24x7) | aberto 11:00Z, SLA 60, pausa 13:00Z–14:00Z, resolvido 14:30Z | prazo 13:00Z, cumprido false |
| 24 | Resposta | aberto 2026-10-26T11:00Z, SLA de resposta 60 | resposta 11:59Z → true; 12:01Z → false; sem resposta → null |
| 25 | 24x7 ignora feriados | feriado na data e ininterrupta | aritmética pura |
| 26 | `situacaoSolucao` | prazo null / passado / faltando ≤ 30 min / resolvido | pausado / estourado / em_risco / cumprido ou violado |
| 27 | Integração de transição | aberto → pendente (pausa) → andamento → resolvido → reaberto | linhas de histórico e prazos batem com `recalcularSla` |

---

## 7. Tarefas para Haiku (cada uma com verificação objetiva)

| # | Tarefa | Verificação |
|---|---|---|
| DB-01 | Instalar `prisma@7.10.1`, `@prisma/client@7.10.1`, `@prisma/adapter-pg@7.10.1`, `pg`, `dotenv` em apps/api (versões exatas) | `pnpm --filter api exec prisma --version` mostra 7.10.1 |
| DB-02 | Criar `prisma.config.ts` e `schema.prisma` (seção 1) | `prisma validate` OK; se falhar, aplicar o fallback indicado na seção 1 |
| DB-03 | `migrate dev --create-only --name init`; colar os blocos A e B; `migrate dev`; `prisma generate` | `migrate dev` de novo responde "Already in sync"; `SELECT public.f_unaccent('Ação')` = `Acao`; `\dx` lista pg_trgm e unaccent |
| DB-04 | Teste de integração de CHECKs e FK composta (vitest + banco de teste) | Inserções inválidas falham com o nome do `ck_*` esperado; mudar o `status.tipo` em uso de andamento para encerrado falha |
| DB-05 | Teste de triggers de busca | INSERT de chamado com "Impressão" é encontrado por `to_tsquery('portuguese','impressao:*')`; usuário "João" encontrado por `busca_norm LIKE '%joao%'` |
| DB-06 | `EXPLAIN` das consultas 5, 9, 11, 24, 26 e 28 com 10 mil chamados de fixture | O plano usa o índice listado na seção 3 |
| SH-01 | `packages/shared`: `permissoes.ts`, `config.ts` (registro Zod), `sla.ts` (`situacaoSolucao`) | Testes unitários |
| SEED-01 | `seed.ts` (seção 4) | Em banco vazio: imprime senha, `admin.trocar_senha = true`, 6 status com codigo; segunda execução não duplica nada (contagens iguais) |
| SLA-01 | `calendario.ts` + testes 1–18 | `TZ=UTC vitest` e `TZ=Asia/Tokyo vitest` verdes |
| SLA-02 | `recalculo.ts` + testes 19–25 | verde |
| SLA-03 | `sla.service.ts` (carregar calendário, `aplicarTransicaoStatus`, recalcular chamado) + teste 27 | verde |
| SLA-04 | Jobs pg-boss: alertas, recalcular-jornada, auto-encerrar, liberar-agendados | Testes com relógio injetado |
| MIG-01 | `ler-sqlite.ts` + `validar.ts` (puros) | Fixture SQLite criada no teste com o DDL do `db.js` + linhas inválidas → erros e avisos esperados |
| MIG-02 | `transformar.ts` (puro, tabela 5.1 + 5.3) | Snapshots campo a campo das fixtures |
| MIG-03 | `arquivos.ts` | Mesmo BLOB duas vezes → 1 arquivo; sha confere; dry-run não cria arquivo |
| MIG-04 | `gravar.ts` + CLI (transação, sequences, desnormalizados, marcador, dry-run) | Fixture: contagens iguais ao SQLite; `last_value = max+1` e `is_called = false`; segunda execução insere 0; dry-run deixa o banco vazio |
| MIG-05 | Login com hash legado → rehash para argon2id | Teste: senha da fixture loga e o algoritmo vira argon2id |
| MIG-06 | Executar em `data/VINIMON.db` com `--dry-run` e depois de verdade; remover `data/*.db*` do git e adicionar ao `.gitignore` | Relatório sem erros; `git ls-files data` vazio |

---

## 8. Riscos e pontos não verificados

- **GIN sem `ops` em campo `Unsupported("tsvector")`:** não confirmado no validador. Fallback: `tsvector_ops`.
- **Forma do predicado parcial na detecção de drift:** não confirmada. Fallback: copiar a saída de `db pull --print`.
- **FK composta com coluna enum:** não testada. Fallback na regra (d) da seção 1.
- **Prisma ignorar CHECK, trigger, função e extensão (sem o preview `postgresqlExtensions`):** alta confiança; a DB-03 confirma.
- **Drift de coluna gerada no Prisma:** não verificado. É o motivo da escolha por triggers.
- **Tabelas do pg-boss:** ficam no schema `pgboss`, que o Prisma ignora, porque ele só olha `public`.
- **`node:sqlite`:** sem flag a partir do Node 22.13 (ainda com ExperimentalWarning); estável no 24.
