-- AlterTable
ALTER TABLE "modelos_email" ADD COLUMN     "lista_ids" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- CreateTable
CREATE TABLE "listas_email" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "emails" VARCHAR(254)[],
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listas_email_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "listas_email_nome_key" ON "listas_email"("nome");
