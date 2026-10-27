-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "pode_encaminhar" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "pode_receber" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "chamado_auxiliares" (
    "chamado_id" INTEGER NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chamado_auxiliares_pkey" PRIMARY KEY ("chamado_id","usuario_id")
);

-- CreateIndex
CREATE INDEX "ix_chamado_auxiliares_usuario" ON "chamado_auxiliares"("usuario_id");

-- AddForeignKey
ALTER TABLE "chamado_auxiliares" ADD CONSTRAINT "chamado_auxiliares_chamado_id_fkey" FOREIGN KEY ("chamado_id") REFERENCES "chamados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chamado_auxiliares" ADD CONSTRAINT "chamado_auxiliares_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
