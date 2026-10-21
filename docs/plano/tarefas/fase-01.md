> Parte B (tarefas). Antes de executar qualquer tarefa leia `CLAUDE.md`, `docs/plano/tarefas/00-convencoes.md` e as seções da Parte A citadas no cartão (mapa §→arquivo em `docs/plano/README.md`).

### Fase 1 — Núcleo compartilhado e API base

### T-1.1 — `packages/shared`: base HTTP e Zod
- **Depende de:** T-0.2 · **Paralelo com:** T-0.3
- **Requisitos:** §2.5 (stack), §3.3, §7 (`http.ts`, `zod.ts`, `index.ts`)
- **Arquivos:** `packages/shared/{package.json,tsconfig.json,vitest.config.ts}`, `packages/shared/src/{http.ts,zod.ts,index.ts,http.test.ts}`
- **Passos:**
  1. `package.json` e `tsconfig.json` conforme a §3.12. `vitest.config.ts` com `environment: 'node'`.
  2. Copiar `http.ts` e `zod.ts` da §7.
  3. `index.ts` com só `http` e `zod`, por enquanto.
  4. Teste de `zDataHora`: decode de string ISO para `Date`, encode de volta para ISO, e recusa de `"2026-13-01"`. Teste de `zListaIds`: `'3'` vira `[3]`, `['1','2']` vira `[1,2]` e 51 itens dão erro. Teste de `PaginacaoQuerySchema`: `porPagina=0` e `porPagina=101` falham.
- **Pronto quando:**
  - [ ] `pnpm -F @vinimon/shared test` com ≥ 6 testes verdes;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** P

### T-1.2 — Shared: permissões, enums e config
- **Depende de:** T-1.1 · **Paralelo com:** T-1.3
- **Requisitos:** §3.5, §7 (`permissoes.ts`, `enums.ts`, `config.ts`)
- **Arquivos:** `packages/shared/src/{permissoes.ts,enums.ts,config.ts,index.ts,permissoes.test.ts,config.test.ts}`
- **Passos:**
  1. Copiar `permissoes.ts` e `config.ts` da §7.
  2. `enums.ts` com **todos** os enums do `schema.prisma` (§4.2): `PERFIS` (reexportado de permissões), `ESTADOS_SESSAO`, `TEMAS`, `DENSIDADES`, `ATORES_AUDITORIA`, `PRESENCAS_MANUAIS`, `TIPOS_STATUS`, `PAPEIS_STATUS`, `TIPOS_ASSENTAMENTO`, `TIPOS_EVENTO`, `TIPOS_NOTIFICACAO`, `MOTIVOS_SEGUIR`, `NOTAS_AVALIACAO`, `SITUACOES_ATIVO`, `SITUACOES_ARTIGO`, `VISIBILIDADES_ARTIGO`. Cada um vem com o tipo `(typeof X)[number]`.
  3. Testes:
     - USUARIO tem exatamente as 4 permissões da §3.5;
     - OPERADOR não tem `chamado.verTodos` nem `cadastro.gerenciar`;
     - `exigeMfa('USUARIO') === false`;
     - `ConfigSchema.parse(CONFIG_PADRAO)` passa;
     - `AtualizarConfigSchema` recusa chave desconhecida.
- **Pronto quando:**
  - [ ] `pnpm -F @vinimon/shared test`;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** P

### T-1.3 — Shared: limites, senha e CSV
- **Depende de:** T-1.1 · **Paralelo com:** T-1.2
- **Requisitos:** S10, S56, S82
- **Arquivos:** `packages/shared/src/{limites.ts,senha.ts,csv.ts,index.ts,csv.test.ts,limites.test.ts}`
- **Passos:**
  1. `limites.ts` exporta construtores Zod com os limites da tabela S56: `zAssunto()`, `zDescricao()`, `zComentario()`, `zSolucao()`, `zNome()`, `zEmail()`, `zTelefone()`, `zContato()`, `zBusca()`, `zNomeArquivo()`, `zCor()`, `zTag()`, `zMotivo()`. Mensagens em pt-BR com `error:`.
  2. `senha.ts`:
     - `SenhaSchema = z.string().min(12, 'Use ao menos 12 caracteres.').max(128)`;
     - `EntradasForca = { login; nome; email|null; organizacao }`;
     - **sem** zxcvbn: shared só depende de zod; a força é calculada na API (T-2.1) e no front.
  3. `csv.ts`:
     - `celulaCsv(v: unknown): string` faz escape de aspas e prefixa `'` quando o valor começa com `[=+\-@\t\r]`;
     - `linhaCsv(valores) = valores.map(celulaCsv).join(';') + '\r\n'`;
     - BOM `\uFEFF` exportado como `BOM_CSV`.
- **Pronto quando:**
  - [ ] testes: `=1+1` vira `'=1+1`, `a"b` vira `"a""b"`, `zAssunto` recusa 2 e 151 caracteres, `zCor` recusa `#fff`;
  - [ ] `pnpm verificar`.
- **Trilha:** A (apoio W)
- **Modelo:** Haiku
- **Tamanho:** P

### T-1.4 — API: scaffold, `env.ts` e `schema.prisma`
- **Depende de:** T-1.2, T-0.3 · **Paralelo com:** —
- **Requisitos:** S4, S5, S6, S110; §3.12, §4.2, §7 (`env.ts`)
- **Arquivos:** `apps/api/{package.json,tsconfig.json,tsdown.config.ts,prisma.config.ts,.env.example}`, `apps/api/src/env.ts`, `apps/api/prisma/schema.prisma` (cópia literal)
- **Passos:**
  1. Copiar os arquivos da §3.12 e `env.ts` da §7.
  2. Instalar com as versões exatas que já estão no `package.json` (`pnpm install`). **Nunca** `@latest`.
  3. Copiar `schema.prisma` completo da §4.2.
  4. `cp apps/api/.env.example apps/api/.env`.
  5. `pnpm -F @vinimon/api exec prisma validate`. Se falhar, aplicar **só** as regras de fallback (a)–(d) da §4.2 e registrar no commit.
- **Pronto quando:**
  - [ ] `pnpm -F @vinimon/api exec prisma --version` mostra 7.10.1;
  - [ ] `prisma validate` OK;
  - [ ] `pnpm -F @vinimon/api db:generate` cria `src/generated/prisma`, que é ignorado pelo git;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** M

### T-1.5 — Migração `init` com o SQL manual
- **Depende de:** T-1.4 · **Paralelo com:** —
- **Requisitos:** S60, S86; §4.1, §4.3
- **Arquivos:** `apps/api/prisma/migrations/<ts>_init/migration.sql`, `apps/api/prisma/migrations/migration_lock.toml` (gerado pelo Prisma), `apps/api/src/lib/prisma.ts`, `apps/api/src/lib/enums-check.ts`
- **Passos:**
  1. Seguir o procedimento da §4.3: `--create-only`, colar o bloco A no topo e o bloco B no fim, depois `migrate dev`.
  2. **Nunca** `migrate reset`. Se o Prisma pedir reset, responda `BLOQUEADO`.
  3. Copiar `lib/prisma.ts` da §7.
  4. Criar `enums-check.ts`, um `Igual` por enum. Importar os tipos de `../generated/prisma/enums`; se esse caminho não existir, de `../generated/prisma/client`.
     ```ts
     type Igual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
     export const _perfil: Igual<Perfil, PrismaPerfil> = true // repetir para cada enum de shared/enums.ts
     ```
  5. Aplicar no banco de teste: `DATABASE_URL=postgresql://vinimon:vinimon@localhost:5432/vinimon_test pnpm -F @vinimon/api exec prisma migrate deploy`.
- **Pronto quando:**
  - [ ] um segundo `migrate dev` responde "Already in sync";
  - [ ] `docker compose exec -T postgres psql -U vinimon -d vinimon -c "SELECT public.f_unaccent('Ação')"` devolve `Acao`;
  - [ ] `docker compose exec -T postgres psql -U vinimon -d vinimon -c '\dx'` lista `pg_trgm` e `unaccent`;
  - [ ] `UPDATE auditoria SET acao='x'` falha com 42501 mesmo com a tabela vazia (trigger `FOR EACH STATEMENT` da §4.3);
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Sonnet
- **Tamanho:** M

### T-1.6 — Libs base: erros, paginação, like, config, tempo real, senha
- **Depende de:** T-1.5 · **Paralelo com:** —
- **Requisitos:** S7, S8, S9, S59, S62; §7
- **Arquivos:** `apps/api/src/lib/{erros.ts,paginacao.ts,like.ts,config.ts,tempo-real.ts,senha.ts,like.test.ts,senha.test.ts}`
- **Passos:**
  1. Copiar literalmente da §7.
  2. `senha.test.ts`:
     - hash novo casa `^\$argon2id\$v=19\$m=19456,t=2,p=1\$` (T05);
     - hash legado gerado no teste com `scryptSync('abc', saltHex, 64)` (`saltHex = randomBytes(16).toString('hex')`) confere e devolve `precisaRehash: true`;
     - senha errada devolve `ok: false`;
     - `verificarSenha(x, null)` devolve `ok: false`.
  3. `like.test.ts`: `escaparLike('50%_a\\')` produz `50\%\_a\\\\`.
- **Pronto quando:**
  - [ ] `pnpm -F @vinimon/api exec vitest run src/lib/like.test.ts src/lib/senha.test.ts` verde (ainda não existe `vitest.config.ts`, e esses testes não importam env nem prisma);
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** P

### T-1.7 — Sessão, contexto, auditoria e plugins de erro, autenticação e segurança
- **Depende de:** T-1.6 · **Paralelo com:** —
- **Requisitos:** S17–S23, S32, S33, S43, S59, S87; §7
- **Arquivos:** `apps/api/src/lib/{sessao.ts,contexto.ts,auditoria.ts}`, `apps/api/src/plugins/{erros.ts,autenticacao.ts,seguranca.ts}`
- **Passos:**
  1. Copiar literalmente da §7: `sessao.ts`, `contexto.ts`, `auditoria.ts`, `plugins/erros.ts` (completo, incluindo 413/415/503/4xx), `autenticacao.ts` e `seguranca.ts`.
  2. Em `autenticacao.ts`, cookie malformado não pode lançar erro: `carregarSessao` já recusa token fora de `^[A-Za-z0-9_-]{43}$` (T23).
- **Pronto quando:**
  - [ ] `pnpm verificar` (os testes desta camada entram na T-1.9 e nas T-2.x).
- **Trilha:** A
- **Modelo:** Sonnet
- **Tamanho:** M

### T-1.8 — `app.ts`, `server.ts`, saúde, docs e SPA
- **Depende de:** T-1.7 · **Paralelo com:** —
- **Requisitos:** S34, S41, S42, S61, S73, S74, S76, S83; §3.2, §7
- **Arquivos:** `apps/api/src/{app.ts,server.ts}`, `apps/api/src/modules/saude/{service.ts,routes.ts}`, `apps/api/src/plugins/{docs.ts,spa.ts}`
- **Passos:**
  1. Copiar `app.ts` da §7 **sem** as linhas de `rotasAreas`, `rotasAuth` e `tempoRealPlugin`. Essas linhas entram nas T-1.10, T-2.4 e T-7.2.
  2. Copiar `server.ts` **sem** `iniciarJobs` (entra na T-7.6).
  3. `saude/service.ts` exporta `verificarBanco()` com `await prisma.$queryRaw\`SELECT 1\``. A rota importa do service (decisão da §7).
  4. `docs.ts` e `spa.ts` literais.
- **Pronto quando:**
  - [ ] `pnpm -F @vinimon/api dev` e `curl -s localhost:3000/api/v1/saude` devolvem `{"ok":true}`;
  - [ ] `curl -s localhost:3000/api/v1/saude/pronto` devolve `{"ok":true}`;
  - [ ] `curl -s localhost:3000/api/v1/xyz` devolve 404 `ROTA_INEXISTENTE`;
  - [ ] `http://localhost:3000/api/docs` abre;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** M

### T-1.9 — Infraestrutura de testes da API e testes de `env.ts`
- **Depende de:** T-1.8 · **Paralelo com:** —
- **Requisitos:** S4, S6; T02, T48; §7 (`vitest.config.ts`, `test/*`)
- **Arquivos:** `apps/api/vitest.config.ts`, `apps/api/test/{constantes.ts,global-setup.ts,setup.ts,ajudantes.ts,infra.test.ts}`, `apps/api/src/env.test.ts`, `apps/api/package.json`
- **Passos:**
  1. Copiar literalmente da §7 (`ajudantes.ts` completo).
  2. `infra.test.ts`:
     - `limparBanco()` zera a tabela `usuarios`;
     - `criarUsuario({perfil:'ADMIN'})` + `headersDe()`: `GET /api/v1/saude` dá 200.
  3. `env.test.ts`: roda `spawnSync(process.execPath, ['--import','tsx','-e',"await import('./src/env.ts')"], { env: {...} })` para cada caso de T02 e espera `status === 1`. O `stderr` deve conter o nome da chave e **não** pode conter o valor enviado. Caso de T48: `UPLOAD_DIR=../web/dist/x` falha.
  4. Acrescentar a `apps/api/package.json`: `"db:teste:recriar": "docker compose exec -T postgres psql -U vinimon -d postgres -c 'DROP DATABASE IF EXISTS vinimon_test WITH (FORCE)' -c 'CREATE DATABASE vinimon_test OWNER vinimon' && DATABASE_URL=postgresql://vinimon:vinimon@localhost:5432/vinimon_test prisma migrate deploy"`.
     Acrescentar também `"db:dev:recriar"` exatamente como na §3.12 (o runner e a regra 5 do `CLAUDE.md` usam).
- **Pronto quando:**
  - [ ] `pnpm -F @vinimon/api test` verde (infra + env, ≥ 9 casos);
  - [ ] o banco `vinimon` (dev) continua intacto;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** M

### T-1.10 — Módulo canônico de áreas
- **Depende de:** T-1.9 · **Paralelo com:** T-1.11
- **Requisitos:** S43, S54, S55, S62, S87; §3.4, §7
- **Arquivos:** `packages/shared/src/{modulos/areas.ts,index.ts}`, `apps/api/src/modules/areas/{schemas.ts,service.ts,routes.ts,areas.test.ts}`, `apps/api/src/app.ts`
- **Passos:**
  1. Copiar literalmente da §7.
  2. Registrar `rotasAreas` em `app.ts`.
- **Pronto quando:**
  - [ ] `pnpm -F @vinimon/api exec vitest run src/modules/areas`: 8 testes verdes;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** P

### T-1.11 — CI e `SECURITY.md`
- **Depende de:** T-1.9 · **Paralelo com:** T-1.10
- **Requisitos:** S2, S3, S85, S109–S111; T01, T03, T04; §3.12 (`ci.yml`)
- **Arquivos:** `.github/workflows/ci.yml`, `SECURITY.md`
- **Passos:**
  1. Copiar o `ci.yml` da §3.12, trocando o último passo por `pnpm -F @vinimon/api build`. A T-9.2 volta para `pnpm build`.
  2. Acrescentar o passo `run: test "$(node -p "require('./apps/api/package.json').devDependencies.prisma")" = "7.10.1"` (T04). O passo T03 usa `git grep -nE '<regex T03>' -- apps packages ':!apps/web/src/components/ui/**' ':!**/generated/**'` e falha se houver saída.
  3. `SECURITY.md`:
     - como reportar vulnerabilidades;
     - os `.db` saíram do índice, mas continuam no histórico; reescrever com `git filter-repo --path data --invert-paths` é decisão humana (S2);
     - rotação de segredos;
     - política de dependências (S109–S113).
- **Pronto quando:**
  - [ ] depois do push, `gh run list --workflow ci.yml --branch "$(git branch --show-current)" --limit 1 --json conclusion -q ".[0].conclusion"` imprime `success`. Sem remoto ou permissão: terminar com `BLOQUEADO: CI não verificável localmente`;
  - [ ] `act` não é necessário;
  - [ ] `pnpm verificar`.
- **Trilha:** A (apoio W)
- **Modelo:** Haiku
- **Tamanho:** P
