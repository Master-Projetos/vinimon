-- CreateTable
CREATE TABLE "tokens_senha" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expira_em" TIMESTAMPTZ(3) NOT NULL,
    "usado_em" TIMESTAMPTZ(3),
    "ip" VARCHAR(45),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tokens_senha_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tokens_senha_token_hash_key" ON "tokens_senha"("token_hash");

-- CreateIndex
CREATE INDEX "ix_tokens_senha_usuario" ON "tokens_senha"("usuario_id");

-- AddForeignKey
ALTER TABLE "tokens_senha" ADD CONSTRAINT "tokens_senha_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
