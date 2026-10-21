> Parte B (tarefas). Antes de executar qualquer tarefa leia `CLAUDE.md`, `docs/plano/tarefas/00-convencoes.md` e as seções da Parte A citadas no cartão (mapa §→arquivo em `docs/plano/README.md`).

### Fase 0 — Repositório e ferramentas

### T-0.1 — Mover a v1 para `legado/`, tirar os `.db` do git e criar o `.gitignore`
- **Depende de:** — · **Paralelo com:** —
- **Requisitos:** S1, S2; §3.1, §3.12 (`.gitignore`)
- **Arquivos:** `legado/v1/{server.js,db.js,public/,iniciar.bat,package.json,README.md}` (via `git mv`), `.gitignore`
- **Passos:**
  1. Backup fora do repositório, antes de tudo: `mkdir -p ../vinimon-backup-v1 && cp -p data/* ../vinimon-backup-v1/ && sha256sum ../vinimon-backup-v1/* > ../vinimon-backup-v1/SHA256SUMS`.
  2. `mkdir -p legado/v1 && git mv server.js db.js public iniciar.bat package.json README.md legado/v1/`.
  3. `git rm --cached data/VINIMON.db data/VINIMON.db-wal data/VINIMON.db-shm data/ocomon.db data/ocomon.db-wal data/ocomon.db-shm`. Os arquivos continuam no disco.
  4. Criar `.gitignore` com o conteúdo exato da §3.12.
- **Pronto quando:**
  - [ ] `git ls-files | grep -E '\.(db|db-wal|db-shm)$'` vazio;
  - [ ] `ls data/` ainda lista os 6 arquivos;
  - [ ] `sha256sum -c ../vinimon-backup-v1/SHA256SUMS` OK;
  - [ ] `ls docs/plano/relatorios | wc -l` dá 6;
  - [ ] `cd legado/v1 && VINIMON_DB=../../data/VINIMON.db node server.js` sobe na porta 3000 (Ctrl+C).
  - `pnpm verificar` ainda não existe nesta tarefa.
- **Modelo:** Haiku
- **Tamanho:** P

### T-0.2 — Raiz do monorepo
- **Depende de:** T-0.1 · **Paralelo com:** T-0.3
- **Requisitos:** S109, S112, S113; §2.1, §3.12
- **Arquivos:** `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `biome.json`, `.nvmrc` (`24`), `renovate.json`
- **Passos:**
  1. Copiar literalmente os conteúdos da §3.12.
  2. `corepack enable && corepack prepare pnpm@12.14.0 --activate`.
  3. Rodar `pnpm install` para gerar o `pnpm-lock.yaml` e commitá-lo.
  4. Se o pnpm recusar `savePrefix`/`allowBuilds` (chaves não verificadas), troque pela forma que `pnpm help config` indicar e registre no commit.
- **Pronto quando:**
  - [ ] `pnpm install` sem erro;
  - [ ] `pnpm lint` verde;
  - [ ] `pnpm typecheck` verde (sem pacotes).
- **Modelo:** Haiku
- **Tamanho:** P

### T-0.3 — Postgres e Mailpit de desenvolvimento
- **Depende de:** T-0.1 · **Paralelo com:** T-0.2
- **Requisitos:** S116; §3.12 (`docker-compose.yml`)
- **Arquivos:** `docker-compose.yml`, `docker/postgres/init/01-banco-teste.sql`, `docker/postgres/init/02-banco-e2e.sql`
- **Passos:**
  1. Copiar o compose e o `01` da §3.12.
  2. O `02` contém só `CREATE DATABASE vinimon_e2e OWNER vinimon;` (usado pelos E2E da T-11.4).
- **Pronto quando:**
  - [ ] `docker compose up -d` deixa o `postgres` em estado healthy;
  - [ ] `docker compose exec -T postgres psql -U vinimon -lqt | cut -d'|' -f1 | grep -E 'vinimon(_test|_e2e)?'` lista os 3 bancos;
  - [ ] a porta só aparece em `127.0.0.1` (`docker compose port postgres 5432`).
- **Modelo:** Haiku
- **Tamanho:** P
