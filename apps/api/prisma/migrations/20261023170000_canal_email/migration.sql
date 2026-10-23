-- CreateEnum
CREATE TYPE "canal_email" AS ENUM ('NUNCA', 'IMEDIATO', 'RESUMO');

-- AlterTable
ALTER TABLE "preferencias_notificacao" ADD COLUMN     "email" "canal_email";
