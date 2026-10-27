-- AlterTable
ALTER TABLE "problemas" ADD COLUMN     "categoria1_id" INTEGER,
ADD COLUMN     "categoria2_id" INTEGER,
ADD COLUMN     "categoria3_id" INTEGER;

-- CreateTable
CREATE TABLE "categorias" (
    "id" SERIAL NOT NULL,
    "grupo" SMALLINT NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "categorias_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_categorias_grupo" CHECK ("grupo" BETWEEN 1 AND 3)
);

-- CreateIndex
CREATE UNIQUE INDEX "ux_categorias_grupo_nome" ON "categorias"("grupo", "nome");

-- CreateIndex
CREATE INDEX "ix_problemas_categoria1" ON "problemas"("categoria1_id");

-- CreateIndex
CREATE INDEX "ix_problemas_categoria2" ON "problemas"("categoria2_id");

-- CreateIndex
CREATE INDEX "ix_problemas_categoria3" ON "problemas"("categoria3_id");

-- AddForeignKey
ALTER TABLE "problemas" ADD CONSTRAINT "problemas_categoria1_id_fkey" FOREIGN KEY ("categoria1_id") REFERENCES "categorias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problemas" ADD CONSTRAINT "problemas_categoria2_id_fkey" FOREIGN KEY ("categoria2_id") REFERENCES "categorias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problemas" ADD CONSTRAINT "problemas_categoria3_id_fkey" FOREIGN KEY ("categoria3_id") REFERENCES "categorias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
