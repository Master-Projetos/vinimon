-- CreateEnum
CREATE TYPE "tipo_campo" AS ENUM ('TEXTO', 'NUMERO', 'SELECAO', 'SELECAO_MULTIPLA', 'DATA', 'HORA', 'DATA_HORA', 'AREA_TEXTO', 'CHECKBOX');

-- CreateEnum
CREATE TYPE "visibilidade_campo" AS ENUM ('ABERTURA', 'SO_EDICAO', 'OCULTO_SOLICITANTE');

-- CreateTable
CREATE TABLE "campos_personalizados" (
    "id" SERIAL NOT NULL,
    "chave" VARCHAR(60) NOT NULL,
    "rotulo" VARCHAR(120) NOT NULL,
    "tipo" "tipo_campo" NOT NULL,
    "opcoes" TEXT[],
    "obrigatorio" BOOLEAN NOT NULL DEFAULT false,
    "regex" VARCHAR(100),
    "ajuda" VARCHAR(300),
    "visibilidade" "visibilidade_campo" NOT NULL DEFAULT 'ABERTURA',
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "campos_personalizados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campo_problemas" (
    "campo_id" INTEGER NOT NULL,
    "problema_id" INTEGER NOT NULL,
    "obrigatorio" BOOLEAN,

    CONSTRAINT "campo_problemas_pkey" PRIMARY KEY ("campo_id","problema_id")
);

-- CreateTable
CREATE TABLE "chamado_campo_valores" (
    "chamado_id" INTEGER NOT NULL,
    "campo_id" INTEGER NOT NULL,
    "valor_texto" TEXT,
    "valor_numero" DECIMAL(18,4),
    "valor_data" TIMESTAMPTZ(3),
    "valor_opcoes" TEXT[],

    CONSTRAINT "chamado_campo_valores_pkey" PRIMARY KEY ("chamado_id","campo_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "campos_personalizados_chave_key" ON "campos_personalizados"("chave");

-- CreateIndex
CREATE INDEX "ix_campo_problemas_problema" ON "campo_problemas"("problema_id");

-- CreateIndex
CREATE INDEX "ix_chamado_campo_valores_campo" ON "chamado_campo_valores"("campo_id");

-- AddForeignKey
ALTER TABLE "campo_problemas" ADD CONSTRAINT "campo_problemas_campo_id_fkey" FOREIGN KEY ("campo_id") REFERENCES "campos_personalizados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campo_problemas" ADD CONSTRAINT "campo_problemas_problema_id_fkey" FOREIGN KEY ("problema_id") REFERENCES "problemas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chamado_campo_valores" ADD CONSTRAINT "chamado_campo_valores_chamado_id_fkey" FOREIGN KEY ("chamado_id") REFERENCES "chamados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chamado_campo_valores" ADD CONSTRAINT "chamado_campo_valores_campo_id_fkey" FOREIGN KEY ("campo_id") REFERENCES "campos_personalizados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- chave estável: minúscula, dígitos e _
ALTER TABLE "campos_personalizados" ADD CONSTRAINT "ck_campos_chave" CHECK ("chave" ~ '^[a-z][a-z0-9_]{1,59}$');
