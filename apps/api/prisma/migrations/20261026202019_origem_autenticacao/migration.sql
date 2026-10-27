-- CreateEnum
CREATE TYPE "origem_autenticacao" AS ENUM ('LOCAL', 'LDAP');

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "origem_autenticacao" "origem_autenticacao" NOT NULL DEFAULT 'LOCAL';
