> Parte B (tarefas). Antes de executar qualquer tarefa leia `CLAUDE.md`, `docs/plano/tarefas/00-convencoes.md` e as seções da Parte A citadas no cartão (mapa §→arquivo em `docs/plano/README.md`).

### Fase 11 — Importação da v1, E2E, deploy, documentação e revisões

### T-11.1 — Importador: leitura e validação
- **Depende de:** T-2.2 · **Paralelo com:** Fase 10
- **Requisitos:** S72; §4.5 (passos 1–3)
- **Arquivos:** `apps/api/scripts/importar-v1/{ler.ts,validar.ts,fixture.ts,validar.test.ts}`
- **Passos:**
  1. `ler.ts`:
     - copia `.db`, `-wal` e `-shm` para `mkdtemp(os.tmpdir())`;
     - abre com `new DatabaseSync(copia)`, roda `PRAGMA wal_checkpoint(TRUNCATE)` e exige `integrity_check = 'ok'`;
     - lê as tabelas com `ORDER BY id`; anexos sem a coluna `dados`;
     - confere em `sqlite_master` se `notificacoes` existe.
  2. `validar(L)` é pura e devolve `{ erros, avisos, norm }` com as regras da §4.5.
  3. `fixture.ts` cria um SQLite temporário com o DDL de `legado/v1/db.js` (copiar só os `CREATE TABLE`) e linhas válidas e inválidas. Os hashes são gerados com `scryptSync(senha, saltHex, 64)`.
- **Pronto quando:**
  - [ ] teste: data inválida, FK órfã, `nivel=4` e colisão de login geram erros; e-mail duplicado gera aviso;
  - [ ] `pnpm verificar`.
- **Trilha:** A (apoio W)
- **Modelo:** Sonnet
- **Tamanho:** M

### T-11.2 — Importador: transformação
- **Depende de:** T-11.1 · **Paralelo com:** Fase 10
- **Requisitos:** S12; §4.5 (mapeamento e regras dos chamados)
- **Arquivos:** `apps/api/scripts/importar-v1/{transformar.ts,transformar.test.ts}`
- **Passos:**
  1. Função pura `transformar(norm, ctx: { statusPapel, canalWebId, jornada24x7Id, unidadePrincipalId })` → lotes por tabela, com a tabela de mapeamento literal.
  2. Senhas padrão (`admin123`, `operador123`, `usuario123` e `<login>123`) viram `senhaHash = null`. Usar `verificarSenha` de `lib/senha.ts`.
  3. `abertoPorId`, `statusDesde`, campos de SLA via `recalcularSla` com o calendário 24x7. Chamado em aberto com prazo de solução < agora → os campos de aviso de estouro e de risco usados pela T-7.8 = agora. Com prazo de resposta < agora e sem primeira resposta → aviso de resposta = agora.
  4. Seguidores e leituras derivados.
- **Pronto quando:**
  - [ ] snapshots campo a campo da fixture;
  - [ ] o usuário com `admin123` sai com hash null e aparece no relatório (T10);
  - [ ] `pnpm verificar`.
- **Trilha:** A (apoio W)
- **Modelo:** Sonnet
- **Tamanho:** M

### T-11.3 — Importador: arquivos, gravação e CLI
- **Depende de:** T-11.2, T-6.5 · **Paralelo com:** Fase 10
- **Requisitos:** S60, S72; §4.5 (passos 4–7)
- **Arquivos:** `apps/api/scripts/importar-v1/{arquivos.ts,gravar.ts,index.ts,importar.test.ts}`
- **Passos:**
  1. `arquivos.ts` lê um BLOB por vez (`SELECT dados FROM anexos WHERE id = ?`), grava em `tmp/` e passa pelo mesmo pipeline (`detectarTipo`; tipo fora da lista vira `application/octet-stream` com `inline=false`) com `efetivar`. No dry-run, só calcula o sha256. O id do anexo importado é determinístico: `uuidLegado(id) = h.slice(0,8)+'-'+h.slice(8,12)+'-8'+h.slice(13,16)+'-'+((parseInt(h[16],16)&3)|8).toString(16)+h.slice(17,20)+'-'+h.slice(20,32)`, com `h = createHash('sha256').update('vinimon-legado-anexo:'+id).digest('hex')`. A chave fica `AAAA/MM/<uuidLegado>`, com AAAA/MM de `criado_em` do legado. Antes de ler o BLOB: `prisma.anexo.findMany({ where: { id: { in: lote } }, select: { id: true } })`; ids já existentes não são lidos nem gravados.
  2. `gravar.ts`, transação única com `{ maxWait: 30_000, timeout: 1_800_000 }`:
     1. preflight: se não há `config['legado.migracao']` e existem usuários, aborta;
     2. `seedBase(tx,{catalogos:false})`;
     3. `createMany skipDuplicates` em lotes de 1000;
     4. status e papéis que faltarem;
     5. `setval` (§4.5);
     6. desnormalizados: `ultimoAssentamentoId`, `PublicoId` e `ultimaAtividadeEm` por `$executeRaw`; `ultimaInteracaoEm` / `ultimaInteracaoAutorId` = data e autor do último assentamento público;
     6b. se `count(prioridades WHERE padrao)` = 0, marcar a de menor `ordem` (desempate: menor id);
     7. marcador.
  3. `--dry-run` lança `DryRunRollback` no fim e sai com 0.
  4. `index.ts`: `const args = process.argv.slice(2); if (args[0] === '--') args.shift(); const { values } = parseArgs({ args, options: { ... }, strict: true, allowPositionals: false })` com `--sqlite`, `--dry-run` e `--exigir-troca-todos` (o pnpm repassa o `--` ao script); imprime o relatório (lidas / inseridas / avisos / arquivos).
- **Pronto quando:**
  - [ ] teste com a fixture: contagens iguais;
  - [ ] `SELECT last_value, is_called FROM chamados_id_seq` dá `max+1` e `false`;
  - [ ] uma segunda execução insere 0;
  - [ ] o dry-run deixa o banco vazio;
  - [ ] a senha da fixture loga e vira argon2id;
  - [ ] executar 2 vezes sobre a fixture: `count(anexos)` e `find $UPLOAD_DIR -type f | wc -l` iguais à fixture;
  - [ ] exatamente 1 prioridade padrão, 5 canais `sistema` e todos os papéis de status;
  - [ ] rodar `executar` do `sla-alertas` logo após a importação gera 0 eventos;
  - [ ] `pnpm -F @vinimon/api db:teste:recriar && DATABASE_URL=postgresql://vinimon:vinimon@localhost:5432/vinimon_test pnpm -F @vinimon/api importar:v1 --sqlite ../../data/VINIMON.db --dry-run` termina sem erros;
  - [ ] `pnpm verificar`.
- **Trilha:** C
- **Modelo:** Opus
- **Tamanho:** M

### T-11.4 — Playwright: configuração, preparo e login
- **Depende de:** T-10.2, T-10.4 · **Paralelo com:** T-11.1–T-11.3
- **Requisitos:** T68, T70; §5.2 (\[P])
- **Arquivos:** `apps/web/playwright.config.ts`, `apps/web/e2e/{totp.ts,ajudantes.ts,auth.setup.ts,login.spec.ts}`, `apps/api/scripts/e2e-preparar.ts`, `.github/workflows/ci.yml`, `.gitignore`, `apps/web/package.json` (`@playwright/test` 1.64.1)
- **Passos:**
  1. `e2e-preparar.ts`:
     - exige que `DATABASE_URL` termine em `_e2e`;
     - `migrate deploy` + `TRUNCATE` (mesma lógica de `limparBanco`) + `seedBase` + `seedInicial` com `SEED_ADMIN_PASSWORD`;
     - cria `operador`, `usuario` e `usuario-t72` com `E2E_SENHA` e TOTP fixo `E2E_TOTP_SECRET`;
     - cria área TI, um problema e uma jornada.
  2. `playwright.config.ts`:
     - `webServer: { cwd: '../api', command: 'pnpm -F @vinimon/web build && pnpm -F @vinimon/api build && pnpm exec tsx scripts/e2e-preparar.ts && node dist/server.mjs', url: 'http://localhost:3100/api/v1/saude/pronto', reuseExistingServer: false, timeout: 180_000, env: { NODE_ENV: 'test', PORT: '3100', APP_ORIGIN: 'http://localhost:3100', WEB_DIST_DIR: '../web/dist', UPLOAD_DIR: './storage/e2e', DATABASE_URL: 'postgresql://vinimon:vinimon@localhost:5432/vinimon_e2e', JOBS_HABILITADOS: 'false', SOCKET_REVALIDAR_MS: '1000', ... } }` (o `cwd` padrão seria `apps/web`);
     - `use.baseURL`; um worker;
     - projeto `setup` com `auth.setup.ts`; os demais projetos têm `dependencies: ['setup']`.
  3. `totp.ts` (RFC 6238 com `node:crypto`):
     ```ts
     const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
     export function totp(segredo: string, agora = Date.now()): string {
       let bits = ''; for (const ch of segredo.replace(/=+$/, '').toUpperCase()) bits += B32.indexOf(ch).toString(2).padStart(5, '0')
       const chave = Buffer.from(bits.match(/.{8}/g)?.map((b) => Number.parseInt(b, 2)) ?? [])
       const c = Buffer.alloc(8); c.writeBigUInt64BE(BigInt(Math.floor(agora / 30_000)))
       const h = createHmac('sha1', chave).update(c).digest(); const o = (h[h.length - 1] ?? 0) & 0xf
       return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0')
     }
     ```
  4. `auth.setup.ts`: faz login uma única vez de `operador`, `usuario` e `usuario-t72` e grava `e2e/.auth/<login>.json` com `context.storageState({ path })`. Os specs T-11.5 a T-11.7 usam `test.use({ storageState: 'e2e/.auth/<login>.json' })` e não refazem login (o servidor recusa replay de TOTP no mesmo passo de 30 s). Se um spec precisar de novo TOTP do mesmo usuário, esperar o passo virar: `await expect.poll(() => Math.floor(Date.now() / 30_000), { timeout: 31_000 }).toBeGreaterThan(passoUsado)`. Acrescentar `apps/web/e2e/.auth/` ao `.gitignore`.
  5. `login.spec.ts`:
     - T68: admin → troca de senha → 2FA, com o segredo lido da URI exibida → painel; `context.cookies()` mostra `httpOnly` e `sameSite: 'Strict'`;
     - T70: `redirect` malicioso; logout + voltar não exibe dados.
  7. Specs por área: toda tarefa da Fase 10 posterior à T-11.4 acrescenta 1 caso ao spec da sua área.
  6. Job `e2e` no CI: depois de `verificar`, `PGPASSWORD=vinimon psql -h localhost -U vinimon -d postgres -c 'CREATE DATABASE vinimon_e2e OWNER vinimon'` (o service container não executa `docker/postgres/init/*`), `pnpm exec playwright install --with-deps chromium` e `pnpm test:e2e`.
- **Pronto quando:**
  - [ ] `pnpm test:e2e -- login` verde localmente e no CI;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** M

### T-11.5 — E2E: fluxo principal do chamado
- **Depende de:** T-11.4, T-10.23, T-10.25, T-10.27, T-10.28, T-10.29, T-10.31 · **Paralelo com:** T-11.6, T-11.7
- **Requisitos:** T71; §3.5
- **Arquivos:** `apps/web/e2e/{chamado-fluxo.spec.ts,auth.setup.ts}`, `apps/api/scripts/e2e-preparar.ts`, `apps/api/src/app.ts`, `apps/api/src/plugins/{spa.ts,spa.test.ts}`, `apps/api/src/modules/sla/service.ts`, `apps/api/src/modules/chamados/acoes-conclusao.test.ts`
- **Passos:**
  1. USUARIO abre o chamado com anexo PNG.
  2. OPERADOR assume, comenta mencionando o USUARIO e conclui.
  3. USUARIO valida com "Bom".
  4. ADMIN vê no relatório.
  5. `page.waitForResponse` no download confere os cabeçalhos de T46.
  6. O app num iframe de outra origem é bloqueado (`X-Frame-Options`).
- **Pronto quando:**
  - [ ] spec verde;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** M

### T-11.6 — E2E: tempo real
- **Depende de:** T-11.4, T-10.14, T-10.15, T-10.26 · **Paralelo com:** T-11.5, T-11.7
- **Requisitos:** TM1–TM4, TM7; T69
- **Arquivos:** `apps/web/e2e/tempo-real.spec.ts`
- **Passos:**
  1. Dois `browser.newContext()`, um para o operador e um para o usuário.
  2. Digitação aparece; mensagem chega sem recarregar; "Visto por" em até 2 s; presença muda para Ausente: `await page.clock.install()` antes do `goto`; depois `await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')) })` e `await page.clock.fastForward('05:01')`, esperando o indicador 'Ausente' na outra aba (`visibilityState` é somente leitura; só disparar o evento não basta).
  3. T69: `addInitScript` substitui `window.Notification` e captura os argumentos; o corpo não contém o texto; a permissão só é pedida depois do clique.
- **Pronto quando:**
  - [ ] spec verde 3 vezes seguidas (`--repeat-each=3`);
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Sonnet
- **Tamanho:** M

### T-11.7 — E2E: segurança e acessibilidade
- **Depende de:** T-11.4 e todas as T-10.x · **Paralelo com:** T-11.5, T-11.6
- **Requisitos:** T66, T67, T72; §6.2 (axe)
- **Arquivos:** `apps/web/e2e/{seguranca.spec.ts,a11y.spec.ts}`, `apps/api/scripts/e2e-preparar.ts`
- **Passos:**
  1. T66: `addInitScript` com `document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective))`; percorre todas as rotas da §6.6 e diálogos Radix e confere `[]`.
  2. T67: XSS no assunto, no comentário e em link `javascript:`.
  3. T72: config `sessao.minutosInatividade` forçada via API para 15, e `ultimoUsoEm` recuado pelo `e2e-preparar.ts --recuar-sessao <login>`; a próxima ação leva ao login. Com `--recuar-sessao <login>`, o script faz SÓ `prisma.sessao.updateMany({ where: { usuario: { login } }, data: { ultimoUsoEm: new Date(Date.now() - 16 * 60_000) } })` e sai com 0, sem migrate, TRUNCATE ou seed. O spec chama `execFileSync('pnpm', ['-F', '@vinimon/api', 'exec', 'tsx', 'scripts/e2e-preparar.ts', '--recuar-sessao', 'usuario-t72'], { env: { ...process.env, DATABASE_URL: URL_E2E } })`. O T72 usa só `usuario-t72`.
  4. a11y: `AxeBuilder` em cada rota, nos modos claro, escuro e compacto; zero violações *serious* ou *critical*.
- **Pronto quando:**
  - [ ] specs verdes;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** M

### T-11.8 — Deploy: Dockerfile, Caddy, systemd e papéis do Postgres
- **Depende de:** T-9.2 · **Paralelo com:** T-11.9, T-11.10
- **Requisitos:** S114, S115, S117, S118, S121; §3.13
- **Arquivos:** `Dockerfile`, `.dockerignore`, `deploy/{Caddyfile,vinimon.service,api.env.example}`, `scripts/papeis-postgres.sql`, `scripts/release.sh`, `docs/operacao.md`
- **Passos:**
  1. Copiar Caddyfile, unit e SQL da §3.13.
  2. `release.sh` com `set -euo pipefail`: `git pull --ff-only`, `pnpm install --frozen-lockfile`, `pnpm build`, `DATABASE_URL="$DATABASE_URL_MIGRATOR" pnpm db:deploy` (se falhar, sai sem reiniciar: S121), depois `systemctl restart vinimon` e `curl -fsS https://$HOST/api/v1/saude/pronto`.
  3. `Dockerfile` (empacotamento alternativo do **mesmo processo único**):
     - multi-stage `node:24-bookworm-slim` (fixar por digest com `docker buildx imagetools inspect`);
     - estágio de build com `corepack` + `pnpm install --frozen-lockfile` + `pnpm build`;
     - estágio final copia `apps/api/dist`, `apps/api/node_modules` de produção (`pnpm deploy --filter @vinimon/api --prod /out`), `apps/web/dist` e `apps/api/prisma`;
     - `USER node`, `ENV WEB_DIST_DIR=/app/web/dist`, `EXPOSE 3000`, `HEALTHCHECK` com `node -e "fetch('http://127.0.0.1:3000/api/v1/saude').then(r=>process.exit(r.ok?0:1))"`;
     - roda com `--read-only --tmpfs /tmp -v /var/lib/vinimon/anexos:/data/anexos` atrás do mesmo Caddy (`reverse_proxy 127.0.0.1:3000`);
     - estágio `FROM build AS migrar` com `CMD ["pnpm", "-F", "@vinimon/api", "db:deploy"]` (a imagem final, feita com `pnpm deploy --prod`, não traz o CLI `prisma`). Documentar em `docs/operacao.md`: `docker build --target migrar -t vinimon-migrar . && docker run --rm -e DATABASE_URL="$DATABASE_URL_MIGRATOR" vinimon-migrar`, antes de subir a imagem final. Se falhar, não subir (S121).
  4. `api.env.example` de produção, com os valores a gerar comentados.
- **Pronto quando:**
  - [ ] `docker build -t vinimon .` OK;
  - [ ] `docker run --rm --env-file deploy/api.env.example …` falha por S4 (segredos de exemplo);
  - [ ] com env válido e Postgres, `/api/v1/saude` responde;
  - [ ] `caddy validate --config deploy/Caddyfile`;
  - [ ] `pnpm verificar`.
- **Trilha:** A (apoio W)
- **Modelo:** Haiku
- **Tamanho:** M

### T-11.9 — Backup e teste de restauração
- **Depende de:** T-11.8 · **Paralelo com:** T-11.10
- **Requisitos:** S119, S120
- **Arquivos:** `scripts/{backup.sh,teste-restauracao.sh}`, `deploy/{vinimon-backup.service,vinimon-backup.timer,vinimon-restauracao.timer}`
- **Passos:**
  1. `backup.sh`: `pg_dump -Fc` para `/var/lib/vinimon/backup/vinimon.dump`, depois `restic backup` do dump e de `UPLOAD_DIR` e `restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 12 --prune`.
  2. Timer às 02:17.
  3. `teste-restauracao.sh`: `restic restore latest` em diretório temporário, `createdb vinimon_restauracao_<data>`, `pg_restore`, conferência de `count(chamados) > 0` e de 10 anexos aleatórios existentes com sha256 batendo, depois `dropdb`. Timer mensal.
- **Pronto quando:**
  - [ ] rodando contra o compose de dev com `RESTIC_REPOSITORY=/tmp/restic-teste`, os dois scripts saem com 0;
  - [ ] `shellcheck scripts/*.sh` limpo;
  - [ ] `pnpm verificar`.
- **Trilha:** A (apoio W)
- **Modelo:** Haiku
- **Tamanho:** P

### T-11.10 — README, SECURITY.md e runbook de operação
- **Depende de:** T-11.3, T-11.8 · **Paralelo com:** T-11.9
- **Requisitos:** S2, S11 (README sem senhas)
- **Arquivos:** `README.md`, `SECURITY.md`, `docs/operacao.md`
- **Passos:**
  1. `README.md`: visão, requisitos (Node 24, pnpm 12, Docker), início rápido (`db:up`, `.env`, `db:deploy`, `db:seed`, `seed:dev`, `dev`), comandos, estrutura, links para `docs/plano/`, sem nenhuma senha.
  2. `docs/operacao.md`: instalação Linux (papéis, systemd, Caddy) e Windows (NSSM + Caddy), release, backup e restauração, corte da v1 (copiar a §9), rotação de segredos, desbloqueio e reset via CLI, logs (`journalctl -u vinimon`, retenção de 90 dias via `journald.conf` `MaxRetentionSec=90d`: S123).
- **Pronto quando:**
  - [ ] `grep -Ei 'admin123|operador123|usuario123' README.md docs/operacao.md` vazio;
  - [ ] `pnpm verificar`.
- **Trilha:** A (apoio W)
- **Modelo:** Haiku
- **Tamanho:** P

### T-11.11 — Revisão final de segurança
- **Depende de:** todas as T-1.x a T-11.10 · **Paralelo com:** T-11.12
- **Requisitos:** S1–S123 (S124 e os demais S# fora do MVP constam com a fase da §5.1); T01–T72
- **Arquivos:** `docs/plano/revisao-seguranca.md`, `apps/api/test/rastreabilidade.test.ts`
- **Passos:**
  1. Tabela S# → evidência (teste, arquivo ou passo de CI) → status. Toda linha "pendente" vira issue ou tarefa nova; nada é marcado "OK" sem evidência. S124 entra com status 'Fase 2 (T-17.8)', que não conta como pendência. Qualquer outro S# fora do MVP precisa de linha explícita na §5.1 com a fase.
  2. `rastreabilidade.test.ts` confere que cada um de T05–T62 (incluindo T40, de `vazamento-segredos.test.ts`) aparece em algum `it(...)`, por grep dos arquivos `*.test.ts`.
  3. Manual:
     - `curl -I` dos cabeçalhos em produção de homologação;
     - `testssl.sh` no host;
     - `gitleaks detect`;
     - `pnpm audit`;
     - revisão de `git log -p` atrás de segredos.
- **Pronto quando:**
  - [ ] nenhuma linha "pendente" de severidade alta;
  - [ ] o teste de rastreabilidade passa;
  - [ ] `pnpm verificar`.
- **Trilha:** C
- **Modelo:** Opus
- **Tamanho:** M

### T-11.12 — Revisão de performance
- **Depende de:** T-11.3, T-11.7 · **Paralelo com:** T-11.11
- **Requisitos:** §4 (índices), orçamento de `docs/plano/relatorios/design.md` §4.8
- **Arquivos:** `apps/api/scripts/carga.ts`, `docs/plano/revisao-performance.md`
- **Passos:**
  1. `carga.ts` (recusa banco que não termine em `_test`) cria 50.000 chamados, 300.000 assentamentos e 200 usuários.
  2. `EXPLAIN (ANALYZE, BUFFERS)` das consultas: lista do operador, fila aberta, SLA estourado, timeline, feed, contagem de não lidas, menção (trigram), busca, contagens do operador, painel (8 counts + groupBy), contagens de visões, relatórios por-area e sla em 366 dias, exportação de 5000 linhas e `processarEvento` com 200 seguidores.
     - Cada uma deve usar o índice esperado do schema.
     - p95 < 50 ms no banco e `GET /chamados` < 300 ms (autocannon: `pnpm dlx autocannon@8 -c 20 -d 20 …`, versão fixada no comando).
  3. Bundle: `pnpm -F @vinimon/web build` com JS inicial de `/login` ≤ 200 kB gzip e shell + `/chamados` ≤ 350 kB gzip. Recharts, react-markdown e qrcode só em chunks de rota.
- **Pronto quando:**
  - [ ] o relatório com os planos e números está commitado;
  - [ ] os desvios viram tarefas;
  - [ ] `pnpm verificar`.
- **Trilha:** C
- **Modelo:** Opus
- **Tamanho:** M
