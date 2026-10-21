> Parte A (fundamentos), §4. Decisão fechada: não reabrir. Índice e regras de leitura em `docs/plano/README.md`.

## 4. Modelo de dados

### 4.1 Regras do modelo

- **Ids:** `Int` autoincrement, preservados da v1, exceto `Sessao.id` (uuid v7) e `Anexo.id` (uuid gerado pela aplicação, que também é a chave do arquivo; anexos importados da v1 usam o uuid determinístico `uuidLegado(id)` da §4.5).
- **"Em aberto"** é sempre `concluidoEm: null`, para usar os índices parciais. Nunca filtrar por `statusTipo: { in: [...] }` para isso.
- **Status do chamado:** `chamados.status_tipo` fica preso a `status.tipo` pela FK composta `(status_id, status_tipo)`. A API recusa mudar o `tipo` de um status em uso (422).
- **FKs:** gravadas por campo escalar (`statusId`, `statusTipo`), nunca com `connect`.
- **SQL manual na migração:** CHECKs, triggers, funções e extensões. Índices são **sempre** declarados no Prisma, porque índice criado à mão seria removido na migração seguinte.
- **Busca:** colunas `busca`/`busca_norm` mantidas por trigger. A aplicação nunca escreve nelas (e elas ficam em `omit` global).
- **Sem soft-delete:**
  - cadastros usam `ativo`;
  - usuários nunca são excluídos (`ativo=false` ou `anonimizadoEm`);
  - chamados nunca são excluídos;
  - comentários são imutáveis (única exceção: a anonimização da T-3.12 reescreve, no texto dos assentamentos, os tokens `@[Nome](usuario:ID)` do usuário anonimizado);
  - sessões são revogadas.

### 4.2 `apps/api/prisma/schema.prisma` (completo)

**Ações referenciais:** nenhuma relação sem `onDelete` explícito. Em relação opcional, o padrão do Prisma é `onDelete: SetNull`; por isso toda relação opcional cuja exclusão do pai deve dar 409 `REGISTRO_EM_USO` (P2003) declara `onDelete: Restrict` explicitamente — no mínimo `Usuario.area`, `Usuario.departamento`, `Area.jornada`, as FKs opcionais de `Chamado` (`operador`, `problema`, `departamento`, `ativo`) e `Ativo.departamento`. Só o lado da lista (`Chamado[]` etc.) fica sem `onDelete`.

```prisma
// apps/api/prisma/schema.prisma — Prisma ORM 7.10.1 (versão exata).
// URL do banco: prisma.config.ts. Model/campo pt-BR camelCase; tabela/coluna snake_case;
// datas @db.Timestamptz(3); enums UPPER_SNAKE. busca/busca_norm são mantidas por TRIGGER.
// Toda @relation com fields declara onDelete explícito (em relação opcional o padrão do Prisma é SetNull).

generator client {
  provider        = "prisma-client"
  output          = "../src/generated/prisma"
  moduleFormat    = "esm"
  previewFeatures = ["partialIndexes"]
}

datasource db {
  provider = "postgresql"
}

// ═════════════════════════════ ENUMS ═════════════════════════════

enum Perfil {
  ADMIN
  OPERADOR
  USUARIO

  @@map("perfil")
}

enum EstadoSessao {
  PENDENTE_MFA
  CADASTRO_MFA
  TROCA_SENHA
  ATIVA

  @@map("estado_sessao")
}

enum Tema {
  CLARO
  ESCURO
  SISTEMA

  @@map("tema")
}

enum Densidade {
  CONFORTAVEL
  COMPACTA

  @@map("densidade")
}

enum AtorAuditoria {
  USUARIO
  TOKEN
  SISTEMA

  @@map("ator_auditoria")
}

enum PresencaManual {
  OCUPADO
  AUSENTE

  @@map("presenca_manual")
}

enum TipoStatus {
  ABERTO
  EM_ATENDIMENTO
  PENDENTE
  AGENDADO
  CONCLUIDO
  ENCERRADO

  @@map("tipo_status")
}

/// Papel de sistema do status: destino das ações (no máximo um status por papel)
enum PapelStatus {
  INICIAL
  EM_ATENDIMENTO
  ENCAMINHADO
  AGUARDANDO_SOLICITANTE
  AGENDADO
  CONCLUIDO
  ENCERRADO
  CANCELADO

  @@map("papel_status")
}

enum TipoAssentamento {
  COMENTARIO
  SISTEMA

  @@map("tipo_assentamento")
}

enum TipoEvento {
  CRIADO
  COMENTARIO
  ASSUMIDO
  ENCAMINHADO
  STATUS_ALTERADO
  PRIORIDADE_ALTERADA
  CLASSIFICACAO_ALTERADA
  TAGS_ALTERADAS
  AGENDADO
  RETORNO_AGENDAMENTO
  CONCLUIDO
  APROVADO
  REJEITADO
  AUTO_APROVADO
  REABERTO
  CANCELADO
  ANEXO_ADICIONADO
  ANEXO_REMOVIDO
  SLA_RISCO
  SLA_ESTOURADO
  SLA_RESPOSTA_ESTOURADO

  @@map("tipo_evento")
}

enum TipoNotificacao {
  MENCAO
  ATRIBUIDO
  NOVO_NA_FILA
  COMENTARIO
  STATUS
  ATUALIZACAO
  SLA
  AVALIACAO_PENDENTE
  AVALIACAO_RECEBIDA
  REJEITADO

  @@map("tipo_notificacao")
}

enum MotivoSeguir {
  SOLICITANTE
  ABRIU
  ATRIBUIDO
  COMENTOU
  MENCIONADO
  MANUAL

  @@map("motivo_seguir")
}

enum NotaAvaliacao {
  OTIMO
  BOM
  REGULAR
  RUIM

  @@map("nota_avaliacao")
}

enum SituacaoAtivo {
  EM_USO
  EM_ESTOQUE
  EM_MANUTENCAO
  BAIXADO

  @@map("situacao_ativo")
}

enum SituacaoArtigo {
  RASCUNHO
  PUBLICADO
  ARQUIVADO

  @@map("situacao_artigo")
}

enum VisibilidadeArtigo {
  PUBLICO
  INTERNO

  @@map("visibilidade_artigo")
}

// ═════════════════════════ ORGANIZAÇÃO ═════════════════════════

model Unidade {
  id           Int      @id @default(autoincrement())
  nome         String   @unique @db.VarChar(120)
  endereco     String?  @db.VarChar(300)
  ativo        Boolean  @default(true)
  criadoEm     DateTime @default(now()) @map("criado_em") @db.Timestamptz(3)
  atualizadoEm DateTime @default(now()) @updatedAt @map("atualizado_em") @db.Timestamptz(3)

  departamentos Departamento[]

  @@map("unidades")
}

/// Departamento/setor (antigo "locais"). IDs da v1 preservados
model Departamento {
  id           Int      @id @default(autoincrement())
  unidadeId    Int      @map("unidade_id")
  nome         String   @db.VarChar(120)
  ativo        Boolean  @default(true)
  criadoEm     DateTime @default(now()) @map("criado_em") @db.Timestamptz(3)
  atualizadoEm DateTime @default(now()) @updatedAt @map("atualizado_em") @db.Timestamptz(3)

  unidade  Unidade   @relation(fields: [unidadeId], references: [id], onDelete: Restrict)
  usuarios Usuario[]
  chamados Chamado[]
  ativos   Ativo[]

  @@unique([unidadeId, nome])
  @@map("departamentos")
}

/// Área (fila de atendimento quando atende = true). IDs da v1 preservados
model Area {
  id           Int      @id @default(autoincrement())
  nome         String   @unique @db.VarChar(120)
  atende       Boolean  @default(true)
  /// jornada de SLA (null = config sla.jornadaPadraoId)
  jornadaId    Int?     @map("jornada_id")
  ativo        Boolean  @default(true)
  criadoEm     DateTime @default(now()) @map("criado_em") @db.Timestamptz(3)
  atualizadoEm DateTime @default(now()) @updatedAt @map("atualizado_em") @db.Timestamptz(3)

  jornada             Jornada?      @relation(fields: [jornadaId], references: [id], onDelete: Restrict)
  usuarios            Usuario[]
  usuariosSecundarios UsuarioArea[]
  problemas           ProblemaArea[]
  problemasPadrao     Problema[]
  chamados            Chamado[]

  @@index([jornadaId], map: "ix_areas_jornada")
  @@map("areas")
}

// ═════════════════════════ ACESSO ═════════════════════════

model Usuario {
  id                    Int        @id @default(autoincrement())
  /// minúsculo, ^[a-z0-9._@-]{3,64}$ (CHECK)
  login                 String     @unique @db.VarChar(64)
  nome                  String     @db.VarChar(120)
  /// minúsculo (CHECK)
  email                 String?    @unique @db.VarChar(254)
  telefone              String?    @db.VarChar(30)
  /// argon2id (PHC) ou legado scrypt "salt:hash"; null = login impossível até redefinição
  senhaHash             String?    @map("senha_hash") @db.VarChar(255)
  deveTrocarSenha       Boolean    @default(false) @map("deve_trocar_senha")
  senhaAlteradaEm       DateTime?  @map("senha_alterada_em") @db.Timestamptz(3)
  perfil                Perfil     @default(USUARIO)
  /// área primária (obrigatória para OPERADOR — CHECK)
  areaId                Int?       @map("area_id")
  departamentoId        Int?       @map("departamento_id")
  ativo                 Boolean    @default(true)
  /// "v1:<iv b64>:<tag b64>:<ct b64>" — AES-256-GCM com ENCRYPTION_KEY
  totpSecretEnc         String?    @map("totp_secret_enc") @db.VarChar(255)
  totpSecretPendenteEnc String?    @map("totp_secret_pendente_enc") @db.VarChar(255)
  /// último time-step aceito (anti-replay)
  totpUltimoPasso       Int?       @map("totp_ultimo_passo")
  mfaAtivadoEm          DateTime?  @map("mfa_ativado_em") @db.Timestamptz(3)
  ultimoLoginEm         DateTime?  @map("ultimo_login_em") @db.Timestamptz(3)
  anonimizadoEm         DateTime?  @map("anonimizado_em") @db.Timestamptz(3)
  tema                  Tema       @default(SISTEMA)
  /// null = padrão do perfil (COMPACTA para equipe, CONFORTAVEL para USUARIO)
  densidade             Densidade?
  enviarComEnter        Boolean    @default(true) @map("enviar_com_enter")
  criadoEm              DateTime   @default(now()) @map("criado_em") @db.Timestamptz(3)
  atualizadoEm          DateTime   @default(now()) @updatedAt @map("atualizado_em") @db.Timestamptz(3)
  /// trigger: lower(f_unaccent(nome login email))
  buscaNorm             String?    @map("busca_norm") @db.Text

  area         Area?         @relation(fields: [areaId], references: [id], onDelete: Restrict)
  departamento Departamento? @relation(fields: [departamentoId], references: [id], onDelete: Restrict)

  areasSecundarias        UsuarioArea[]
  sessoes                 Sessao[]
  codigosRecuperacao      CodigoRecuperacao[]
  auditorias              Auditoria[]
  presenca                PresencaUsuario?
  preferenciasNotificacao PreferenciaNotificacao[]
  chamadosSolicitados     Chamado[]                @relation("ChamadoSolicitante")
  chamadosRegistrados     Chamado[]                @relation("ChamadoAbertoPor")
  chamadosAtendidos       Chamado[]                @relation("ChamadoOperador")
  estagiosComoOperador    ChamadoEstagio[]         @relation("EstagioOperador")
  estagiosAlterados       ChamadoEstagio[]         @relation("EstagioAutor")
  eventos                 ChamadoEvento[]
  assentamentos           Assentamento[]
  mencoes                 Mencao[]
  seguindo                ChamadoSeguidor[]
  leituras                ChamadoLeitura[]
  anexosEnviados          Anexo[]
  avaliacoes              AvaliacaoChamado[]
  notificacoes            Notificacao[]
  ativosResponsavel       Ativo[]
  artigos                 Artigo[]
  votosArtigo             ArtigoVoto[]

  @@index([areaId], map: "ix_usuarios_area")
  @@index([departamentoId], map: "ix_usuarios_departamento")
  @@index([buscaNorm(ops: raw("gin_trgm_ops"))], type: Gin, map: "ix_usuarios_busca_norm_trgm")
  @@map("usuarios")
}

/// Áreas secundárias do usuário (entram em areaIds do escopo)
model UsuarioArea {
  usuarioId Int @map("usuario_id")
  areaId    Int @map("area_id")

  usuario Usuario @relation(fields: [usuarioId], references: [id], onDelete: Cascade)
  area    Area    @relation(fields: [areaId], references: [id], onDelete: Cascade)

  @@id([usuarioId, areaId])
  @@index([areaId], map: "ix_usuario_areas_area")
  @@map("usuario_areas")
}

/// Sessão web/socket. O cookie leva o token; o banco guarda só sha256(token) em hex
model Sessao {
  id              String       @id @default(uuid(7)) @db.Uuid
  usuarioId       Int          @map("usuario_id")
  tokenHash       String       @unique @map("token_hash") @db.Char(64)
  estado          EstadoSessao
  /// falhas de TOTP nesta sessão pendente (5 = revoga)
  falhasMfa       Int          @default(0) @map("falhas_mfa") @db.SmallInt
  criadaEm        DateTime     @default(now()) @map("criada_em") @db.Timestamptz(3)
  /// atualizado no máximo 1x/60 s; o heartbeat do socket não atualiza
  ultimoUsoEm     DateTime     @default(now()) @map("ultimo_uso_em") @db.Timestamptz(3)
  /// expiração absoluta
  expiraEm        DateTime     @map("expira_em") @db.Timestamptz(3)
  revogadaEm      DateTime?    @map("revogada_em") @db.Timestamptz(3)
  motivoRevogacao String?      @map("motivo_revogacao") @db.VarChar(40)
  ip              String?      @db.VarChar(45)
  userAgent       String?      @map("user_agent") @db.VarChar(256)

  usuario Usuario @relation(fields: [usuarioId], references: [id], onDelete: Cascade)

  @@index([usuarioId], map: "ix_sessoes_usuario_ativas", where: raw("revogada_em IS NULL"))
  @@index([expiraEm], map: "ix_sessoes_expira_em")
  @@map("sessoes")
}

/// Falhas de login (bloqueio persistido; expurgo > 24 h)
model FalhaLogin {
  id               Int      @id @default(autoincrement())
  loginNormalizado String   @map("login_normalizado") @db.VarChar(64)
  ip               String   @db.VarChar(45)
  criadoEm         DateTime @default(now()) @map("criado_em") @db.Timestamptz(3)

  @@index([loginNormalizado, criadoEm], map: "ix_falhas_login_login")
  @@index([ip, criadoEm], map: "ix_falhas_login_ip")
  @@map("falhas_login")
}

/// Códigos de recuperação do 2FA (sha256 hex; uso único)
model CodigoRecuperacao {
  id         Int       @id @default(autoincrement())
  usuarioId  Int       @map("usuario_id")
  codigoHash String    @map("codigo_hash") @db.Char(64)
  usadoEm    DateTime? @map("usado_em") @db.Timestamptz(3)
  criadoEm   DateTime  @default(now()) @map("criado_em") @db.Timestamptz(3)

  usuario Usuario @relation(fields: [usuarioId], references: [id], onDelete: Cascade)

  @@index([usuarioId], map: "ix_codigos_recuperacao_usuario")
  @@map("codigos_recuperacao")
}

/// Trilha de auditoria — somente inserção (trigger)
model Auditoria {
  id         Int           @id @default(autoincrement())
  criadoEm   DateTime      @default(now()) @map("criado_em") @db.Timestamptz(3)
  atorTipo   AtorAuditoria @map("ator_tipo")
  atorId     Int?          @map("ator_id")
  /// ex.: login.sucesso, cadastro.criado, usuario.alterado, config.alterada
  acao       String        @db.VarChar(60)
  entidade   String        @db.VarChar(60)
  entidadeId String?       @map("entidade_id") @db.VarChar(40)
  ip         String?       @db.VarChar(45)
  userAgent  String?       @map("user_agent") @db.VarChar(256)
  requestId  String?       @map("request_id") @db.VarChar(64)
  /// { antes?, depois?, ... } sem segredos
  dados      Json?

  ator Usuario? @relation(fields: [atorId], references: [id], onDelete: Restrict)

  @@index([criadoEm], type: Brin, map: "ix_auditoria_criado_em_brin")
  @@index([entidade, entidadeId], map: "ix_auditoria_entidade")
  @@index([atorId, criadoEm(sort: Desc)], map: "ix_auditoria_ator")
  @@map("auditoria")
}

/// Presença manual e "visto por último" (conexões ficam só em memória)
model PresencaUsuario {
  usuarioId     Int             @id @map("usuario_id")
  estadoManual  PresencaManual? @map("estado_manual")
  manualAte     DateTime?       @map("manual_ate") @db.Timestamptz(3)
  ultimoVistoEm DateTime?       @map("ultimo_visto_em") @db.Timestamptz(3)
  atualizadoEm  DateTime        @default(now()) @updatedAt @map("atualizado_em") @db.Timestamptz(3)

  usuario Usuario @relation(fields: [usuarioId], references: [id], onDelete: Cascade)

  @@map("presencas_usuarios")
}

/// Preferência por tipo (linha ausente = padrão do código). Coluna e-mail entra na Fase 2
model PreferenciaNotificacao {
  usuarioId Int             @map("usuario_id")
  tipo      TipoNotificacao
  inApp     Boolean         @map("in_app")
  desktop   Boolean

  usuario Usuario @relation(fields: [usuarioId], references: [id], onDelete: Cascade)

  @@id([usuarioId, tipo])
  @@map("preferencias_notificacao")
}

// ═════════════════════════ CATÁLOGOS ═════════════════════════

model Prioridade {
  id             Int     @id @default(autoincrement())
  nome           String  @unique @db.VarChar(60)
  /// cor base; o front deriva texto/fundo com contraste AA
  cor            String  @default("#888888") @db.Char(7)
  ordem          Int     @default(0)
  /// exatamente uma padrão (garantido pelo service em transação)
  padrao         Boolean @default(false)
  slaRespostaMin Int?    @map("sla_resposta_min")
  slaSolucaoMin  Int?    @map("sla_solucao_min")
  ativo          Boolean @default(true)

  chamados Chamado[]

  @@map("prioridades")
}

model Status {
  id       Int          @id @default(autoincrement())
  nome     String       @unique @db.VarChar(60)
  tipo     TipoStatus   @default(EM_ATENDIMENTO)
  papel    PapelStatus? @unique
  cor      String       @default("#888888") @db.Char(7)
  /// para o relógio do SLA de solução (obrigatório em CONCLUIDO/ENCERRADO — CHECK)
  pausaSla Boolean      @default(false) @map("pausa_sla")
  /// some de listas/painel/relatórios/busca (C02)
  ignorado Boolean      @default(false)
  ordem    Int          @default(0)
  ativo    Boolean      @default(true)

  chamados Chamado[]
  estagios ChamadoEstagio[]

  @@unique([id, tipo], map: "uq_status_id_tipo")
  @@map("status")
}

/// Tipo de problema (abertura dinâmica: define áreas possíveis e SLA). IDs da v1 preservados
model Problema {
  id             Int     @id @default(autoincrement())
  nome           String  @unique @db.VarChar(120)
  descricao      String? @db.VarChar(500)
  /// precisa estar entre as áreas do problema (service)
  areaPadraoId   Int?    @map("area_padrao_id")
  slaRespostaMin Int?    @map("sla_resposta_min")
  slaSolucaoMin  Int?    @map("sla_solucao_min")
  ativo          Boolean @default(true)

  areaPadrao Area?            @relation(fields: [areaPadraoId], references: [id], onDelete: Restrict)
  areas      ProblemaArea[]
  chamados   Chamado[]
  artigos    ArtigoProblema[]

  @@index([areaPadraoId], map: "ix_problemas_area_padrao")
  @@map("problemas")
}

model ProblemaArea {
  problemaId Int @map("problema_id")
  areaId     Int @map("area_id")

  problema Problema @relation(fields: [problemaId], references: [id], onDelete: Cascade)
  area     Area     @relation(fields: [areaId], references: [id], onDelete: Restrict)

  @@id([problemaId, areaId])
  @@index([areaId], map: "ix_problema_areas_area")
  @@map("problema_areas")
}

model Canal {
  id      Int     @id @default(autoincrement())
  nome    String  @unique @db.VarChar(60)
  /// canais de sistema não podem ser excluídos
  sistema Boolean @default(false)
  ativo   Boolean @default(true)

  chamados Chamado[]

  @@map("canais")
}

model Tag {
  id              Int      @id @default(autoincrement())
  nome            String   @db.VarChar(30)
  /// lower(btrim(nome)) — CHECK; unicidade sem distinção de maiúsculas
  nomeNormalizado String   @unique @map("nome_normalizado") @db.VarChar(30)
  ativo           Boolean  @default(true)
  criadoEm        DateTime @default(now()) @map("criado_em") @db.Timestamptz(3)

  chamados ChamadoTag[]

  @@map("tags")
}

// ═════════════════════════ SLA ═════════════════════════

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

/// Janela útil [inicio_min, fim_min) em hora local; várias por dia; sem atravessar meia-noite
model JornadaHorario {
  id        Int @id @default(autoincrement())
  jornadaId Int @map("jornada_id")
  /// 0=domingo … 6=sábado
  diaSemana Int @map("dia_semana") @db.SmallInt
  inicioMin Int @map("inicio_min") @db.SmallInt
  /// exclusivo; 1440 = 24:00
  fimMin    Int @map("fim_min") @db.SmallInt

  jornada Jornada @relation(fields: [jornadaId], references: [id], onDelete: Cascade)

  @@unique([jornadaId, diaSemana, inicioMin])
  @@map("jornada_horarios")
}

/// Feriado = sem expediente. recorrente usa dia/mês (convenção: ano 2000)
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

/// Chamado. Nunca excluído. IDs da v1 preservados
model Chamado {
  id                          Int        @id @default(autoincrement())
  assunto                     String     @db.VarChar(150)
  /// Markdown, ≤ 20.000 (CHECK)
  descricao                   String     @db.Text
  solucao                     String?    @db.Text
  descricaoTecnica            String?    @map("descricao_tecnica") @db.Text
  contato                     String?    @db.VarChar(120)
  contatoEmail                String?    @map("contato_email") @db.VarChar(254)
  telefone                    String?    @db.VarChar(30)
  solicitanteId               Int        @map("solicitante_id")
  /// quem registrou (≠ solicitante quando aberto "em nome de")
  abertoPorId                 Int        @map("aberto_por_id")
  operadorId                  Int?       @map("operador_id")
  areaId                      Int        @map("area_id")
  problemaId                  Int?       @map("problema_id")
  prioridadeId                Int        @map("prioridade_id")
  canalId                     Int        @map("canal_id")
  statusId                    Int        @map("status_id")
  /// cópia de status.tipo garantida pela FK composta
  statusTipo                  TipoStatus @map("status_tipo")
  /// início do status atual (vira ChamadoEstagio na próxima transição)
  statusDesde                 DateTime   @default(now()) @map("status_desde") @db.Timestamptz(3)
  departamentoId              Int?       @map("departamento_id")
  ativoId                     Int?       @map("ativo_id")
  abertoEm                    DateTime   @default(now()) @map("aberto_em") @db.Timestamptz(3)
  /// só com tipo AGENDADO (CHECK)
  agendadoPara                DateTime?  @map("agendado_para") @db.Timestamptz(3)
  primeiraRespostaEm          DateTime?  @map("primeira_resposta_em") @db.Timestamptz(3)
  /// solução registrada ou cancelamento; null = EM ABERTO
  concluidoEm                 DateTime?  @map("concluido_em") @db.Timestamptz(3)
  encerradoEm                 DateTime?  @map("encerrado_em") @db.Timestamptz(3)
  /// prazo da validação pelo solicitante (só tipo CONCLUIDO)
  validacaoLimiteEm           DateTime?  @map("validacao_limite_em") @db.Timestamptz(3)
  cancelado                   Boolean    @default(false)
  rejeicoes                   Int        @default(0)
  /// snapshot de SLA (abertura, troca de problema/prioridade/área)
  jornadaId                   Int        @map("jornada_id")
  slaRespostaMin              Int?       @map("sla_resposta_min")
  slaSolucaoMin               Int?       @map("sla_solucao_min")
  prazoRespostaEm             DateTime?  @map("prazo_resposta_em") @db.Timestamptz(3)
  alertaRespostaEm            DateTime?  @map("alerta_resposta_em") @db.Timestamptz(3)
  /// null com SLA definido = relógio parado
  prazoSolucaoEm              DateTime?  @map("prazo_solucao_em") @db.Timestamptz(3)
  alertaSolucaoEm             DateTime?  @map("alerta_solucao_em") @db.Timestamptz(3)
  slaPausado                  Boolean    @default(false) @map("sla_pausado")
  slaPausadoSeg               Int        @default(0) @map("sla_pausado_seg")
  slaRespostaCumprido         Boolean?   @map("sla_resposta_cumprido")
  slaSolucaoCumprido          Boolean?   @map("sla_solucao_cumprido")
  tempoRespostaUtilMin        Int?       @map("tempo_resposta_util_min")
  tempoSolucaoUtilMin         Int?       @map("tempo_solucao_util_min")
  slaAvisoRiscoEm             DateTime?  @map("sla_aviso_risco_em") @db.Timestamptz(3)
  slaAvisoEstouroEm           DateTime?  @map("sla_aviso_estouro_em") @db.Timestamptz(3)
  slaAvisoRespostaEm          DateTime?  @map("sla_aviso_resposta_em") @db.Timestamptz(3)
  /// desnormalizados sem FK (indicadores da lista e "não lido")
  ultimoAssentamentoId        Int?       @map("ultimo_assentamento_id")
  ultimoAssentamentoPublicoId Int?       @map("ultimo_assentamento_publico_id")
  ultimaInteracaoEm           DateTime?  @map("ultima_interacao_em") @db.Timestamptz(3)
  ultimaInteracaoAutorId      Int?       @map("ultima_interacao_autor_id")
  /// só muda em evento público (nota interna não altera: evita sinal lateral)
  ultimaAtividadeEm           DateTime   @default(now()) @map("ultima_atividade_em") @db.Timestamptz(3)
  /// lock otimista
  versao                      Int        @default(0)
  atualizadoEm                DateTime   @default(now()) @updatedAt @map("atualizado_em") @db.Timestamptz(3)
  /// trigger: lower(f_unaccent(assunto + left(descricao, 2000)))
  buscaNorm                   String?    @map("busca_norm") @db.Text

  solicitante  Usuario       @relation("ChamadoSolicitante", fields: [solicitanteId], references: [id], onDelete: Restrict)
  abertoPor    Usuario       @relation("ChamadoAbertoPor", fields: [abertoPorId], references: [id], onDelete: Restrict)
  operador     Usuario?      @relation("ChamadoOperador", fields: [operadorId], references: [id], onDelete: Restrict)
  area         Area          @relation(fields: [areaId], references: [id], onDelete: Restrict)
  problema     Problema?     @relation(fields: [problemaId], references: [id], onDelete: Restrict)
  prioridade   Prioridade    @relation(fields: [prioridadeId], references: [id], onDelete: Restrict)
  canal        Canal         @relation(fields: [canalId], references: [id], onDelete: Restrict)
  status       Status        @relation(fields: [statusId, statusTipo], references: [id, tipo], onDelete: Restrict, onUpdate: Cascade)
  departamento Departamento? @relation(fields: [departamentoId], references: [id], onDelete: Restrict)
  ativo        Ativo?        @relation(fields: [ativoId], references: [id], onDelete: Restrict)
  jornada      Jornada       @relation(fields: [jornadaId], references: [id], onDelete: Restrict)

  estagios      ChamadoEstagio[]
  eventos       ChamadoEvento[]
  assentamentos Assentamento[]
  mencoes       Mencao[]
  seguidores    ChamadoSeguidor[]
  leituras      ChamadoLeitura[]
  tags          ChamadoTag[]
  anexos        Anexo[]
  avaliacao     AvaliacaoChamado?
  notificacoes  Notificacao[]

  @@index([solicitanteId, id(sort: Desc)], map: "ix_chamados_solicitante")
  @@index([abertoPorId], map: "ix_chamados_aberto_por")
  @@index([areaId, statusTipo, id(sort: Desc)], map: "ix_chamados_area_tipo")
  @@index([operadorId, statusTipo, id(sort: Desc)], map: "ix_chamados_operador_tipo")
  @@index([statusId, id(sort: Desc)], map: "ix_chamados_status")
  @@index([areaId, id(sort: Desc)], map: "ix_chamados_area_em_aberto", where: raw("concluido_em IS NULL"))
  @@index([operadorId, id(sort: Desc)], map: "ix_chamados_operador_em_aberto", where: raw("concluido_em IS NULL"))
  @@index([areaId, abertoEm], map: "ix_chamados_fila", where: raw("concluido_em IS NULL AND operador_id IS NULL"))
  @@index([prazoSolucaoEm], map: "ix_chamados_prazo_solucao", where: raw("concluido_em IS NULL AND prazo_solucao_em IS NOT NULL"))
  @@index([alertaSolucaoEm], map: "ix_chamados_alerta_solucao", where: raw("concluido_em IS NULL AND alerta_solucao_em IS NOT NULL"))
  @@index([prazoRespostaEm], map: "ix_chamados_prazo_resposta", where: raw("primeira_resposta_em IS NULL AND prazo_resposta_em IS NOT NULL"))
  @@index([agendadoPara], map: "ix_chamados_agendados", where: raw("agendado_para IS NOT NULL"))
  @@index([validacaoLimiteEm], map: "ix_chamados_validacao", where: raw("validacao_limite_em IS NOT NULL"))
  @@index([jornadaId], map: "ix_chamados_jornada_em_aberto", where: raw("concluido_em IS NULL"))
  @@index([abertoEm], map: "ix_chamados_aberto_em")
  @@index([encerradoEm], map: "ix_chamados_encerrado_em", where: raw("encerrado_em IS NOT NULL"))
  @@index([problemaId], map: "ix_chamados_problema")
  @@index([ativoId, id(sort: Desc)], map: "ix_chamados_ativo", where: raw("ativo_id IS NOT NULL"))
  @@index([buscaNorm(ops: raw("gin_trgm_ops"))], type: Gin, map: "ix_chamados_busca_norm_trgm")
  @@map("chamados")
}

/// Intervalos FECHADOS de status (o atual está em chamados.status_desde). Base do SLA com pausa
model ChamadoEstagio {
  id         Int        @id @default(autoincrement())
  chamadoId  Int        @map("chamado_id")
  statusId   Int        @map("status_id")
  statusTipo TipoStatus @map("status_tipo")
  /// snapshot de status.pausa_sla no intervalo
  pausaSla   Boolean    @map("pausa_sla")
  inicioEm   DateTime   @map("inicio_em") @db.Timestamptz(3)
  fimEm      DateTime   @map("fim_em") @db.Timestamptz(3)
  /// responsável durante o intervalo (base do D08 na Fase 2)
  operadorId Int?       @map("operador_id")
  /// quem fez a transição; null = sistema
  autorId    Int?       @map("autor_id")

  chamado  Chamado  @relation(fields: [chamadoId], references: [id], onDelete: Cascade)
  status   Status   @relation(fields: [statusId], references: [id], onDelete: Restrict)
  operador Usuario? @relation("EstagioOperador", fields: [operadorId], references: [id], onDelete: Restrict)
  autor    Usuario? @relation("EstagioAutor", fields: [autorId], references: [id], onDelete: Restrict)

  @@index([chamadoId, inicioEm], map: "ix_estagios_chamado")
  @@index([statusId], map: "ix_estagios_status")
  @@map("chamado_estagios")
}

/// Histórico campo a campo (C22) + fonte do feed + outbox do fanout
model ChamadoEvento {
  id             Int        @id @default(autoincrement())
  chamadoId      Int        @map("chamado_id")
  tipo           TipoEvento
  /// null = sistema/job
  atorId         Int?       @map("ator_id")
  /// comentário ou mensagem de sistema ligada ao evento
  assentamentoId Int?       @map("assentamento_id")
  interno        Boolean    @default(false)
  /// { campo?, de?, para?, mencionados?, motivo?, avaliacaoAnterior? } — sem texto livre de usuário
  dados          Json       @default("{}")
  criadoEm       DateTime   @default(now()) @map("criado_em") @db.Timestamptz(3)
  processadoEm   DateTime?  @map("processado_em") @db.Timestamptz(3)

  chamado      Chamado       @relation(fields: [chamadoId], references: [id], onDelete: Cascade)
  ator         Usuario?      @relation(fields: [atorId], references: [id], onDelete: Restrict)
  assentamento Assentamento? @relation(fields: [assentamentoId], references: [id], onDelete: SetNull)
  notificacoes Notificacao[]

  @@index([chamadoId, id], map: "ix_eventos_chamado")
  @@index([id], map: "ix_eventos_pendentes", where: raw("processado_em IS NULL"))
  @@map("chamado_eventos")
}

/// Mensagem da timeline (chat). Imutável no MVP
model Assentamento {
  id        Int              @id @default(autoincrement())
  chamadoId Int              @map("chamado_id")
  /// null só em SISTEMA gerado por job
  autorId   Int?             @map("autor_id")
  tipo      TipoAssentamento @default(COMENTARIO)
  interno   Boolean          @default(false)
  /// Markdown ≤ 10.000 com tokens @[Nome](usuario:ID); em SISTEMA, texto pt-BR pronto
  texto     String           @db.Text
  /// SISTEMA: tipo do evento e dados para renderizar de/para
  evento    TipoEvento?
  dados     Json?
  /// idempotência do envio otimista
  clienteId String?          @map("cliente_id") @db.Uuid
  criadoEm  DateTime         @default(now()) @map("criado_em") @db.Timestamptz(3)

  chamado      Chamado         @relation(fields: [chamadoId], references: [id], onDelete: Cascade)
  autor        Usuario?        @relation(fields: [autorId], references: [id], onDelete: Restrict)
  mencoes      Mencao[]
  anexos       Anexo[]
  eventos      ChamadoEvento[]
  notificacoes Notificacao[]

  @@unique([autorId, clienteId])
  @@index([chamadoId, id], map: "ix_assentamentos_chamado")
  @@index([autorId, criadoEm], map: "ix_assentamentos_autor")
  @@map("assentamentos")
}

model Mencao {
  assentamentoId Int      @map("assentamento_id")
  usuarioId      Int      @map("usuario_id")
  chamadoId      Int      @map("chamado_id")
  criadoEm       DateTime @default(now()) @map("criado_em") @db.Timestamptz(3)

  assentamento Assentamento @relation(fields: [assentamentoId], references: [id], onDelete: Cascade)
  usuario      Usuario      @relation(fields: [usuarioId], references: [id], onDelete: Cascade)
  chamado      Chamado      @relation(fields: [chamadoId], references: [id], onDelete: Cascade)

  @@id([assentamentoId, usuarioId])
  @@index([usuarioId], map: "ix_mencoes_usuario")
  @@index([chamadoId], map: "ix_mencoes_chamado")
  @@map("mencoes")
}

model ChamadoSeguidor {
  chamadoId    Int          @map("chamado_id")
  usuarioId    Int          @map("usuario_id")
  motivo       MotivoSeguir
  silenciadoEm DateTime?    @map("silenciado_em") @db.Timestamptz(3)
  criadoEm     DateTime     @default(now()) @map("criado_em") @db.Timestamptz(3)

  chamado Chamado @relation(fields: [chamadoId], references: [id], onDelete: Cascade)
  usuario Usuario @relation(fields: [usuarioId], references: [id], onDelete: Cascade)

  @@id([chamadoId, usuarioId])
  @@index([usuarioId], map: "ix_seguidores_usuario")
  @@map("chamado_seguidores")
}

/// Confirmação de leitura: ponteiro monotônico (upsert com WHERE anterior < novo)
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

model ChamadoTag {
  chamadoId Int      @map("chamado_id")
  tagId     Int      @map("tag_id")
  criadoEm  DateTime @default(now()) @map("criado_em") @db.Timestamptz(3)

  chamado Chamado @relation(fields: [chamadoId], references: [id], onDelete: Cascade)
  tag     Tag     @relation(fields: [tagId], references: [id], onDelete: Restrict)

  @@id([chamadoId, tagId])
  @@index([tagId, chamadoId], map: "ix_chamado_tags_tag")
  @@map("chamado_tags")
}

/// Metadados do arquivo; conteúdo em UPLOAD_DIR/<storage_chave>. id = uuid da chave
model Anexo {
  id             String   @id @db.Uuid
  chamadoId      Int      @map("chamado_id")
  assentamentoId Int?     @map("assentamento_id")
  enviadoPorId   Int      @map("enviado_por_id")
  /// só exibição e Content-Disposition (sanitizado, ≤ 200)
  nomeOriginal   String   @map("nome_original") @db.VarChar(200)
  /// tipo DETECTADO (nunca o declarado pelo cliente)
  mime           String   @db.VarChar(127)
  tamanho        Int
  sha256         String   @db.Char(64)
  /// AAAA/MM/<uuid>
  storageChave   String   @unique @map("storage_chave") @db.VarChar(64)
  interno        Boolean  @default(false)
  criadoEm       DateTime @default(now()) @map("criado_em") @db.Timestamptz(3)

  chamado      Chamado       @relation(fields: [chamadoId], references: [id], onDelete: Restrict)
  assentamento Assentamento? @relation(fields: [assentamentoId], references: [id], onDelete: SetNull)
  enviadoPor   Usuario       @relation(fields: [enviadoPorId], references: [id], onDelete: Restrict)

  @@index([chamadoId], map: "ix_anexos_chamado")
  @@index([assentamentoId], map: "ix_anexos_assentamento")
  @@map("anexos")
}

/// Avaliação vigente (1:1). Reabrir apaga (fica no evento REABERTO)
model AvaliacaoChamado {
  chamadoId   Int           @id @map("chamado_id")
  avaliadorId Int?          @map("avaliador_id")
  nota        NotaAvaliacao
  comentario  String?       @db.VarChar(1000)
  automatica  Boolean       @default(false)
  criadoEm    DateTime      @default(now()) @map("criado_em") @db.Timestamptz(3)

  chamado   Chamado  @relation(fields: [chamadoId], references: [id], onDelete: Cascade)
  avaliador Usuario? @relation(fields: [avaliadorId], references: [id], onDelete: Restrict)

  @@index([criadoEm], map: "ix_avaliacoes_criado_em")
  @@map("avaliacoes")
}

/// Feed de Atividade. SEM texto de usuário: o trecho é montado na leitura
model Notificacao {
  id             Int             @id @default(autoincrement())
  usuarioId      Int             @map("usuario_id")
  chamadoId      Int             @map("chamado_id")
  tipo           TipoNotificacao
  /// agrupamento; renomeado para "<chave>#<id>" ao marcar lida
  grupoChave     String          @map("grupo_chave") @db.VarChar(160)
  eventoId       Int?            @map("evento_id")
  /// foco = primeiro assentamento do grupo
  assentamentoId Int?            @map("assentamento_id")
  /// mais recentes primeiro, máx. 10
  atorIds        Int[]           @default([]) @map("ator_ids")
  contagem       Int             @default(1)
  interno        Boolean         @default(false)
  /// { statusNome?, marco? } — só rótulos de sistema
  dados          Json            @default("{}")
  criadoEm       DateTime        @default(now()) @map("criado_em") @db.Timestamptz(3)
  /// atualizado por SQL no upsert (não usar @updatedAt)
  atualizadoEm   DateTime        @default(now()) @map("atualizado_em") @db.Timestamptz(3)
  lidaEm         DateTime?       @map("lida_em") @db.Timestamptz(3)

  usuario      Usuario        @relation(fields: [usuarioId], references: [id], onDelete: Cascade)
  chamado      Chamado        @relation(fields: [chamadoId], references: [id], onDelete: Cascade)
  evento       ChamadoEvento? @relation(fields: [eventoId], references: [id], onDelete: SetNull)
  assentamento Assentamento?  @relation(fields: [assentamentoId], references: [id], onDelete: SetNull)

  @@unique([usuarioId, grupoChave])
  @@index([usuarioId, atualizadoEm(sort: Desc), id(sort: Desc)], map: "ix_notificacoes_feed")
  @@index([usuarioId, chamadoId], map: "ix_notificacoes_nao_lidas", where: raw("lida_em IS NULL"))
  @@index([chamadoId], map: "ix_notificacoes_chamado")
  @@index([lidaEm], map: "ix_notificacoes_lida_em", where: raw("lida_em IS NOT NULL"))
  @@map("notificacoes")
}

// ═════════════════════════ INVENTÁRIO ═════════════════════════

model TipoAtivo {
  id    Int     @id @default(autoincrement())
  nome  String  @unique @db.VarChar(80)
  ativo Boolean @default(true)

  ativos Ativo[]

  @@map("tipos_ativo")
}

/// Ativo (antigo "equipamentos"). IDs da v1 preservados. Vínculo com chamado é por id, nunca etiqueta
model Ativo {
  id               Int           @id @default(autoincrement())
  /// alfanumérica, sem espaços (CHECK)
  etiqueta         String        @unique @db.VarChar(60)
  tipoId           Int           @map("tipo_id")
  modelo           String?       @db.VarChar(120)
  serie            String?       @db.VarChar(100)
  departamentoId   Int?          @map("departamento_id")
  responsavelId    Int?          @map("responsavel_id")
  /// legado: responsável sem cadastro
  responsavelTexto String?       @map("responsavel_texto") @db.VarChar(120)
  situacao         SituacaoAtivo @default(EM_USO)
  observacao       String?       @db.Text
  criadoEm         DateTime      @default(now()) @map("criado_em") @db.Timestamptz(3)
  atualizadoEm     DateTime      @default(now()) @updatedAt @map("atualizado_em") @db.Timestamptz(3)
  /// trigger: lower(f_unaccent(etiqueta serie modelo))
  buscaNorm        String?       @map("busca_norm") @db.Text

  tipo         TipoAtivo     @relation(fields: [tipoId], references: [id], onDelete: Restrict)
  departamento Departamento? @relation(fields: [departamentoId], references: [id], onDelete: Restrict)
  responsavel  Usuario?      @relation(fields: [responsavelId], references: [id], onDelete: Restrict)
  chamados     Chamado[]

  @@index([tipoId], map: "ix_ativos_tipo")
  @@index([situacao], map: "ix_ativos_situacao")
  @@index([departamentoId], map: "ix_ativos_departamento")
  @@index([responsavelId], map: "ix_ativos_responsavel")
  @@index([buscaNorm(ops: raw("gin_trgm_ops"))], type: Gin, map: "ix_ativos_busca_norm_trgm")
  @@map("ativos")
}

// ═════════════════════════ CONHECIMENTO ═════════════════════════

model CategoriaArtigo {
  id    Int     @id @default(autoincrement())
  nome  String  @unique @db.VarChar(100)
  ordem Int     @default(0)
  ativo Boolean @default(true)

  artigos Artigo[]

  @@map("categorias_artigo")
}

/// Artigo da base (antiga FAQ + roteiros). IDs da v1 preservados
model Artigo {
  id            Int                @id @default(autoincrement())
  titulo        String             @db.VarChar(200)
  resumo        String?            @db.VarChar(500)
  /// Markdown
  conteudo      String             @db.Text
  categoriaId   Int?               @map("categoria_id")
  situacao      SituacaoArtigo     @default(RASCUNHO)
  visibilidade  VisibilidadeArtigo @default(PUBLICO)
  autorId       Int?               @map("autor_id")
  visualizacoes Int                @default(0)
  publicadoEm   DateTime?          @map("publicado_em") @db.Timestamptz(3)
  criadoEm      DateTime           @default(now()) @map("criado_em") @db.Timestamptz(3)
  atualizadoEm  DateTime           @default(now()) @updatedAt @map("atualizado_em") @db.Timestamptz(3)
  /// trigger: titulo(A) resumo(B) conteudo(C), 'portuguese' + f_unaccent
  busca         Unsupported("tsvector")?
  /// trigger: lower(f_unaccent(titulo resumo))
  buscaNorm     String?            @map("busca_norm") @db.Text

  categoria CategoriaArtigo? @relation(fields: [categoriaId], references: [id], onDelete: Restrict)
  autor     Usuario?         @relation(fields: [autorId], references: [id], onDelete: Restrict)
  problemas ArtigoProblema[]
  votos     ArtigoVoto[]

  @@index([situacao, visibilidade], map: "ix_artigos_situacao")
  @@index([categoriaId], map: "ix_artigos_categoria")
  @@index([busca], type: Gin, map: "ix_artigos_busca")
  @@index([buscaNorm(ops: raw("gin_trgm_ops"))], type: Gin, map: "ix_artigos_busca_norm_trgm")
  @@map("artigos")
}

model ArtigoProblema {
  artigoId   Int @map("artigo_id")
  problemaId Int @map("problema_id")

  artigo   Artigo   @relation(fields: [artigoId], references: [id], onDelete: Cascade)
  problema Problema @relation(fields: [problemaId], references: [id], onDelete: Cascade)

  @@id([artigoId, problemaId])
  @@index([problemaId], map: "ix_artigo_problemas_problema")
  @@map("artigo_problemas")
}

model ArtigoVoto {
  artigoId  Int      @map("artigo_id")
  usuarioId Int      @map("usuario_id")
  util      Boolean
  criadoEm  DateTime @default(now()) @map("criado_em") @db.Timestamptz(3)

  artigo  Artigo  @relation(fields: [artigoId], references: [id], onDelete: Cascade)
  usuario Usuario @relation(fields: [usuarioId], references: [id], onDelete: Cascade)

  @@id([artigoId, usuarioId])
  @@map("artigo_votos")
}

// ═════════════════════════ CONFIGURAÇÃO ═════════════════════════

/// Chave/valor; valor JSON validado pelo registro Zod de packages/shared/src/config.ts
model Config {
  chave        String   @id @db.VarChar(80)
  valor        Json
  atualizadoEm DateTime @default(now()) @updatedAt @map("atualizado_em") @db.Timestamptz(3)

  @@map("config")
}
```

**Regras de fallback** (aplicar só quando o sintoma aparecer):

| Sintoma | Correção |
|---|---|
| (a) `prisma validate` acusa "no default operator class" em `busca` | Trocar por `@@index([busca(ops: raw("tsvector_ops"))], type: Gin, …)` |
| (b) O mesmo erro no BRIN | Usar `criadoEm(ops: TimestampTzMinMaxOps)` |
| (c) Rodar `migrate dev` de novo não responde "Already in sync" por causa de índice parcial | Rodar `prisma db pull --print` e copiar exatamente o `where: raw(...)` impresso |
| (d) A FK composta com enum é recusada | Usar `fields: [statusId], references: [id]`, remover `@@unique([id, tipo])` e manter só os CHECKs |

Toda vez que um fallback for aplicado, registrar no commit.

Modelos da Fase 2 (entram em migrações próprias, **não** criar agora): `CampoPersonalizado`, `ChamadoCampoValor`, `Categoria`, `FormularioAbertura`, `ChamadoOperador`, `ChamadoRelacao`, `Lembrete`, `CoAutor`, `PeriodoAtendimento`, `Aviso`, `AvisoVisto`, `ModeloEmail`, `EmailSaida`, `SolucaoPadrao`, `TokenApi`, `AplicacaoApi`, `Fabricante`, `ModeloAtivo`, `AtivoMovimentacao`, `DocumentoAtivo` (documentos do ativo; `Anexo` não muda — T-17.6), `FiltroSalvo`, `AssentamentoEdicao`.

### 4.3 SQL extra da migração `init`

Procedimento:
1. `pnpm --filter @vinimon/api exec prisma migrate dev --create-only --name init`.
2. Colar o **bloco A no topo** e o **bloco B no fim** do `migration.sql`.
3. `pnpm --filter @vinimon/api exec prisma migrate dev`.
4. Repetir o `migrate dev`: a resposta precisa ser "Already in sync".

```sql
-- ===== A) Extensões + unaccent imutável (antes do DDL gerado: gin_trgm_ops depende de pg_trgm) =====
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
-- unaccent() é STABLE; esta versão qualificada e SQL-standard (PG14+) é IMMUTABLE e segura em pg_dump/restore.
CREATE OR REPLACE FUNCTION public.f_unaccent(text)
  RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
BEGIN ATOMIC
  SELECT public.unaccent('public.unaccent'::regdictionary, $1);
END;
```

```sql
-- ===== B1) Triggers de busca =====
CREATE OR REPLACE FUNCTION public.tg_chamados_busca() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.busca_norm := lower(public.f_unaccent(concat_ws(' ', NEW.assunto, left(NEW.descricao, 2000))));
  RETURN NEW;
END $$;
CREATE TRIGGER tg_chamados_busca BEFORE INSERT OR UPDATE OF assunto, descricao
  ON public.chamados FOR EACH ROW EXECUTE FUNCTION public.tg_chamados_busca();

CREATE OR REPLACE FUNCTION public.tg_usuarios_busca() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.busca_norm := lower(public.f_unaccent(concat_ws(' ', NEW.nome, NEW.login, NEW.email)));
  RETURN NEW;
END $$;
CREATE TRIGGER tg_usuarios_busca BEFORE INSERT OR UPDATE OF nome, login, email
  ON public.usuarios FOR EACH ROW EXECUTE FUNCTION public.tg_usuarios_busca();

CREATE OR REPLACE FUNCTION public.tg_ativos_busca() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.busca_norm := lower(public.f_unaccent(concat_ws(' ', NEW.etiqueta, NEW.serie, NEW.modelo)));
  RETURN NEW;
END $$;
CREATE TRIGGER tg_ativos_busca BEFORE INSERT OR UPDATE OF etiqueta, serie, modelo
  ON public.ativos FOR EACH ROW EXECUTE FUNCTION public.tg_ativos_busca();

CREATE OR REPLACE FUNCTION public.tg_artigos_busca() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.busca :=
       setweight(to_tsvector('portuguese', public.f_unaccent(coalesce(NEW.titulo, ''))), 'A')
    || setweight(to_tsvector('portuguese', public.f_unaccent(coalesce(NEW.resumo, ''))), 'B')
    || setweight(to_tsvector('portuguese', public.f_unaccent(left(coalesce(NEW.conteudo, ''), 200000))), 'C');
  NEW.busca_norm := lower(public.f_unaccent(concat_ws(' ', NEW.titulo, NEW.resumo)));
  RETURN NEW;
END $$;
CREATE TRIGGER tg_artigos_busca BEFORE INSERT OR UPDATE OF titulo, resumo, conteudo
  ON public.artigos FOR EACH ROW EXECUTE FUNCTION public.tg_artigos_busca();

-- ===== B2) CHECK constraints =====
ALTER TABLE usuarios ADD CONSTRAINT ck_usuarios_login CHECK (login ~ '^[a-z0-9._@-]{3,64}$');
ALTER TABLE usuarios ADD CONSTRAINT ck_usuarios_email CHECK (email IS NULL OR (email = lower(btrim(email)) AND position('@' in email) > 1));
ALTER TABLE usuarios ADD CONSTRAINT ck_usuarios_area_operador CHECK (perfil <> 'OPERADOR' OR area_id IS NOT NULL);
ALTER TABLE usuarios ADD CONSTRAINT ck_usuarios_telefone CHECK (telefone IS NULL OR telefone ~ '^[0-9+()\- ]{0,30}$');
ALTER TABLE prioridades ADD CONSTRAINT ck_prioridades_cor CHECK (cor ~ '^#[0-9a-fA-F]{6}$');
ALTER TABLE prioridades ADD CONSTRAINT ck_prioridades_sla CHECK ((sla_resposta_min IS NULL OR sla_resposta_min > 0) AND (sla_solucao_min IS NULL OR sla_solucao_min > 0));
ALTER TABLE status ADD CONSTRAINT ck_status_cor CHECK (cor ~ '^#[0-9a-fA-F]{6}$');
ALTER TABLE status ADD CONSTRAINT ck_status_pausa_final CHECK (tipo NOT IN ('CONCLUIDO','ENCERRADO') OR pausa_sla);
ALTER TABLE status ADD CONSTRAINT ck_status_papel CHECK (CASE papel::text
    WHEN 'INICIAL' THEN tipo = 'ABERTO'
    WHEN 'EM_ATENDIMENTO' THEN tipo = 'EM_ATENDIMENTO'
    WHEN 'ENCAMINHADO' THEN tipo = 'EM_ATENDIMENTO'
    WHEN 'AGUARDANDO_SOLICITANTE' THEN tipo = 'PENDENTE'
    WHEN 'AGENDADO' THEN tipo = 'AGENDADO'
    WHEN 'CONCLUIDO' THEN tipo = 'CONCLUIDO'
    WHEN 'ENCERRADO' THEN tipo = 'ENCERRADO'
    WHEN 'CANCELADO' THEN tipo = 'ENCERRADO'
    ELSE true END);
ALTER TABLE problemas ADD CONSTRAINT ck_problemas_sla CHECK ((sla_resposta_min IS NULL OR sla_resposta_min > 0) AND (sla_solucao_min IS NULL OR sla_solucao_min > 0));
ALTER TABLE tags ADD CONSTRAINT ck_tags_nome CHECK (nome_normalizado = lower(btrim(nome)) AND char_length(btrim(nome)) BETWEEN 1 AND 30);
ALTER TABLE jornada_horarios ADD CONSTRAINT ck_jornada_horarios CHECK (dia_semana BETWEEN 0 AND 6 AND inicio_min >= 0 AND fim_min <= 1440 AND fim_min > inicio_min);
ALTER TABLE ativos ADD CONSTRAINT ck_ativos_etiqueta CHECK (etiqueta ~ '^[A-Za-z0-9._/-]{1,60}$');

ALTER TABLE chamados ADD CONSTRAINT ck_chamados_assunto CHECK (char_length(btrim(assunto)) >= 3);
ALTER TABLE chamados ADD CONSTRAINT ck_chamados_descricao CHECK (char_length(descricao) BETWEEN 1 AND 20000);
ALTER TABLE chamados ADD CONSTRAINT ck_chamados_concluido CHECK ((status_tipo IN ('CONCLUIDO','ENCERRADO')) = (concluido_em IS NOT NULL));
ALTER TABLE chamados ADD CONSTRAINT ck_chamados_encerrado CHECK ((status_tipo = 'ENCERRADO') = (encerrado_em IS NOT NULL));
ALTER TABLE chamados ADD CONSTRAINT ck_chamados_cancelado CHECK (NOT cancelado OR status_tipo = 'ENCERRADO');
ALTER TABLE chamados ADD CONSTRAINT ck_chamados_agendado CHECK ((status_tipo = 'AGENDADO') = (agendado_para IS NOT NULL));
ALTER TABLE chamados ADD CONSTRAINT ck_chamados_validacao CHECK (validacao_limite_em IS NULL OR status_tipo = 'CONCLUIDO');
ALTER TABLE chamados ADD CONSTRAINT ck_chamados_solucao CHECK (status_tipo NOT IN ('CONCLUIDO','ENCERRADO') OR cancelado OR solucao IS NOT NULL);
ALTER TABLE chamados ADD CONSTRAINT ck_chamados_datas CHECK (
      (concluido_em IS NULL OR concluido_em >= aberto_em)
  AND (encerrado_em IS NULL OR concluido_em IS NULL OR encerrado_em >= concluido_em)
  AND (primeira_resposta_em IS NULL OR primeira_resposta_em >= aberto_em));
ALTER TABLE chamados ADD CONSTRAINT ck_chamados_sla CHECK (
      (sla_resposta_min IS NULL OR sla_resposta_min > 0) AND (sla_solucao_min IS NULL OR sla_solucao_min > 0)
  AND sla_pausado_seg >= 0 AND rejeicoes >= 0 AND versao >= 0);

ALTER TABLE chamado_estagios ADD CONSTRAINT ck_estagios_intervalo CHECK (fim_em >= inicio_em);
ALTER TABLE assentamentos ADD CONSTRAINT ck_assentamentos_texto CHECK (
  tipo = 'SISTEMA' OR (autor_id IS NOT NULL AND char_length(btrim(texto)) BETWEEN 1 AND 10000));
ALTER TABLE anexos ADD CONSTRAINT ck_anexos_arquivo CHECK (
  tamanho > 0 AND sha256 ~ '^[0-9a-f]{64}$' AND storage_chave ~ '^[0-9]{4}/[0-9]{2}/[0-9a-f-]{36}$');
ALTER TABLE avaliacoes ADD CONSTRAINT ck_avaliacoes_avaliador CHECK (automatica OR avaliador_id IS NOT NULL);
ALTER TABLE notificacoes ADD CONSTRAINT ck_notificacoes_contagem CHECK (contagem >= 1);
ALTER TABLE sessoes ADD CONSTRAINT ck_sessoes_expira CHECK (expira_em > criada_em);
ALTER TABLE presencas_usuarios ADD CONSTRAINT ck_presencas_manual CHECK (manual_ate IS NULL OR estado_manual IS NOT NULL);

-- ===== B3) Auditoria somente-inserção =====
-- UPDATE nunca é permitido: trigger de INSTRUÇÃO, que dispara mesmo quando o UPDATE afeta 0 linhas.
-- DELETE só pela purga do job (SET LOCAL vinimon.purga_auditoria = 'on') e só de registros com mais de 365 dias.
-- Sem trigger de TRUNCATE: o limparBanco dos testes usa TRUNCATE.
CREATE OR REPLACE FUNCTION public.f_auditoria_imutavel() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'auditoria é somente inserção (%)', TG_OP USING ERRCODE = '42501';
END $$;
CREATE TRIGGER tg_auditoria_sem_update BEFORE UPDATE ON public.auditoria
  FOR EACH STATEMENT EXECUTE FUNCTION public.f_auditoria_imutavel();

CREATE OR REPLACE FUNCTION public.f_auditoria_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('vinimon.purga_auditoria', true) = 'on' AND OLD.criado_em < now() - interval '365 days' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'auditoria: DELETE só pela purga, de registros com mais de 365 dias' USING ERRCODE = '42501';
END $$;
CREATE TRIGGER tg_auditoria_delete BEFORE DELETE ON public.auditoria
  FOR EACH ROW EXECUTE FUNCTION public.f_auditoria_delete();
```

Critérios do bloco B3: `UPDATE auditoria SET acao='x'` falha com 42501 mesmo com a tabela vazia; com a GUC ligada, `DELETE FROM auditoria WHERE criado_em > now() - interval '1 day'` lança 42501, e a purga de registros com mais de 365 dias funciona.

Consultas SQL permitidas (sempre com template marcado):

```sql
-- Leitura monotônica (POST /chamados/:id/leitura)
INSERT INTO chamado_leituras (chamado_id, usuario_id, ultimo_assentamento_lido_id, lido_em)
VALUES (${chamadoId}, ${usuarioId}, ${assentamentoId}, now())
ON CONFLICT (chamado_id, usuario_id) DO UPDATE
SET ultimo_assentamento_lido_id = EXCLUDED.ultimo_assentamento_lido_id, lido_em = now()
WHERE chamado_leituras.ultimo_assentamento_lido_id < EXCLUDED.ultimo_assentamento_lido_id
RETURNING ultimo_assentamento_lido_id;
-- Sugestão de artigos (escopo simples: situação + visibilidade)
SELECT id, titulo, resumo, ts_rank_cd(busca, q) AS rank
FROM artigos, to_tsquery('portuguese', public.f_unaccent(${tsq})) q
WHERE busca @@ q AND situacao = 'PUBLICADO' AND (visibilidade = 'PUBLICO' OR ${podeInterno})
ORDER BY rank DESC, id DESC LIMIT 5;
```

### 4.4 Seed

**`prisma/seed.ts`** (`pnpm db:seed`; idempotente; roda em qualquer ambiente; tudo dentro de `$transaction(fn, { timeout: 60_000 })`):

1. **Config:** `CONFIG_PADRAO` via `createMany skipDuplicates`. Nunca sobrescreve.
2. **Canais** com `sistema=true`: Sistema Web, Telefone, E-mail, Automático: via e-mail, API.
3. **Jornadas:** "24x7" (`ininterrupta`) e "Comercial" (seg–sex `[480,720]` e `[780,1080]`). Grava `sla.jornadaPadraoId` = id da 24x7 se estiver null.
4. **Feriados nacionais fixos** (`recorrente`, ano 2000): 01-01, 04-21, 05-01, 09-07, 10-12, 11-02, 11-15, 11-20, 12-25.
5. **Unidade** "Principal".
6. **Status**, só se a tabela estiver vazia:

| Nome | Tipo | Papel | Pausa | Cor | Ordem |
|---|---|---|---|---|---|
| Aguardando atendimento | ABERTO | INICIAL | não | `#1565c0` | 100 |
| Em atendimento | EM_ATENDIMENTO | EM_ATENDIMENTO | não | `#6a1b9a` | 200 |
| Encaminhado para operador | EM_ATENDIMENTO | ENCAMINHADO | não | `#4527a0` | 210 |
| Aguardando retorno do solicitante | PENDENTE | AGUARDANDO_SOLICITANTE | sim | `#d9a400` | 300 |
| Aguardando fornecedor | PENDENTE | — | não | `#ef6c00` | 310 |
| Agendado | AGENDADO | AGENDADO | sim | `#00838f` | 320 |
| Concluído – aguardando validação | CONCLUIDO | CONCLUIDO | sim | `#2e7d32` | 400 |
| Encerrado | ENCERRADO | ENCERRADO | sim | `#546e7a` | 500 |
| Cancelado | ENCERRADO | CANCELADO | sim | `#757575` | 510 |

7. **Prioridades**, se vazia: Baixa `#2e8b57`/1, Média `#d9a400`/2 (`padrao`), Alta `#e67300`/3, Crítica `#c62828`/4.
8. **Área** "TI" (`atende`), se vazia.
9. **Admin**, só se não existir nenhum usuário: login `admin`, perfil ADMIN, área TI, `deveTrocarSenha=true`.
   - A senha vem de `SEED_ADMIN_PASSWORD`, validada por zxcvbn. Se a variável faltar, são gerados 20 caracteres aleatórios, impressos **uma vez**, depois do commit, com `process.stdout.write`.
   - O admin cadastra o 2FA no primeiro login.

**`prisma/seed-dev.ts`** (`pnpm --filter @vinimon/api seed:dev`) **recusa rodar com `NODE_ENV=production`** e cria dados de demonstração:
- áreas: Manutenção Predial (atende), RH e Financeiro (não atendem);
- departamentos: "Matriz – 1º andar", "Matriz – 2º andar", "Financeiro", "Almoxarifado";
- problemas (minutos de resposta/solução):
  - TI: Computador não liga 120/480, Rede/Internet 60/360, Impressora 240/1440, Instalação de software 480/2880, Acesso/Senha 60/240;
  - Manutenção: Ar-condicionado 240/2880, Elétrica 120/1440, Hidráulica 240/1440;
- tipos de ativo: Desktop, Notebook, Impressora, Monitor, Outros; ativos PAT-0001 a PAT-0003;
- categoria "Geral" com 2 artigos;
- usuários `operador` (OPERADOR, TI) e `usuario` (USUARIO, Financeiro), com senha aleatória e **segredo TOTP pré-cadastrado** no operador, ambos impressos no console.
- `pnpm --filter @vinimon/api cli totp:codigo <login>` imprime o código atual (só em dev).

### 4.5 Importador da v1 (`apps/api/scripts/importar-v1/`)

Uso: `pnpm --filter @vinimon/api importar:v1 --sqlite <caminho> [--dry-run] [--exigir-troca-todos]`, sem `--` antes das opções. O pnpm repassa um `--` ao script, por isso o `index.ts` faz `const args = process.argv.slice(2); if (args[0] === '--') args.shift()` antes de `parseArgs({ args, options: { ... }, strict: true, allowPositionals: false })`.

**Algoritmo:**
1. Copiar `.db`, `-wal` e `-shm` para `os.tmpdir()`. Abrir a cópia com `node:sqlite`, rodar `wal_checkpoint(TRUNCATE)` e exigir `integrity_check = ok`.
2. Ler as tabelas.
3. `validar()`, função pura. Qualquer erro aborta sem gravar.
   - São erros: data inválida, FK órfã, `nivel` fora de {1,2,3}, colisão de login em minúsculas, assunto com menos de 3 caracteres.
4. Gravar os arquivos dos anexos (pipeline de S63–S68, um BLOB por vez). Tipo fora da lista vira `application/octet-stream`, sempre como `attachment`.
   - O id do anexo importado é determinístico: `uuidLegado(id) = h.slice(0,8)+'-'+h.slice(8,12)+'-8'+h.slice(13,16)+'-'+((parseInt(h[16],16)&3)|8).toString(16)+h.slice(17,20)+'-'+h.slice(20,32)`, com `h = createHash('sha256').update('vinimon-legado-anexo:'+id).digest('hex')`.
   - A chave fica `AAAA/MM/<uuidLegado>`, com AAAA/MM de `criado_em` do legado.
   - Antes de ler o BLOB: `prisma.anexo.findMany({ where: { id: { in: lote } }, select: { id: true } })`; ids já existentes não são lidos nem gravados. Assim, uma segunda execução não duplica anexos no banco nem no disco.
5. Uma transação única:
   - `seedBase`;
   - `createMany skipDuplicates` em lotes de 1000, na ordem das FKs;
   - config;
   - `setval` das sequences: `SELECT setval(pg_get_serial_sequence(${t}, 'id'), COALESCE((SELECT MAX(id) FROM ${Prisma.raw('"' + t + '"')}), 0) + 1, false)`, com `t` de lista fixa validada por `/^[a-z_]+$/`;
   - status de sistema que faltarem (sufixo " (sistema)" se o nome já existir);
   - campos desnormalizados, incluindo `ultimaInteracaoEm` / `ultimaInteracaoAutorId` = data e autor do último assentamento público;
   - se `count(prioridades WHERE padrao)` = 0, marcar a de menor `ordem` (desempate: menor id);
   - marcador `config['legado.migracao']`.
6. `--dry-run` executa tudo e lança `DryRunRollback` no fim (o banco fica intacto).
7. Relatório por tabela e lista de avisos.

**Invariantes depois da importação:** exatamente 1 prioridade padrão, 5 canais `sistema` e todos os papéis de status; rodar `executar` do `sla-alertas` logo após a importação gera 0 eventos. Executar o importador 2 vezes deixa `count(anexos)` e `find $UPLOAD_DIR -type f | wc -l` iguais aos da origem.

**Mapeamento:**

| v1 | v2 |
|---|---|
| areas | Area (id, nome, atende, ativo) |
| locais | Departamento (mesmo id) na unidade "Principal" |
| prioridades | Prioridade. Cor inválida vira `#888888` com aviso. A de menor `ordem` acima de 1 vira `padrao` |
| status | Status com o mapeamento de tipo: aberto→ABERTO, andamento→EM_ATENDIMENTO, pendente→PENDENTE (pausa), encerrado→ENCERRADO (pausa). Papéis: o menor id de cada tipo recebe INICIAL, EM_ATENDIMENTO, AGUARDANDO_SOLICITANTE ou ENCERRADO; o nome "Agendado" recebe AGENDADO; os papéis que faltarem são criados |
| problemas | Problema (horas × 60; 0 vira null), `areaPadraoId = area_id` e uma linha em `ProblemaArea` |
| usuarios | Usuario. Login com `lower(trim)`. E-mail inválido ou duplicado vira null (com aviso). `senha_hash` é mantido (scrypt). Níveis 1/2/3 → ADMIN/OPERADOR/USUARIO. Operador sem área recebe a primeira área com `atende` (aviso). `deveTrocarSenha` se a senha padrão for detectada ou com `--exigir-troca-todos`. **Hash que confere com `admin123`, `operador123`, `usuario123` ou `<login>123` vira `senhaHash = null`** e o login é listado no relatório |
| equipamentos | TipoAtivo (tipo distinto; null → "Outros") + Ativo. Situações "Em uso", "Em estoque", "Em manutenção", "Baixado" → enum. `responsavel` com exatamente um usuário de nome igual (normalizado) vira `responsavelId`; senão `responsavelTexto`. `departamentoId = local_id` |
| faq | Artigo (PUBLICADO se `ativo`, PUBLICO), categoria "Geral", `ArtigoProblema` a partir de `problema_id` |
| chamados | Chamado (ver regras abaixo) |
| assentamentos | Assentamento. `privado` → COMENTARIO com `interno = true`; `sistema` → SISTEMA. Texto acima de 10.000 caracteres é truncado com "[texto truncado na migração]" |
| anexos | Anexo com id determinístico `uuidLegado(id)` (passo 4), chave `AAAA/MM/<uuidLegado>` (AAAA/MM de `criado_em`) e arquivo em `UPLOAD_DIR`, `interno = false` |
| config | `nome_sistema` → `sistema.nome`; `organizacao` → `sistema.organizacao`; `sessao_horas` → `sessao.horasAbsoluta` (limitado a 1–72); `permitir_anexos` (`'1'`) → `anexos.habilitados` |
| notificacoes | não migradas |
| (derivado) | ChamadoSeguidor (solicitante, operador, autores de comentários); ChamadoLeitura (último id de cada chamado para cada seguidor) |

**Regras dos chamados:**
- `solicitanteId = usuario_id`.
- `abertoPorId` = autor do primeiro assentamento de sistema que começa com "Chamado aberto"; se não houver, o solicitante.
- `canalId` = "Sistema Web".
- `jornadaId` = 24x7.
- **Encerrados:** `concluidoEm = encerradoEm = data_fechamento`, ou o último assentamento, ou a abertura. Solução vazia vira "(sem solução registrada no sistema anterior)".
- **Agendados:** `agendadoPara` só se o status tiver papel AGENDADO.
- `statusDesde`: fechamento, ou o último assentamento de sistema, ou a abertura.
- O SLA é recalculado com `recalcularSla` (pausa em curso quando o status pausa).
- **Avisos de SLA já vencido** (evita a enxurrada de SLA_ESTOURADO, notificações e e-mails na primeira execução do `sla-alertas`): chamado em aberto com prazo de solução < agora → `slaAvisoEstouroEm` e `slaAvisoRiscoEm` = agora. Com prazo de resposta < agora e sem primeira resposta → `slaAvisoRespostaEm` = agora.

### 4.6 Algoritmo de SLA

**Regras:**
- **Metas:** do problema; se ele não define, da prioridade; se nenhum define, não há SLA. São copiadas para o chamado na abertura e a cada troca de problema ou prioridade.
- **Jornada:** a da área de atendimento; se a área não tem, `sla.jornadaPadraoId`. É copiada na abertura e quando a área muda.
- **Pausas:** só o SLA de **solução** pausa. São os estágios com `pausaSla = true` e o estágio atual se `slaPausado`. O SLA de resposta não pausa.
- **Prazos:** `prazo = adicionarMsUteis(abertoEm, meta + pausas)` e `alerta = adicionarMsUteis(abertoEm, meta × alertaPct + pausas)`.
  - Pausa em curso que começou antes do prazo deixa prazo e alerta em null (relógio parado).
  - Pausa depois do vencimento não "desvence" o chamado.
- **Recálculo** (dentro da transação): na abertura, em toda transição de status, na primeira resposta e na troca de problema, prioridade ou área. Quando uma jornada, horário ou feriado é editado, roda o job `sla-recalcular-jornada`. Se os prazos mudarem, os avisos (`slaAviso*`) são zerados.
- **Cache do calendário:** em memória por `jornadaId`, com TTL de 60 s, invalidado na edição.
- **Feriados vindos do Prisma** (`@db.Date`): usar `toISOString().slice(0,10)` para `'yyyy-MM-dd'` e `.slice(5,10)` para `'MM-dd'`. Nunca usar getters locais.

```ts
// apps/api/src/modules/sla/calendario.ts
import { DateTime } from 'luxon'

export interface Horario { diaSemana: number; inicioMin: number; fimMin: number } // 0=domingo; [inicio, fim) local; fim ≤ 1440
export interface CalendarioSla {
  timezone: string
  ininterrupta: boolean
  horarios: readonly Horario[]
  feriados: ReadonlySet<string> // 'yyyy-MM-dd' (não recorrentes)
  feriadosRecorrentes: ReadonlySet<string> // 'MM-dd'
}
export class ErroCalendarioSla extends Error {}

type Janela = readonly [number, number]
const LIMITE_DIAS = 3660
const cache = new WeakMap<CalendarioSla, Janela[][]>()

function janelasPorDia(cal: CalendarioSla): Janela[][] {
  const memo = cache.get(cal)
  if (memo) return memo
  const dias: Janela[][] = [[], [], [], [], [], [], []]
  for (const h of cal.horarios) {
    const lista = Number.isInteger(h.diaSemana) ? dias[h.diaSemana] : undefined
    if (lista === undefined) throw new ErroCalendarioSla('diaSemana inválido')
    if (!(h.inicioMin >= 0 && h.fimMin <= 1440 && h.fimMin > h.inicioMin)) throw new ErroCalendarioSla('janela inválida')
    lista.push([h.inicioMin, h.fimMin])
  }
  for (const lista of dias) {
    lista.sort((a, b) => a[0] - b[0])
    for (let i = 1; i < lista.length; i++) {
      const atual = lista[i]
      const anterior = lista[i - 1]
      if (atual && anterior && atual[0] < anterior[1]) throw new ErroCalendarioSla('janelas sobrepostas')
    }
  }
  if (!cal.ininterrupta && dias.every((l) => l.length === 0)) throw new ErroCalendarioSla('jornada sem horários')
  cache.set(cal, dias)
  return dias
}

function instante(dia: DateTime, minuto: number): number {
  if (minuto >= 1440) return dia.plus({ days: 1 }).startOf('day').toMillis() // 24:00 = 00:00 do dia seguinte
  return dia.set({ hour: Math.floor(minuto / 60), minute: minuto % 60, second: 0, millisecond: 0 }).toMillis()
}

function ehFeriado(dia: DateTime, cal: Pick<CalendarioSla, 'feriados' | 'feriadosRecorrentes'>): boolean {
  return cal.feriados.has(dia.toFormat('yyyy-MM-dd')) || cal.feriadosRecorrentes.has(dia.toFormat('MM-dd'))
}

function janelasDoDia(dia: DateTime, dias: Janela[][], cal: CalendarioSla): Array<[number, number]> {
  if (ehFeriado(dia, cal)) return []
  const lista = dias[dia.weekday % 7] ?? [] // luxon 1=segunda…7=domingo → 0=domingo
  return lista.map(([i, f]): [number, number] => [instante(dia, i), instante(dia, f)])
}

export function msUteisEntre(inicio: Date, fim: Date, cal: CalendarioSla): number {
  const a = inicio.getTime()
  const b = fim.getTime()
  if (!(b > a)) return 0
  if (cal.ininterrupta) return b - a
  const dias = janelasPorDia(cal)
  let total = 0
  let dia = DateTime.fromMillis(a, { zone: cal.timezone }).startOf('day')
  for (let i = 0; dia.toMillis() < b; i++, dia = dia.plus({ days: 1 })) {
    if (i > LIMITE_DIAS * 10) throw new ErroCalendarioSla('intervalo longo demais')
    for (const [ji, jf] of janelasDoDia(dia, dias, cal)) {
      const x = Math.max(ji, a)
      const y = Math.min(jf, b)
      if (y > x) total += y - x
    }
  }
  return total
}

export function adicionarMsUteis(inicio: Date, ms: number, cal: CalendarioSla): Date {
  if (!Number.isFinite(ms) || ms < 0) throw new ErroCalendarioSla('duração inválida')
  if (ms === 0) return new Date(inicio.getTime())
  if (cal.ininterrupta) return new Date(inicio.getTime() + ms)
  const dias = janelasPorDia(cal)
  const a = inicio.getTime()
  let restante = ms
  let dia = DateTime.fromMillis(a, { zone: cal.timezone }).startOf('day')
  for (let i = 0; i < LIMITE_DIAS; i++, dia = dia.plus({ days: 1 })) {
    for (const [ji, jf] of janelasDoDia(dia, dias, cal)) {
      const x = Math.max(ji, a)
      if (x >= jf) continue
      if (restante <= jf - x) return new Date(x + restante) // pode terminar exatamente no fim da janela
      restante -= jf - x
    }
  }
  throw new ErroCalendarioSla('prazo além de 3660 dias')
}

export const minutosUteisEntre = (i: Date, f: Date, c: CalendarioSla) => Math.floor(msUteisEntre(i, f, c) / 60_000)
export const adicionarMinutosUteis = (i: Date, min: number, c: CalendarioSla) => adicionarMsUteis(i, Math.round(min * 60_000), c)

/** Prazo de validação em dias úteis (seg–sex, exceto feriados), mantendo a hora local. */
export function adicionarDiasUteis(inicio: Date, dias: number, cal: Pick<CalendarioSla, 'timezone' | 'feriados' | 'feriadosRecorrentes'>): Date {
  let d = DateTime.fromJSDate(inicio, { zone: cal.timezone })
  let restantes = dias
  while (restantes > 0) {
    d = d.plus({ days: 1 })
    if (d.weekday <= 5 && !ehFeriado(d, cal)) restantes -= 1
  }
  return d.toJSDate()
}
```

```ts
// apps/api/src/modules/sla/recalculo.ts
import { adicionarMinutosUteis, adicionarMsUteis, type CalendarioSla, minutosUteisEntre, msUteisEntre } from './calendario'

export interface IntervaloPausa { inicio: Date; fim: Date | null } // fim null = pausa em curso
export interface EntradaSla {
  abertoEm: Date
  slaRespostaMin: number | null
  slaSolucaoMin: number | null
  primeiraRespostaEm: Date | null
  concluidoEm: Date | null
  pausas: readonly IntervaloPausa[]
  alertaPct: number // config sla.alertaPct
}
export interface ResultadoSla {
  prazoRespostaEm: Date | null
  alertaRespostaEm: Date | null
  prazoSolucaoEm: Date | null
  alertaSolucaoEm: Date | null
  slaPausadoSeg: number
  slaRespostaCumprido: boolean | null
  slaSolucaoCumprido: boolean | null
  tempoRespostaUtilMin: number | null
  tempoSolucaoUtilMin: number | null
}

export function recalcularSla(e: EntradaSla, cal: CalendarioSla): ResultadoSla {
  const fracao = e.alertaPct / 100
  const abertura = e.abertoEm.getTime()
  const prazoRespostaEm = e.slaRespostaMin ? adicionarMinutosUteis(e.abertoEm, e.slaRespostaMin, cal) : null
  const alertaRespostaEm = e.slaRespostaMin ? adicionarMinutosUteis(e.abertoEm, e.slaRespostaMin * fracao, cal) : null
  const slaRespostaCumprido =
    prazoRespostaEm && e.primeiraRespostaEm ? e.primeiraRespostaEm.getTime() <= prazoRespostaEm.getTime() : null
  const tempoRespostaUtilMin = e.primeiraRespostaEm ? minutosUteisEntre(e.abertoEm, e.primeiraRespostaEm, cal) : null

  const teto = e.concluidoEm?.getTime() ?? Number.POSITIVE_INFINITY
  let pausadoMs = 0
  let pausaAtual: IntervaloPausa | null = null
  for (const p of e.pausas) {
    if (p.fim === null) {
      pausaAtual = p
      continue
    }
    const ini = Math.max(p.inicio.getTime(), abertura)
    const fim = Math.min(p.fim.getTime(), teto)
    if (fim > ini) pausadoMs += msUteisEntre(new Date(ini), new Date(fim), cal)
  }
  const slaPausadoSeg = Math.floor(pausadoMs / 1000)
  const tempoSolucaoUtilMin = e.concluidoEm
    ? Math.max(0, Math.floor((msUteisEntre(e.abertoEm, e.concluidoEm, cal) - pausadoMs) / 60_000))
    : null
  const base = { prazoRespostaEm, alertaRespostaEm, slaRespostaCumprido, tempoRespostaUtilMin, slaPausadoSeg, tempoSolucaoUtilMin }

  if (!e.slaSolucaoMin) return { ...base, prazoSolucaoEm: null, alertaSolucaoEm: null, slaSolucaoCumprido: null }
  const metaMs = e.slaSolucaoMin * 60_000
  const prazoSolucaoEm = adicionarMsUteis(e.abertoEm, metaMs + pausadoMs, cal)
  const alertaSolucaoEm = adicionarMsUteis(e.abertoEm, Math.round(metaMs * fracao) + pausadoMs, cal)
  if (e.concluidoEm) {
    return { ...base, prazoSolucaoEm, alertaSolucaoEm, slaSolucaoCumprido: e.concluidoEm.getTime() <= prazoSolucaoEm.getTime() }
  }
  if (pausaAtual && pausaAtual.inicio.getTime() <= prazoSolucaoEm.getTime()) {
    return { ...base, prazoSolucaoEm: null, alertaSolucaoEm: null, slaSolucaoCumprido: null } // relógio parado
  }
  return { ...base, prazoSolucaoEm, alertaSolucaoEm, slaSolucaoCumprido: null }
}
```

```ts
// packages/shared/src/sla.ts — situação para a UI (sem luxon)
export const SITUACOES_SLA = ['SEM_SLA', 'NO_PRAZO', 'EM_RISCO', 'ESTOURADO', 'PAUSADO', 'CUMPRIDO', 'VIOLADO'] as const
export type SituacaoSla = (typeof SITUACOES_SLA)[number]
export interface DadosSla { meta: number | null; prazo: Date | null; alerta: Date | null; cumprido: boolean | null; finalizado: boolean; cancelado: boolean }

export function situacaoSla(d: DadosSla, agora: Date): SituacaoSla {
  if (d.meta === null || d.cancelado) return 'SEM_SLA'
  if (d.finalizado) return d.cumprido === false ? 'VIOLADO' : 'CUMPRIDO'
  if (d.prazo === null) return 'PAUSADO'
  if (agora.getTime() > d.prazo.getTime()) return 'ESTOURADO'
  if (d.alerta !== null && agora.getTime() >= d.alerta.getTime()) return 'EM_RISCO'
  return 'NO_PRAZO'
}
// resposta: finalizado = primeiraRespostaEm !== null; solução: finalizado = concluidoEm !== null
```

**Serviço** (`apps/api/src/modules/sla/service.ts`):
- `carregarCalendario(tx: Tx, jornadaId: number): Promise<CalendarioSla>` (com cache de 60 s);
- `snapshotSla(tx, { problemaId, prioridadeId, areaId }): Promise<{ jornadaId, slaRespostaMin, slaSolucaoMin }>`;
- `recalcularChamado(tx, chamadoId, agora): Promise<void>`;
- `aplicarTransicaoStatus(tx, { chamadoId, versao, novoStatusId, atorId, agora, extras?: Prisma.ChamadoUncheckedUpdateManyInput }): Promise<{ statusAnteriorId: number }>`.

Passos de `aplicarTransicaoStatus`:
1. Ler o chamado e o novo status (ativo).
2. Inserir `ChamadoEstagio` com o status atual, `pausaSla = slaPausado`, `inicioEm = statusDesde`, `fimEm = agora`, o operador e o autor.
3. Ajustar as datas conforme o tipo novo:
   - CONCLUIDO: `concluidoEm ??= agora`.
   - ENCERRADO: `concluidoEm ??= agora` e `encerradoEm ??= agora`.
   - ABERTO, EM_ATENDIMENTO, PENDENTE ou AGENDADO: `concluidoEm`, `encerradoEm` e `validacaoLimiteEm` em null.
   - Tipo diferente de AGENDADO: `agendadoPara = null`.
   - ABERTO: `operadorId = null`.
4. `updateMany({ where: { id, versao } })` com status, `statusTipo`, `statusDesde = agora`, `slaPausado = novo.pausaSla`, datas, `extras` e `versao + 1`. Se `count = 0`, `conflito`.
5. `recalcularChamado`.

O evento é registrado por quem chama.

**Casos de teste** (`calendario.test.ts`, `recalculo.test.ts`):
- Rodar com `TZ=UTC` e `TZ=Asia/Tokyo`; os resultados têm de ser idênticos.
- Jornada "Comercial" em São Paulo: seg–sex `[480,720]` e `[780,1080]`.

| # | Entrada | Esperado |
|---|---|---|
| 1 | 24x7: add(2026-10-23T20:00Z, 240) | 2026-10-24T00:00Z |
| 2 | Sexta 17h + 120 | 2026-10-26T12:00Z |
| 3 | Sábado 2026-10-24T13:00Z + 60 | 2026-10-26T12:00Z |
| 4 | 2026-10-26T09:00Z + 30 | 2026-10-26T11:30Z |
| 5 | Almoço: 2026-10-26T14:30Z + 60 | 2026-10-26T16:30Z |
| 6 | 2026-10-26T20:00Z + 60 (termina no fim da janela) | 2026-10-26T21:00Z |
| 7 | Feriado 2026-11-02: 2026-10-30T20:00Z + 120 | 2026-11-03T12:00Z |
| 8 | Recorrente '12-25': 2026-12-24T20:00Z + 120 | 2026-12-28T12:00Z |
| 9 | entre(2026-10-23T20:00Z, 2026-10-26T12:00Z) | 120 min |
| 10 | fim ≤ início | 0 |
| 11 | add(sábado, 0) | o próprio início |
| 12 | fast-check: início em 2026, m de 1 a 20000 | `entre(i, add(i, m)) === m` |
| 13 | seg `[1320,1440]` + ter `[0,360]`: 2026-10-27T02:00Z + 180 | 2026-10-27T05:00Z |
| 14 | America/New_York, todos `[0,1440]` não ininterrupta, 2026-03-08 e 2026-11-01 | 23 h e 25 h |
| 15 | 2026-10-26T11:00:30.500Z + 1 min | 11:01:30.500Z |
| 16 | jornada sem horários | `ErroCalendarioSla` |
| 17 | janelas sobrepostas ou fim ≤ início | `ErroCalendarioSla` |
| 18 | 16.200 min a partir de 2026-10-26T11:00Z | 2026-12-04T21:00Z em menos de 50 ms |
| 19 | SLA 240, pausa 12:00Z–13:00Z | prazo 17:00Z; pausadoSeg 3600 |
| 20 | Pausa no fim de semana | pausadoSeg 0 |
| 21a | Pausa em curso antes do prazo | prazo null; alerta null |
| 21b | Pausa em curso depois do prazo | prazo 15:00Z (estourado) |
| 22 | Concluído 14:00Z / 16:30Z | cumprido true / false |
| 23 | 24x7, SLA 60, pausa 13–14Z, concluído 14:30Z | prazo 13:00Z; cumprido false |
| 24 | Resposta SLA 60: 11:59Z / 12:01Z / sem resposta | true / false / null |
| 25 | alertaPct 80, SLA 100 min 24x7 | alerta = abertura + 80 min |
| 26 | `situacaoSla` | todos os 7 estados |
| 27 | Integração: ABERTO → PENDENTE (pausa) → EM_ATENDIMENTO → CONCLUIDO → rejeitado → CONCLUIDO | estágios e prazos batem com `recalcularSla` |
| 28 | `adicionarDiasUteis` sexta + 1 dia útil | segunda; com feriado na segunda, terça |
