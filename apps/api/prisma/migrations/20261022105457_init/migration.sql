-- ===== A) Extensões + unaccent imutável (antes do DDL gerado: gin_trgm_ops depende de pg_trgm) =====
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
-- unaccent() é STABLE; esta versão qualificada e SQL-standard (PG14+) é IMMUTABLE e segura em pg_dump/restore.
CREATE OR REPLACE FUNCTION public.f_unaccent(text)
  RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
BEGIN ATOMIC
  SELECT public.unaccent('public.unaccent'::regdictionary, $1);
END;

-- ===== DDL gerado pelo Prisma =====
-- CreateEnum
CREATE TYPE "perfil" AS ENUM ('ADMIN', 'OPERADOR', 'USUARIO');

-- CreateEnum
CREATE TYPE "estado_sessao" AS ENUM ('PENDENTE_MFA', 'CADASTRO_MFA', 'TROCA_SENHA', 'ATIVA');

-- CreateEnum
CREATE TYPE "tema" AS ENUM ('CLARO', 'ESCURO', 'SISTEMA');

-- CreateEnum
CREATE TYPE "densidade" AS ENUM ('CONFORTAVEL', 'COMPACTA');

-- CreateEnum
CREATE TYPE "ator_auditoria" AS ENUM ('USUARIO', 'TOKEN', 'SISTEMA');

-- CreateEnum
CREATE TYPE "presenca_manual" AS ENUM ('OCUPADO', 'AUSENTE');

-- CreateEnum
CREATE TYPE "tipo_status" AS ENUM ('ABERTO', 'EM_ATENDIMENTO', 'PENDENTE', 'AGENDADO', 'CONCLUIDO', 'ENCERRADO');

-- CreateEnum
CREATE TYPE "papel_status" AS ENUM ('INICIAL', 'EM_ATENDIMENTO', 'ENCAMINHADO', 'AGUARDANDO_SOLICITANTE', 'AGENDADO', 'CONCLUIDO', 'ENCERRADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "tipo_assentamento" AS ENUM ('COMENTARIO', 'SISTEMA');

-- CreateEnum
CREATE TYPE "tipo_evento" AS ENUM ('CRIADO', 'COMENTARIO', 'ASSUMIDO', 'ENCAMINHADO', 'STATUS_ALTERADO', 'PRIORIDADE_ALTERADA', 'CLASSIFICACAO_ALTERADA', 'TAGS_ALTERADAS', 'AGENDADO', 'RETORNO_AGENDAMENTO', 'CONCLUIDO', 'APROVADO', 'REJEITADO', 'AUTO_APROVADO', 'REABERTO', 'CANCELADO', 'ANEXO_ADICIONADO', 'ANEXO_REMOVIDO', 'SLA_RISCO', 'SLA_ESTOURADO', 'SLA_RESPOSTA_ESTOURADO');

-- CreateEnum
CREATE TYPE "tipo_notificacao" AS ENUM ('MENCAO', 'ATRIBUIDO', 'NOVO_NA_FILA', 'COMENTARIO', 'STATUS', 'ATUALIZACAO', 'SLA', 'AVALIACAO_PENDENTE', 'AVALIACAO_RECEBIDA', 'REJEITADO');

-- CreateEnum
CREATE TYPE "motivo_seguir" AS ENUM ('SOLICITANTE', 'ABRIU', 'ATRIBUIDO', 'COMENTOU', 'MENCIONADO', 'MANUAL');

-- CreateEnum
CREATE TYPE "nota_avaliacao" AS ENUM ('OTIMO', 'BOM', 'REGULAR', 'RUIM');

-- CreateEnum
CREATE TYPE "situacao_ativo" AS ENUM ('EM_USO', 'EM_ESTOQUE', 'EM_MANUTENCAO', 'BAIXADO');

-- CreateEnum
CREATE TYPE "situacao_artigo" AS ENUM ('RASCUNHO', 'PUBLICADO', 'ARQUIVADO');

-- CreateEnum
CREATE TYPE "visibilidade_artigo" AS ENUM ('PUBLICO', 'INTERNO');

-- CreateTable
CREATE TABLE "unidades" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "endereco" VARCHAR(300),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unidades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departamentos" (
    "id" SERIAL NOT NULL,
    "unidade_id" INTEGER NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "departamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "areas" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "atende" BOOLEAN NOT NULL DEFAULT true,
    "jornada_id" INTEGER,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" SERIAL NOT NULL,
    "login" VARCHAR(64) NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "email" VARCHAR(254),
    "telefone" VARCHAR(30),
    "senha_hash" VARCHAR(255),
    "deve_trocar_senha" BOOLEAN NOT NULL DEFAULT false,
    "senha_alterada_em" TIMESTAMPTZ(3),
    "perfil" "perfil" NOT NULL DEFAULT 'USUARIO',
    "area_id" INTEGER,
    "departamento_id" INTEGER,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "totp_secret_enc" VARCHAR(255),
    "totp_secret_pendente_enc" VARCHAR(255),
    "totp_ultimo_passo" INTEGER,
    "mfa_ativado_em" TIMESTAMPTZ(3),
    "ultimo_login_em" TIMESTAMPTZ(3),
    "anonimizado_em" TIMESTAMPTZ(3),
    "tema" "tema" NOT NULL DEFAULT 'SISTEMA',
    "densidade" "densidade",
    "enviar_com_enter" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "busca_norm" TEXT,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario_areas" (
    "usuario_id" INTEGER NOT NULL,
    "area_id" INTEGER NOT NULL,

    CONSTRAINT "usuario_areas_pkey" PRIMARY KEY ("usuario_id","area_id")
);

-- CreateTable
CREATE TABLE "sessoes" (
    "id" UUID NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "estado" "estado_sessao" NOT NULL,
    "falhas_mfa" SMALLINT NOT NULL DEFAULT 0,
    "criada_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimo_uso_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expira_em" TIMESTAMPTZ(3) NOT NULL,
    "revogada_em" TIMESTAMPTZ(3),
    "motivo_revogacao" VARCHAR(40),
    "ip" VARCHAR(45),
    "user_agent" VARCHAR(256),

    CONSTRAINT "sessoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "falhas_login" (
    "id" SERIAL NOT NULL,
    "login_normalizado" VARCHAR(64) NOT NULL,
    "ip" VARCHAR(45) NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "falhas_login_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "codigos_recuperacao" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "codigo_hash" CHAR(64) NOT NULL,
    "usado_em" TIMESTAMPTZ(3),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "codigos_recuperacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditoria" (
    "id" SERIAL NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ator_tipo" "ator_auditoria" NOT NULL,
    "ator_id" INTEGER,
    "acao" VARCHAR(60) NOT NULL,
    "entidade" VARCHAR(60) NOT NULL,
    "entidade_id" VARCHAR(40),
    "ip" VARCHAR(45),
    "user_agent" VARCHAR(256),
    "request_id" VARCHAR(64),
    "dados" JSONB,

    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "presencas_usuarios" (
    "usuario_id" INTEGER NOT NULL,
    "estado_manual" "presenca_manual",
    "manual_ate" TIMESTAMPTZ(3),
    "ultimo_visto_em" TIMESTAMPTZ(3),
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "presencas_usuarios_pkey" PRIMARY KEY ("usuario_id")
);

-- CreateTable
CREATE TABLE "preferencias_notificacao" (
    "usuario_id" INTEGER NOT NULL,
    "tipo" "tipo_notificacao" NOT NULL,
    "in_app" BOOLEAN NOT NULL,
    "desktop" BOOLEAN NOT NULL,

    CONSTRAINT "preferencias_notificacao_pkey" PRIMARY KEY ("usuario_id","tipo")
);

-- CreateTable
CREATE TABLE "prioridades" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(60) NOT NULL,
    "cor" CHAR(7) NOT NULL DEFAULT '#888888',
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "padrao" BOOLEAN NOT NULL DEFAULT false,
    "sla_resposta_min" INTEGER,
    "sla_solucao_min" INTEGER,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "prioridades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(60) NOT NULL,
    "tipo" "tipo_status" NOT NULL DEFAULT 'EM_ATENDIMENTO',
    "papel" "papel_status",
    "cor" CHAR(7) NOT NULL DEFAULT '#888888',
    "pausa_sla" BOOLEAN NOT NULL DEFAULT false,
    "ignorado" BOOLEAN NOT NULL DEFAULT false,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "problemas" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "descricao" VARCHAR(500),
    "area_padrao_id" INTEGER,
    "sla_resposta_min" INTEGER,
    "sla_solucao_min" INTEGER,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "problemas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "problema_areas" (
    "problema_id" INTEGER NOT NULL,
    "area_id" INTEGER NOT NULL,

    CONSTRAINT "problema_areas_pkey" PRIMARY KEY ("problema_id","area_id")
);

-- CreateTable
CREATE TABLE "canais" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(60) NOT NULL,
    "sistema" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "canais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(30) NOT NULL,
    "nome_normalizado" VARCHAR(30) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jornadas" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(80) NOT NULL,
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'America/Sao_Paulo',
    "ininterrupta" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jornadas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jornada_horarios" (
    "id" SERIAL NOT NULL,
    "jornada_id" INTEGER NOT NULL,
    "dia_semana" SMALLINT NOT NULL,
    "inicio_min" SMALLINT NOT NULL,
    "fim_min" SMALLINT NOT NULL,

    CONSTRAINT "jornada_horarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feriados" (
    "id" SERIAL NOT NULL,
    "data" DATE NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "recorrente" BOOLEAN NOT NULL DEFAULT false,
    "jornada_id" INTEGER,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feriados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chamados" (
    "id" SERIAL NOT NULL,
    "assunto" VARCHAR(150) NOT NULL,
    "descricao" TEXT NOT NULL,
    "solucao" TEXT,
    "descricao_tecnica" TEXT,
    "contato" VARCHAR(120),
    "contato_email" VARCHAR(254),
    "telefone" VARCHAR(30),
    "solicitante_id" INTEGER NOT NULL,
    "aberto_por_id" INTEGER NOT NULL,
    "operador_id" INTEGER,
    "area_id" INTEGER NOT NULL,
    "problema_id" INTEGER,
    "prioridade_id" INTEGER NOT NULL,
    "canal_id" INTEGER NOT NULL,
    "status_id" INTEGER NOT NULL,
    "status_tipo" "tipo_status" NOT NULL,
    "status_desde" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "departamento_id" INTEGER,
    "ativo_id" INTEGER,
    "aberto_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "agendado_para" TIMESTAMPTZ(3),
    "primeira_resposta_em" TIMESTAMPTZ(3),
    "concluido_em" TIMESTAMPTZ(3),
    "encerrado_em" TIMESTAMPTZ(3),
    "validacao_limite_em" TIMESTAMPTZ(3),
    "cancelado" BOOLEAN NOT NULL DEFAULT false,
    "rejeicoes" INTEGER NOT NULL DEFAULT 0,
    "jornada_id" INTEGER NOT NULL,
    "sla_resposta_min" INTEGER,
    "sla_solucao_min" INTEGER,
    "prazo_resposta_em" TIMESTAMPTZ(3),
    "alerta_resposta_em" TIMESTAMPTZ(3),
    "prazo_solucao_em" TIMESTAMPTZ(3),
    "alerta_solucao_em" TIMESTAMPTZ(3),
    "sla_pausado" BOOLEAN NOT NULL DEFAULT false,
    "sla_pausado_seg" INTEGER NOT NULL DEFAULT 0,
    "sla_resposta_cumprido" BOOLEAN,
    "sla_solucao_cumprido" BOOLEAN,
    "tempo_resposta_util_min" INTEGER,
    "tempo_solucao_util_min" INTEGER,
    "sla_aviso_risco_em" TIMESTAMPTZ(3),
    "sla_aviso_estouro_em" TIMESTAMPTZ(3),
    "sla_aviso_resposta_em" TIMESTAMPTZ(3),
    "ultimo_assentamento_id" INTEGER,
    "ultimo_assentamento_publico_id" INTEGER,
    "ultima_interacao_em" TIMESTAMPTZ(3),
    "ultima_interacao_autor_id" INTEGER,
    "ultima_atividade_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "versao" INTEGER NOT NULL DEFAULT 0,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "busca_norm" TEXT,

    CONSTRAINT "chamados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chamado_estagios" (
    "id" SERIAL NOT NULL,
    "chamado_id" INTEGER NOT NULL,
    "status_id" INTEGER NOT NULL,
    "status_tipo" "tipo_status" NOT NULL,
    "pausa_sla" BOOLEAN NOT NULL,
    "inicio_em" TIMESTAMPTZ(3) NOT NULL,
    "fim_em" TIMESTAMPTZ(3) NOT NULL,
    "operador_id" INTEGER,
    "autor_id" INTEGER,

    CONSTRAINT "chamado_estagios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chamado_eventos" (
    "id" SERIAL NOT NULL,
    "chamado_id" INTEGER NOT NULL,
    "tipo" "tipo_evento" NOT NULL,
    "ator_id" INTEGER,
    "assentamento_id" INTEGER,
    "interno" BOOLEAN NOT NULL DEFAULT false,
    "dados" JSONB NOT NULL DEFAULT '{}',
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processado_em" TIMESTAMPTZ(3),

    CONSTRAINT "chamado_eventos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assentamentos" (
    "id" SERIAL NOT NULL,
    "chamado_id" INTEGER NOT NULL,
    "autor_id" INTEGER,
    "tipo" "tipo_assentamento" NOT NULL DEFAULT 'COMENTARIO',
    "interno" BOOLEAN NOT NULL DEFAULT false,
    "texto" TEXT NOT NULL,
    "evento" "tipo_evento",
    "dados" JSONB,
    "cliente_id" UUID,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assentamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mencoes" (
    "assentamento_id" INTEGER NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "chamado_id" INTEGER NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mencoes_pkey" PRIMARY KEY ("assentamento_id","usuario_id")
);

-- CreateTable
CREATE TABLE "chamado_seguidores" (
    "chamado_id" INTEGER NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "motivo" "motivo_seguir" NOT NULL,
    "silenciado_em" TIMESTAMPTZ(3),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chamado_seguidores_pkey" PRIMARY KEY ("chamado_id","usuario_id")
);

-- CreateTable
CREATE TABLE "chamado_leituras" (
    "chamado_id" INTEGER NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "ultimo_assentamento_lido_id" INTEGER NOT NULL,
    "lido_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chamado_leituras_pkey" PRIMARY KEY ("chamado_id","usuario_id")
);

-- CreateTable
CREATE TABLE "chamado_tags" (
    "chamado_id" INTEGER NOT NULL,
    "tag_id" INTEGER NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chamado_tags_pkey" PRIMARY KEY ("chamado_id","tag_id")
);

-- CreateTable
CREATE TABLE "anexos" (
    "id" UUID NOT NULL,
    "chamado_id" INTEGER NOT NULL,
    "assentamento_id" INTEGER,
    "enviado_por_id" INTEGER NOT NULL,
    "nome_original" VARCHAR(200) NOT NULL,
    "mime" VARCHAR(127) NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "storage_chave" VARCHAR(64) NOT NULL,
    "interno" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anexos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "avaliacoes" (
    "chamado_id" INTEGER NOT NULL,
    "avaliador_id" INTEGER,
    "nota" "nota_avaliacao" NOT NULL,
    "comentario" VARCHAR(1000),
    "automatica" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "avaliacoes_pkey" PRIMARY KEY ("chamado_id")
);

-- CreateTable
CREATE TABLE "notificacoes" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "chamado_id" INTEGER NOT NULL,
    "tipo" "tipo_notificacao" NOT NULL,
    "grupo_chave" VARCHAR(160) NOT NULL,
    "evento_id" INTEGER,
    "assentamento_id" INTEGER,
    "ator_ids" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "contagem" INTEGER NOT NULL DEFAULT 1,
    "interno" BOOLEAN NOT NULL DEFAULT false,
    "dados" JSONB NOT NULL DEFAULT '{}',
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lida_em" TIMESTAMPTZ(3),

    CONSTRAINT "notificacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tipos_ativo" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(80) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "tipos_ativo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ativos" (
    "id" SERIAL NOT NULL,
    "etiqueta" VARCHAR(60) NOT NULL,
    "tipo_id" INTEGER NOT NULL,
    "modelo" VARCHAR(120),
    "serie" VARCHAR(100),
    "departamento_id" INTEGER,
    "responsavel_id" INTEGER,
    "responsavel_texto" VARCHAR(120),
    "situacao" "situacao_ativo" NOT NULL DEFAULT 'EM_USO',
    "observacao" TEXT,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "busca_norm" TEXT,

    CONSTRAINT "ativos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorias_artigo" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(100) NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "categorias_artigo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artigos" (
    "id" SERIAL NOT NULL,
    "titulo" VARCHAR(200) NOT NULL,
    "resumo" VARCHAR(500),
    "conteudo" TEXT NOT NULL,
    "categoria_id" INTEGER,
    "situacao" "situacao_artigo" NOT NULL DEFAULT 'RASCUNHO',
    "visibilidade" "visibilidade_artigo" NOT NULL DEFAULT 'PUBLICO',
    "autor_id" INTEGER,
    "visualizacoes" INTEGER NOT NULL DEFAULT 0,
    "publicado_em" TIMESTAMPTZ(3),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "busca" tsvector,
    "busca_norm" TEXT,

    CONSTRAINT "artigos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artigo_problemas" (
    "artigo_id" INTEGER NOT NULL,
    "problema_id" INTEGER NOT NULL,

    CONSTRAINT "artigo_problemas_pkey" PRIMARY KEY ("artigo_id","problema_id")
);

-- CreateTable
CREATE TABLE "artigo_votos" (
    "artigo_id" INTEGER NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "util" BOOLEAN NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artigo_votos_pkey" PRIMARY KEY ("artigo_id","usuario_id")
);

-- CreateTable
CREATE TABLE "config" (
    "chave" VARCHAR(80) NOT NULL,
    "valor" JSONB NOT NULL,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "config_pkey" PRIMARY KEY ("chave")
);

-- CreateIndex
CREATE UNIQUE INDEX "unidades_nome_key" ON "unidades"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "departamentos_unidade_id_nome_key" ON "departamentos"("unidade_id", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "areas_nome_key" ON "areas"("nome");

-- CreateIndex
CREATE INDEX "ix_areas_jornada" ON "areas"("jornada_id");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_login_key" ON "usuarios"("login");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX "ix_usuarios_area" ON "usuarios"("area_id");

-- CreateIndex
CREATE INDEX "ix_usuarios_departamento" ON "usuarios"("departamento_id");

-- CreateIndex
CREATE INDEX "ix_usuarios_busca_norm_trgm" ON "usuarios" USING GIN ("busca_norm" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "ix_usuario_areas_area" ON "usuario_areas"("area_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessoes_token_hash_key" ON "sessoes"("token_hash");

-- CreateIndex
CREATE INDEX "ix_sessoes_usuario_ativas" ON "sessoes"("usuario_id") WHERE (revogada_em IS NULL);

-- CreateIndex
CREATE INDEX "ix_sessoes_expira_em" ON "sessoes"("expira_em");

-- CreateIndex
CREATE INDEX "ix_falhas_login_login" ON "falhas_login"("login_normalizado", "criado_em");

-- CreateIndex
CREATE INDEX "ix_falhas_login_ip" ON "falhas_login"("ip", "criado_em");

-- CreateIndex
CREATE INDEX "ix_codigos_recuperacao_usuario" ON "codigos_recuperacao"("usuario_id");

-- CreateIndex
CREATE INDEX "ix_auditoria_criado_em_brin" ON "auditoria" USING BRIN ("criado_em");

-- CreateIndex
CREATE INDEX "ix_auditoria_entidade" ON "auditoria"("entidade", "entidade_id");

-- CreateIndex
CREATE INDEX "ix_auditoria_ator" ON "auditoria"("ator_id", "criado_em" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "prioridades_nome_key" ON "prioridades"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "status_nome_key" ON "status"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "status_papel_key" ON "status"("papel");

-- CreateIndex
CREATE UNIQUE INDEX "uq_status_id_tipo" ON "status"("id", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "problemas_nome_key" ON "problemas"("nome");

-- CreateIndex
CREATE INDEX "ix_problemas_area_padrao" ON "problemas"("area_padrao_id");

-- CreateIndex
CREATE INDEX "ix_problema_areas_area" ON "problema_areas"("area_id");

-- CreateIndex
CREATE UNIQUE INDEX "canais_nome_key" ON "canais"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "tags_nome_normalizado_key" ON "tags"("nome_normalizado");

-- CreateIndex
CREATE UNIQUE INDEX "jornadas_nome_key" ON "jornadas"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "jornada_horarios_jornada_id_dia_semana_inicio_min_key" ON "jornada_horarios"("jornada_id", "dia_semana", "inicio_min");

-- CreateIndex
CREATE INDEX "ix_feriados_data" ON "feriados"("data");

-- CreateIndex
CREATE INDEX "ix_feriados_jornada" ON "feriados"("jornada_id");

-- CreateIndex
CREATE INDEX "ix_chamados_solicitante" ON "chamados"("solicitante_id", "id" DESC);

-- CreateIndex
CREATE INDEX "ix_chamados_aberto_por" ON "chamados"("aberto_por_id");

-- CreateIndex
CREATE INDEX "ix_chamados_area_tipo" ON "chamados"("area_id", "status_tipo", "id" DESC);

-- CreateIndex
CREATE INDEX "ix_chamados_operador_tipo" ON "chamados"("operador_id", "status_tipo", "id" DESC);

-- CreateIndex
CREATE INDEX "ix_chamados_status" ON "chamados"("status_id", "id" DESC);

-- CreateIndex
CREATE INDEX "ix_chamados_area_em_aberto" ON "chamados"("area_id", "id" DESC) WHERE (concluido_em IS NULL);

-- CreateIndex
CREATE INDEX "ix_chamados_operador_em_aberto" ON "chamados"("operador_id", "id" DESC) WHERE (concluido_em IS NULL);

-- CreateIndex
CREATE INDEX "ix_chamados_fila" ON "chamados"("area_id", "aberto_em") WHERE (concluido_em IS NULL AND operador_id IS NULL);

-- CreateIndex
CREATE INDEX "ix_chamados_prazo_solucao" ON "chamados"("prazo_solucao_em") WHERE (concluido_em IS NULL AND prazo_solucao_em IS NOT NULL);

-- CreateIndex
CREATE INDEX "ix_chamados_alerta_solucao" ON "chamados"("alerta_solucao_em") WHERE (concluido_em IS NULL AND alerta_solucao_em IS NOT NULL);

-- CreateIndex
CREATE INDEX "ix_chamados_prazo_resposta" ON "chamados"("prazo_resposta_em") WHERE (primeira_resposta_em IS NULL AND prazo_resposta_em IS NOT NULL);

-- CreateIndex
CREATE INDEX "ix_chamados_agendados" ON "chamados"("agendado_para") WHERE (agendado_para IS NOT NULL);

-- CreateIndex
CREATE INDEX "ix_chamados_validacao" ON "chamados"("validacao_limite_em") WHERE (validacao_limite_em IS NOT NULL);

-- CreateIndex
CREATE INDEX "ix_chamados_jornada_em_aberto" ON "chamados"("jornada_id") WHERE (concluido_em IS NULL);

-- CreateIndex
CREATE INDEX "ix_chamados_aberto_em" ON "chamados"("aberto_em");

-- CreateIndex
CREATE INDEX "ix_chamados_encerrado_em" ON "chamados"("encerrado_em") WHERE (encerrado_em IS NOT NULL);

-- CreateIndex
CREATE INDEX "ix_chamados_problema" ON "chamados"("problema_id");

-- CreateIndex
CREATE INDEX "ix_chamados_ativo" ON "chamados"("ativo_id", "id" DESC) WHERE (ativo_id IS NOT NULL);

-- CreateIndex
CREATE INDEX "ix_chamados_busca_norm_trgm" ON "chamados" USING GIN ("busca_norm" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "ix_estagios_chamado" ON "chamado_estagios"("chamado_id", "inicio_em");

-- CreateIndex
CREATE INDEX "ix_estagios_status" ON "chamado_estagios"("status_id");

-- CreateIndex
CREATE INDEX "ix_eventos_chamado" ON "chamado_eventos"("chamado_id", "id");

-- CreateIndex
CREATE INDEX "ix_eventos_pendentes" ON "chamado_eventos"("id") WHERE (processado_em IS NULL);

-- CreateIndex
CREATE INDEX "ix_assentamentos_chamado" ON "assentamentos"("chamado_id", "id");

-- CreateIndex
CREATE INDEX "ix_assentamentos_autor" ON "assentamentos"("autor_id", "criado_em");

-- CreateIndex
CREATE UNIQUE INDEX "assentamentos_autor_id_cliente_id_key" ON "assentamentos"("autor_id", "cliente_id");

-- CreateIndex
CREATE INDEX "ix_mencoes_usuario" ON "mencoes"("usuario_id");

-- CreateIndex
CREATE INDEX "ix_mencoes_chamado" ON "mencoes"("chamado_id");

-- CreateIndex
CREATE INDEX "ix_seguidores_usuario" ON "chamado_seguidores"("usuario_id");

-- CreateIndex
CREATE INDEX "ix_leituras_usuario" ON "chamado_leituras"("usuario_id");

-- CreateIndex
CREATE INDEX "ix_chamado_tags_tag" ON "chamado_tags"("tag_id", "chamado_id");

-- CreateIndex
CREATE UNIQUE INDEX "anexos_storage_chave_key" ON "anexos"("storage_chave");

-- CreateIndex
CREATE INDEX "ix_anexos_chamado" ON "anexos"("chamado_id");

-- CreateIndex
CREATE INDEX "ix_anexos_assentamento" ON "anexos"("assentamento_id");

-- CreateIndex
CREATE INDEX "ix_avaliacoes_criado_em" ON "avaliacoes"("criado_em");

-- CreateIndex
CREATE INDEX "ix_notificacoes_feed" ON "notificacoes"("usuario_id", "atualizado_em" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "ix_notificacoes_nao_lidas" ON "notificacoes"("usuario_id", "chamado_id") WHERE (lida_em IS NULL);

-- CreateIndex
CREATE INDEX "ix_notificacoes_chamado" ON "notificacoes"("chamado_id");

-- CreateIndex
CREATE INDEX "ix_notificacoes_lida_em" ON "notificacoes"("lida_em") WHERE (lida_em IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "notificacoes_usuario_id_grupo_chave_key" ON "notificacoes"("usuario_id", "grupo_chave");

-- CreateIndex
CREATE UNIQUE INDEX "tipos_ativo_nome_key" ON "tipos_ativo"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "ativos_etiqueta_key" ON "ativos"("etiqueta");

-- CreateIndex
CREATE INDEX "ix_ativos_tipo" ON "ativos"("tipo_id");

-- CreateIndex
CREATE INDEX "ix_ativos_situacao" ON "ativos"("situacao");

-- CreateIndex
CREATE INDEX "ix_ativos_departamento" ON "ativos"("departamento_id");

-- CreateIndex
CREATE INDEX "ix_ativos_responsavel" ON "ativos"("responsavel_id");

-- CreateIndex
CREATE INDEX "ix_ativos_busca_norm_trgm" ON "ativos" USING GIN ("busca_norm" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "categorias_artigo_nome_key" ON "categorias_artigo"("nome");

-- CreateIndex
CREATE INDEX "ix_artigos_situacao" ON "artigos"("situacao", "visibilidade");

-- CreateIndex
CREATE INDEX "ix_artigos_categoria" ON "artigos"("categoria_id");

-- CreateIndex
CREATE INDEX "ix_artigos_busca" ON "artigos" USING GIN ("busca");

-- CreateIndex
CREATE INDEX "ix_artigos_busca_norm_trgm" ON "artigos" USING GIN ("busca_norm" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "ix_artigo_problemas_problema" ON "artigo_problemas"("problema_id");

-- AddForeignKey
ALTER TABLE "departamentos" ADD CONSTRAINT "departamentos_unidade_id_fkey" FOREIGN KEY ("unidade_id") REFERENCES "unidades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "areas" ADD CONSTRAINT "areas_jornada_id_fkey" FOREIGN KEY ("jornada_id") REFERENCES "jornadas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_departamento_id_fkey" FOREIGN KEY ("departamento_id") REFERENCES "departamentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_areas" ADD CONSTRAINT "usuario_areas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_areas" ADD CONSTRAINT "usuario_areas_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "codigos_recuperacao" ADD CONSTRAINT "codigos_recuperacao_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_ator_id_fkey" FOREIGN KEY ("ator_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presencas_usuarios" ADD CONSTRAINT "presencas_usuarios_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preferencias_notificacao" ADD CONSTRAINT "preferencias_notificacao_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problemas" ADD CONSTRAINT "problemas_area_padrao_id_fkey" FOREIGN KEY ("area_padrao_id") REFERENCES "areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problema_areas" ADD CONSTRAINT "problema_areas_problema_id_fkey" FOREIGN KEY ("problema_id") REFERENCES "problemas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problema_areas" ADD CONSTRAINT "problema_areas_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jornada_horarios" ADD CONSTRAINT "jornada_horarios_jornada_id_fkey" FOREIGN KEY ("jornada_id") REFERENCES "jornadas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feriados" ADD CONSTRAINT "feriados_jornada_id_fkey" FOREIGN KEY ("jornada_id") REFERENCES "jornadas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_solicitante_id_fkey" FOREIGN KEY ("solicitante_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_aberto_por_id_fkey" FOREIGN KEY ("aberto_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_operador_id_fkey" FOREIGN KEY ("operador_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_problema_id_fkey" FOREIGN KEY ("problema_id") REFERENCES "problemas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_prioridade_id_fkey" FOREIGN KEY ("prioridade_id") REFERENCES "prioridades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_canal_id_fkey" FOREIGN KEY ("canal_id") REFERENCES "canais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_status_id_status_tipo_fkey" FOREIGN KEY ("status_id", "status_tipo") REFERENCES "status"("id", "tipo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_departamento_id_fkey" FOREIGN KEY ("departamento_id") REFERENCES "departamentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_ativo_id_fkey" FOREIGN KEY ("ativo_id") REFERENCES "ativos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_jornada_id_fkey" FOREIGN KEY ("jornada_id") REFERENCES "jornadas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chamado_estagios" ADD CONSTRAINT "chamado_estagios_chamado_id_fkey" FOREIGN KEY ("chamado_id") REFERENCES "chamados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chamado_estagios" ADD CONSTRAINT "chamado_estagios_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "status"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chamado_estagios" ADD CONSTRAINT "chamado_estagios_operador_id_fkey" FOREIGN KEY ("operador_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chamado_estagios" ADD CONSTRAINT "chamado_estagios_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chamado_eventos" ADD CONSTRAINT "chamado_eventos_chamado_id_fkey" FOREIGN KEY ("chamado_id") REFERENCES "chamados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chamado_eventos" ADD CONSTRAINT "chamado_eventos_ator_id_fkey" FOREIGN KEY ("ator_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chamado_eventos" ADD CONSTRAINT "chamado_eventos_assentamento_id_fkey" FOREIGN KEY ("assentamento_id") REFERENCES "assentamentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assentamentos" ADD CONSTRAINT "assentamentos_chamado_id_fkey" FOREIGN KEY ("chamado_id") REFERENCES "chamados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assentamentos" ADD CONSTRAINT "assentamentos_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mencoes" ADD CONSTRAINT "mencoes_assentamento_id_fkey" FOREIGN KEY ("assentamento_id") REFERENCES "assentamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mencoes" ADD CONSTRAINT "mencoes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mencoes" ADD CONSTRAINT "mencoes_chamado_id_fkey" FOREIGN KEY ("chamado_id") REFERENCES "chamados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chamado_seguidores" ADD CONSTRAINT "chamado_seguidores_chamado_id_fkey" FOREIGN KEY ("chamado_id") REFERENCES "chamados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chamado_seguidores" ADD CONSTRAINT "chamado_seguidores_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chamado_leituras" ADD CONSTRAINT "chamado_leituras_chamado_id_fkey" FOREIGN KEY ("chamado_id") REFERENCES "chamados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chamado_leituras" ADD CONSTRAINT "chamado_leituras_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chamado_tags" ADD CONSTRAINT "chamado_tags_chamado_id_fkey" FOREIGN KEY ("chamado_id") REFERENCES "chamados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chamado_tags" ADD CONSTRAINT "chamado_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anexos" ADD CONSTRAINT "anexos_chamado_id_fkey" FOREIGN KEY ("chamado_id") REFERENCES "chamados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anexos" ADD CONSTRAINT "anexos_assentamento_id_fkey" FOREIGN KEY ("assentamento_id") REFERENCES "assentamentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anexos" ADD CONSTRAINT "anexos_enviado_por_id_fkey" FOREIGN KEY ("enviado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avaliacoes" ADD CONSTRAINT "avaliacoes_chamado_id_fkey" FOREIGN KEY ("chamado_id") REFERENCES "chamados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avaliacoes" ADD CONSTRAINT "avaliacoes_avaliador_id_fkey" FOREIGN KEY ("avaliador_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_chamado_id_fkey" FOREIGN KEY ("chamado_id") REFERENCES "chamados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_evento_id_fkey" FOREIGN KEY ("evento_id") REFERENCES "chamado_eventos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_assentamento_id_fkey" FOREIGN KEY ("assentamento_id") REFERENCES "assentamentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ativos" ADD CONSTRAINT "ativos_tipo_id_fkey" FOREIGN KEY ("tipo_id") REFERENCES "tipos_ativo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ativos" ADD CONSTRAINT "ativos_departamento_id_fkey" FOREIGN KEY ("departamento_id") REFERENCES "departamentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ativos" ADD CONSTRAINT "ativos_responsavel_id_fkey" FOREIGN KEY ("responsavel_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artigos" ADD CONSTRAINT "artigos_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias_artigo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artigos" ADD CONSTRAINT "artigos_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artigo_problemas" ADD CONSTRAINT "artigo_problemas_artigo_id_fkey" FOREIGN KEY ("artigo_id") REFERENCES "artigos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artigo_problemas" ADD CONSTRAINT "artigo_problemas_problema_id_fkey" FOREIGN KEY ("problema_id") REFERENCES "problemas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artigo_votos" ADD CONSTRAINT "artigo_votos_artigo_id_fkey" FOREIGN KEY ("artigo_id") REFERENCES "artigos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artigo_votos" ADD CONSTRAINT "artigo_votos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
