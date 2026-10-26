-- CreateTable
CREATE TABLE "area_gerentes" (
    "area_id" INTEGER NOT NULL,
    "usuario_id" INTEGER NOT NULL,

    CONSTRAINT "area_gerentes_pkey" PRIMARY KEY ("area_id","usuario_id")
);

-- CreateIndex
CREATE INDEX "ix_area_gerentes_usuario" ON "area_gerentes"("usuario_id");

-- AddForeignKey
ALTER TABLE "area_gerentes" ADD CONSTRAINT "area_gerentes_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "area_gerentes" ADD CONSTRAINT "area_gerentes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
