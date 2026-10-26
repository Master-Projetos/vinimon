-- CreateTable
CREATE TABLE "area_destinos" (
    "area_origem_id" INTEGER NOT NULL,
    "area_destino_id" INTEGER NOT NULL,
    "padrao" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "area_destinos_pkey" PRIMARY KEY ("area_origem_id","area_destino_id")
);

-- CreateIndex
CREATE INDEX "ix_area_destinos_destino" ON "area_destinos"("area_destino_id");

-- CreateIndex
CREATE UNIQUE INDEX "ux_area_destinos_padrao" ON "area_destinos"("area_origem_id") WHERE (padrao);

-- AddForeignKey
ALTER TABLE "area_destinos" ADD CONSTRAINT "area_destinos_area_origem_id_fkey" FOREIGN KEY ("area_origem_id") REFERENCES "areas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "area_destinos" ADD CONSTRAINT "area_destinos_area_destino_id_fkey" FOREIGN KEY ("area_destino_id") REFERENCES "areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
