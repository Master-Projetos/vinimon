-- CreateTable
CREATE TABLE "modelos_email" (
    "evento" TEXT NOT NULL,
    "assunto" VARCHAR(200) NOT NULL,
    "corpo_texto" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "modelos_email_pkey" PRIMARY KEY ("evento")
);
