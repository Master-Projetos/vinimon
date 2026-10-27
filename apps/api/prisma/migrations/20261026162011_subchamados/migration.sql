-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "tipo_evento" ADD VALUE 'SUBCHAMADO_VINCULADO';
ALTER TYPE "tipo_evento" ADD VALUE 'SUBCHAMADO_DESVINCULADO';

-- AlterTable
ALTER TABLE "chamados" ADD COLUMN     "chamado_pai_id" INTEGER;

-- CreateIndex
CREATE INDEX "ix_chamados_pai" ON "chamados"("chamado_pai_id") WHERE (chamado_pai_id IS NOT NULL);

-- AddForeignKey
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_chamado_pai_id_fkey" FOREIGN KEY ("chamado_pai_id") REFERENCES "chamados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- um chamado nunca é pai de si mesmo
ALTER TABLE "chamados" ADD CONSTRAINT "ck_chamados_pai_distinto" CHECK ("chamado_pai_id" <> "id");
