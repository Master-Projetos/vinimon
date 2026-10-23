-- CreateEnum
CREATE TYPE "status_email" AS ENUM ('PENDENTE', 'ENVIADO', 'FALHOU');

-- CreateTable
CREATE TABLE "emails_saida" (
    "id" SERIAL NOT NULL,
    "para" VARCHAR(254) NOT NULL,
    "assunto" VARCHAR(300) NOT NULL,
    "texto" TEXT NOT NULL,
    "html" TEXT,
    "evento" VARCHAR(60) NOT NULL,
    "chamado_id" INTEGER,
    "usuario_id" INTEGER,
    "chave_idempotencia" TEXT NOT NULL,
    "status" "status_email" NOT NULL DEFAULT 'PENDENTE',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "erro" VARCHAR(1000),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviado_em" TIMESTAMPTZ(3),

    CONSTRAINT "emails_saida_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "emails_saida_chave_idempotencia_key" ON "emails_saida"("chave_idempotencia");

-- CreateIndex
CREATE INDEX "ix_emails_saida_status_criado_em" ON "emails_saida"("status", "criado_em");
