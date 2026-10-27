-- CreateIndex
CREATE INDEX "ix_chamados_status_tipo" ON "chamados"("status_tipo", "id" DESC);
