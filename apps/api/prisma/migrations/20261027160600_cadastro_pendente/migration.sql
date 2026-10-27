-- CreateTable
CREATE TABLE "cadastros_pendentes" (
    "id" SERIAL NOT NULL,
    "login" VARCHAR(64) NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "departamento_id" INTEGER,
    "token_hash" CHAR(64) NOT NULL,
    "confirmado_em" TIMESTAMPTZ(3),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cadastros_pendentes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cadastros_pendentes_token_hash_key" ON "cadastros_pendentes"("token_hash");

-- CreateIndex
CREATE INDEX "ix_cadastros_pendentes_login" ON "cadastros_pendentes"("login");

-- CreateIndex
CREATE INDEX "ix_cadastros_pendentes_email" ON "cadastros_pendentes"("email");

-- AddForeignKey
ALTER TABLE "cadastros_pendentes" ADD CONSTRAINT "cadastros_pendentes_departamento_id_fkey" FOREIGN KEY ("departamento_id") REFERENCES "departamentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
