# Revisão final de segurança (T-11.11)

Base: `origin/v2` em 2026-10-24, branch `tarefa/T-11.11`. Requisitos e testes: `docs/plano/fundamentos/05-seguranca.md` (§5.1 e §5.2).
Status: **OK** (evidência conferida no código, num teste ou no CI) · **Pendente** (com severidade e o que falta) · **Fase 2** (fora do MVP pela §5.1).
Os testes citados como `arquivo › "título"` foram lidos. Esta revisão não rodou a suíte inteira, porque o banco de teste é compartilhado com a trilha E2E. Quem roda é o `pnpm verificar` do PR.

## Resumo

| Status | Quantidade |
|---|---|
| OK | 120 |
| Pendente (alta) | 1 (S111) |
| Pendente (média) | 2 (S2, S81) |
| Fase 2 | 1 (S124), e mais as partes de Fase 2 de S20 e S51, anotadas na linha |

### Pendências de severidade alta (precisam de correção antes de concluir a T-11.11)

1. **S111 / T04: `pnpm audit --prod --audit-level=high` falha hoje e derruba o passo do CI.**
   - `undici@7.29.1` tem o aviso GHSA-xjj6-f33q-929c (alto, DoS por excesso de content-encodings).
   - Também tem GHSA-4qv8-2p9j-2685 e GHSA-f72v-6w45-q472 (moderados).
   - Caminho: `apps/api > @scalar/fastify-api-reference > @scalar/json-magic > undici`.
   - O risco real em produção é baixo: o pacote só é usado pelo `docsPlugin`, e `API_DOCS=false` é obrigatório em produção (S4). Mesmo assim, o CI fica vermelho e o S111 deixa de ser cumprido.
   - **Proposta:** abrir uma tarefa para subir `@scalar/fastify-api-reference` para uma versão exata que já dependa de `undici >= 7.30.1`. Se essa versão não existir, fixar `undici: 7.30.1` em `overrides` no `pnpm-workspace.yaml`. A troca de versão é decisão de plano (regra 1 do CLAUDE.md), por isso não foi feita aqui.

### Pendências de severidade média

- **S81: os source maps estão publicados em produção.**
  - `build.sourcemap: 'hidden'` (`apps/web/vite.config.ts:21`) só tira o comentário `sourceMappingURL`. Os `.map` continuam em `dist/assets` e o `@fastify/static` os serve.
  - Exemplo: `GET https://vinimon.onrender.com/assets/index-DpwhaQ6B.js.map` responde 200 com um source map v3.
  - **Proposta:** apagar `dist/**/*.map` depois do `vite build`, no script de build/release, ou fazer o `spaPlugin` responder 404 para `*.map`.
- **S2: a decisão humana sobre o histórico está em aberto.**
  - O passo de CI existe e o índice está limpo. Porém `data/VINIMON.db` e `data/ocomon.db` continuam no histórico (commit `770aec1`), e o `SECURITY.md` registra "Decisão: _pendente_".
  - **Proposta:** o responsável decide entre rodar `git filter-repo --path data --invert-paths` ou aceitar o risco, e registra a decisão e a data no `SECURITY.md`. As senhas padrão da v1 já são tratadas como vazadas (S12).

### Observações de severidade baixa (não são pendências de S#)

- **HSTS em produção:** vem `max-age=31536000; includeSubDomains`. O `includeSubDomains` é o padrão do helmet e é mais restrito do que a S74 pede. Não contraria nada.
- **Respostas JSON da API sem `Cache-Control`:** acontece em `/api/v1/saude` e no 401 de `/auth/sessao`. A §5 só exige `no-store` nos downloads (S70), e o Cloudflare marca essas respostas como `cf-cache-status: DYNAMIC`. Sugestão para depois: `Cache-Control: no-store` em `/api/v1/*`.

## Ajustes feitos nos títulos de teste (rastreabilidade)

Na primeira execução, `apps/api/test/rastreabilidade.test.ts` falhou para T07, T08, T09, T15, T17, T33, T37, T40, T43, T49, T52, T54, T55 e T56.

- Em todos esses casos o teste existe. O T## estava só no `describe(...)` ou não aparecia em lugar nenhum (T37).
- Acrescentei o prefixo `T##:` ao título de um `it(...)` que verifica exatamente o item, sem mudar nenhuma asserção.

| T## | Arquivo › teste |
|---|---|
| T07 | `src/modules/auth/tempo-constante.test.ts` › "login inexistente verifica 1 hash" |
| T08 | `src/lib/forca-senha.test.ts` › "recusa 11 e 129 caracteres" |
| T09 | `test/seed.test.ts` › "é idempotente e cria o admin com troca de senha obrigatória" |
| T15 | `test/bloqueio.test.ts` › "ignora X-Forwarded-For sem TRUST_PROXY" |
| T17 | `src/modules/auth/auth.test.ts` › "usa __Host-vinimon_sid com Secure…" |
| T33 | `test/escopo-equivalencia.test.ts` › "ator %s: mesmo conjunto no Prisma e em memória" |
| T37 | `test/meta-me.test.ts` › "PATCH /me: 400 para perfil…". A parte "operação em várias tabelas é transacional" é coberta pelas `$transaction` dos services, por exemplo o T20 e o T39 ("dois ADMIN se rebaixando ao mesmo tempo…") |
| T40 | `test/vazamento-segredos.test.ts` › "percorre toda rota GET autenticada…" |
| T43 | `src/lib/tipo-arquivo.test.ts` › "PNG renomeado para .pdf…" |
| T49 | `test/logs.test.ts` › "segredos não aparecem nas linhas de log…" |
| T52 | `src/realtime/handshake.test.ts` › "recusa sem cookie" |
| T54 | `src/realtime/handlers.test.ts` › "assentamento interno só na sala interna…" |
| T55 | `src/realtime/revalidacao.test.ts` › "logout derruba o socket…" |
| T56 | `src/realtime/revalidacao.test.ts` › "o operador antigo recebe chamado:acessoRevogado…" |

Resultado: `pnpm --filter @vinimon/api exec vitest run test/rastreabilidade.test.ts` → 2 testes passam. O teste só lê arquivos e não toca o banco.

## Tabela S# → evidência → status

Caminhos de `apps/api` estão abreviados (`src/…`, `test/…`).

### Repositório e configuração

| S# | Evidência | Status |
|---|---|---|
| S1 | `.gitignore` (data/, *.db, *.sqlite*, .env); `legado/v1/`; `git ls-files` sem .db/.env (conferido) | OK |
| S2 | `.github/workflows/ci.yml:28` (falha com .db/.sqlite/.env versionado); `SECURITY.md` documenta o filter-repo | Pendente (média): decisão humana registrada como "pendente" |
| S3 | `ci.yml:21-24` (gitleaks 8.30.0, `--exit-code 1`) | OK |
| S4 | `src/env.ts:59-69` (https, TRUST_PROXY, UPLOAD_DIR absoluto, troque/changeme cru e em base64, API_DOCS) e `:81-86` (só chaves e mensagens, exit 1); `src/env.test.ts` (T02) | OK |
| S5 | `src/env.ts:23,50-53` (recusa `true`; número sem `.`/`:` não casa `IP_OU_CIDR`) | OK |
| S6 | `src/env.ts:54-58`; `src/env.test.ts` (T48) | OK |

### Senhas e contas

| S# | Evidência | Status |
|---|---|---|
| S7 | `src/lib/senha.ts:6,13` (19456/2/1/32, `hash` assíncrono, sem `algorithm`); `src/lib/senha.test.ts` (T05) | OK |
| S8 | `src/lib/senha.ts:9,35-42` (salt como string hex, `promisify(scrypt)`); `src/modules/auth/service.ts:71` (`senha.migrada`); T06 em `auth.test.ts`/`senha.test.ts` | OK |
| S9 | `src/lib/senha.ts:30-33` (hash fictício); `src/modules/auth/tempo-constante.test.ts` (T07) | OK |
| S10 | `src/lib/forca-senha.ts`; `src/lib/forca-senha.test.ts` (T08: 11/129, previsíveis, contém o login, igual à atual) | OK |
| S11 | `test/seed.test.ts` (T09); `scripts/cli.test.ts` › "recusa rodar com NODE_ENV=production"; o README não traz senhas (linhas 22-27) | OK |
| S12 | `scripts/importar-v1/transformar.test.ts` (T10); `scripts/cli.test.ts` › "usuario:redefinir-senha…" | OK |
| S13 | `src/plugins/autenticacao.ts:40-48` (padrão `['ATIVA']`); `src/modules/auth/routes.ts:34,50,140`; `src/modules/auth/senha.test.ts` (T11) | OK |
| S14 | `auth.test.ts` e `usuarios.test.ts` (T12) | OK |
| S15 | `src/modules/auth/service.ts:150-163` (transação, revoga as outras, `promoverSessao`, auditoria); `senha.test.ts` (T20) | OK |
| S16 | `src/modules/usuarios/acoes.ts:36` (revoga todas); `acoes.test.ts` › "T21: redefinir senha…" | OK |

### Sessões

| S# | Evidência | Status |
|---|---|---|
| S17 | `src/lib/sessao.ts:39-41,76` (32 bytes em base64url, sha256); `auth.test.ts` (T18) | OK |
| S18 | `src/lib/sessao.ts:37-38,60-64,143-151`; `test/sessao.test.ts` (T19) | OK |
| S19 | `src/lib/sessao.ts:104-112` (`promoverSessao`, token novo); `mfa.ts:97,143`; `service.ts:163` | OK |
| S20 | `src/modules/usuarios/service.ts:168-172` (perfil, área, desativação), `acoes.ts:36,59,70,127`, `mfa.ts:139,194`, `sessoes.ts:33`; `acoes.test.ts` (T21, "reativar não revive") | OK. Revogar tokens de API: Fase 2 (T-17.1/T-17.2) |
| S21 | `src/lib/sessao.ts:36,85-96`; `sessoes.test.ts`/`sessao.test.ts` (T22) | OK |
| S22 | `src/lib/sessao.ts:35,199-213`; `auth.test.ts` (T17) | OK |
| S23 | `src/plugins/autenticacao.ts:29-31`; `sessao.ts:118` (regex do token); `auth.test.ts` (T23) | OK |
| S24 | `src/modules/auth/sessoes.ts` (listar, revogar, encerrar todas); `sessoes.test.ts` | OK |
| S25 | `src/jobs/sessoes-limpeza.ts`; `src/jobs/index.ts:108`; `jobs-limpeza.test.ts` | OK |

### 2FA

| S# | Evidência | Status |
|---|---|---|
| S26 | `src/modules/auth/estados.ts:9-19`; `mfa.test.ts` (T24) | OK |
| S27 | `src/lib/cripto.ts:7` (AES-256-GCM `v1:`); `mfa-cadastro.test.ts` (T25) | OK |
| S28 | `src/lib/totp.ts:18-19`; `mfa.ts:37-48,85` (5 falhas, `falhas_login`); `mfa.test.ts` (T26) | OK |
| S29 | `mfa.ts` (iniciar/confirmar); `mfa-cadastro.test.ts` | OK |
| S30 | `mfa.ts:167` (regenerar); auditoria `mfa.recuperacaoUsada`; `mfa.test.ts`/`mfa-cadastro.test.ts` (T27) | OK |
| S31 | `src/modules/usuarios/acoes.ts:47-59` (senha do admin, revoga, `mfa.removido`); `acoes.test.ts` › "resetar 2FA…" | OK |

### CSRF, CORS e Content-Type

| S# | Evidência | Status |
|---|---|---|
| S32 | `src/plugins/seguranca.ts:247-259` (vale para o login, que é público); `auth.test.ts`/`test/seguranca.test.ts` (T28); produção: POST com `Origin: https://evil.test` → 403 `ORIGEM_INVALIDA` | OK |
| S33 | `src/lib/sessao.ts:51-58` (HMAC, `timingSafeEqual`); `seguranca.ts:261-262`; T28 | OK |
| S34 | `src/app.ts:120`; `src/modules/seguranca/routes.ts:10-20` (parser `csp-report` só nesse plugin); `test/seguranca.test.ts` (T29) | OK |
| S35 | Sem `@fastify/cors` no `app.ts`/package; `test/seguranca.test.ts` (T30); produção: OPTIONS com Origin externo → 404 sem `Access-Control-*` | OK |
| S36 | `src/realtime/handshake.ts:19`; `handshake.test.ts` (T52, "recusa Origin externo, ausente e null") | OK |
| S37 | `apps/api/.env.example:7`; `apps/web/vite.config.ts:14-18` (proxy sem `changeOrigin`) | OK |

### Limites, bloqueio e proxy

| S# | Evidência | Status |
|---|---|---|
| S38 | `src/app.ts:107` (`trustProxy: env.TRUST_PROXY`), `:166` (`req.ip`); `test/bloqueio.test.ts` (T15) | OK |
| S39 | Global `app.ts:160-167` (300/min, `u:`/`ip:`). Por rota: login `auth/routes.ts:18`, 2fa `:74`, trocar-senha `:140`, upload `anexos/routes.ts:25`, busca `busca/routes.ts:16`, CSP `seguranca/routes.ts:26`, comentário `assentamentos/routes.ts:37`, mencionáveis `mencoes/routes.ts:30`, leitura `leituras/routes.ts:19`, contagens `chamados/routes.ts:58`; 429 em `plugins/erros.ts:77`; `bloqueio.test.ts` (T16) | OK |
| S40 | `src/modules/auth/service.ts:33-60` (`login.bloqueado`); `bloqueio.test.ts` (T13, "S40: … login.bloqueado uma única vez"); desbloqueio em `acoes.test.ts` | OK |
| S41 | `src/app.ts:159`; `plugins/erros.ts:82` (503 `INDISPONIVEL`) | OK |
| S42 | `src/app.ts:108-116`; `auth.test.ts` (T14) | OK |

### Autorização

| S# | Evidência | Status |
|---|---|---|
| S43 | `src/plugins/autenticacao.ts:41-44`; `test/seguranca.test.ts` (T41) | OK |
| S44 | `src/autorizacao/chamados.ts`, usado em consultas, painel, relatórios, busca, notificações, anexos, leituras, menções e realtime (grep); `test/escopo-equivalencia.test.ts` (T33) | OK |
| S45 | `AND: [escopoChamados(u), …]` em `chamados/consultas.ts:174,244,313`, `painel/service.ts:40`, `relatorios/service.ts:74`, `busca/service.ts:22`, `ativos/service.ts:83`, `notificacoes/service.ts:32`; nenhum `...escopo` (grep); T34 em lista, painel e relatórios | OK |
| S46 | `chamados/acoes.ts:90`, `anexos/service.ts:51,248`; `test/chamados-matriz.test.ts` (T33, "inexistente responde igual a fora do escopo") | OK |
| S47 | `chamados/acoes.ts:89-94` (escopo, depois ação) e `atualizarComVersao` (versão); permissão no `preValidation` | OK |
| S48 | `usuarios/service.ts:128-147` (advisory lock + contagem na transação); `usuarios.test.ts` (T39) | OK |
| S49 | `chamados/consultas.ts:279`, `anexos/service.ts:196,227`; `assentamentos.test.ts` (T35) | OK |
| S50 | `chamados/service.ts:123-204`; `abrir.test.ts` (T38) | OK |
| S51 | `usuarios.test.ts` › "busca: ≤ 20, só ativos…" e "403 na busca para USUARIO"; `busca.test.ts` (S107) | OK. Avatar: Fase 2 (T-17.8) |
| S52 | `mencoes.test.ts` (T59: menção sem acesso não notifica nem dá acesso) | OK |
| S53 | `realtime/revalidacao.test.ts` (T56) | OK |

### Validação

| S# | Evidência | Status |
|---|---|---|
| S54 | `z.strictObject` nos contratos (`packages/shared/src/modulos/*`); `test/seguranca.test.ts` (T32, chave desconhecida); `vazamento-segredos.test.ts` (T40) | OK |
| S55 | `src/lib/prisma.ts:14-21` (`omit` global); grep do CI contra `data: req.body` (`ci.yml:29`); T40 | OK |
| S56 | `packages/shared/src/limites.ts` (todos os campos da tabela, conferidos) | OK |
| S57 | `packages/shared/src/http.ts:21-22`; `chamados/lista.test.ts` (T42) | OK |
| S58 | `relatorios.ts:17` / `auditoria/service.ts:9` (366 dias); `auditoria.test.ts` › "período acima de 366 dias" | OK |
| S59 | `src/plugins/erros.ts:41-58` (P2002, 23P01, 23514, P2025, P2034, P2003); `test/seguranca.test.ts` (T51) | OK |
| S60 | `ci.yml:29` (grep `$queryRawUnsafe`/`$executeRawUnsafe`); `Prisma.raw` só em `scripts/importar-v1/gravar.ts:104-105` e `scripts/e2e-preparar.ts:27-31`, ambos validados por regex | OK |
| S61 | `src/app.ts:113-114`; `lib/config.ts:13` (`Object.hasOwn`); T32 | OK |
| S62 | `escaparLike` em todos os `contains` (grep: 20 ocorrências, nenhuma sem o escape); `busca.test.ts` (T62, "% não devolve tudo") | OK |

### Anexos

| S# | Evidência | Status |
|---|---|---|
| S63 | `anexos/service.ts:46-91` (escopo, encerrado, habilitados, cota, interno, `assentamentoId` em 10 min, herda `interno`); `anexos.test.ts` (T47) | OK |
| S64 | `src/app.ts:168-177`; `anexos/service.ts:117` (≤ `anexos.tamanhoMaxMb`); T44 | OK |
| S65 | `src/lib/armazenamento.ts:59-90` (tmp, sha256, `rename`, `rm` no finally); `tipo-arquivo.ts:67`; T44 ("tmp/ fica vazio") | OK |
| S66 | `src/lib/tipo-arquivo.ts`; `tipo-arquivo.test.ts` (T43: cfb, csv, NUL, svg, MZ) | OK |
| S67 | `src/lib/armazenamento.ts:24,41-43`; T45 | OK |
| S68 | `tipo-arquivo.test.ts` › "remove NUL, barras e pontos iniciais…", "normaliza para NFC" (T45) | OK |
| S69 | `src/env.ts:54-58`; `app.ts:231` (static só `WEB_DIST_DIR`) | OK |
| S70 | `anexos/routes.ts:66-73`; `anexos.test.ts` (T46) | OK |
| S71 | `anexos/service.ts:227,248`; T47 | OK |
| S72 | `scripts/importar-v1/arquivos.ts:7-9,99` (DiscoLocal + `detectarTipo`) | OK |

### Cabeçalhos e front

| S# | Evidência | Status |
|---|---|---|
| S73 | `src/app.ts:123-148`; `test/seguranca.test.ts` (T31, por conjunto de diretivas); produção: CSP idêntica, com `wss://vinimon.onrender.com` e `upgrade-insecure-requests` | OK |
| S74 | `src/app.ts:72,149-157`; T31; produção: XFO DENY, Referrer same-origin, nosniff, COOP/CORP, HSTS, Permissions-Policy | OK (HSTS com `includeSubDomains` a mais, baixa) |
| S75 | `modules/seguranca/routes.ts:5-33` (8 KB, sem CSRF), `service.ts` (resume e loga) | OK |
| S76 | `src/plugins/spa.ts:19-27`; `saude/routes.ts:8-13`; produção: `/` `no-cache`, `/assets/*.js` `immutable`, `/rota-qualquer` → index, `/saude` → `{"ok":true}` | OK |
| S77 | `apps/web/index.html` (só `<script src>`); `apps/web/public/theme-init.js:1` (`jitless`) | OK |
| S78 | `components/display/markdown.tsx:15-42`; `markdown.test.tsx`; `ci.yml:29` (grep de `dangerouslySetInnerHTML`/`innerHTML`); sem iframe/embed/object (grep) | OK |
| S79 | `apps/web/src/routes/login.tsx:12` (schema do `redirect`); `login.test.tsx` › "…com redirect externo vai para /" | OK |
| S80 | `apps/web/src/lib/storage.ts` (único ponto, `limparDadosDoUsuario`); `features/auth/queries.ts:116-117` | OK |
| S81 | `apps/web/vite.config.ts:21` (`sourcemap: 'hidden'`) | Pendente (média): `.map` servidos publicamente em produção |
| S82 | `packages/shared/src/csv.ts:8` | OK |

### Logs e auditoria

| S# | Evidência | Status |
|---|---|---|
| S83 | `src/app.ts:59-71,93-104`; `test/logs.test.ts` (T49) | OK |
| S84 | `autenticacao.ts:35` (`usuarioId` no log filho), `genReqId`; segredos só em corpo/cookie (contratos); `logs.test.ts` | OK |
| S85 | `ci.yml:30` (grep `console.log`); o 500 sem stack ao cliente vem do T51 | OK |
| S86 | Triggers da migração (§4.3); `auditoria.test.ts` (T50, 42501 em UPDATE/DELETE) | OK |
| S87 | Todas as ações da lista aparecem em `auditar(...)` (grep: login.*, logout, sessao.revogada, senha.*, mfa.*, usuario.*, cadastro.*, config.alterada, chamado.abertoEmNome, exportacao.csv, anexo.excluido); `auditoria.test.ts` › "grava atorId, ip e requestId" | OK |
| S88 | `src/jobs/auditoria-purga.ts:4-10`; `jobs-limpeza.test.ts` (T50) | OK |
| S89 | `modules/auditoria` (lista filtrável e paginada); `auditoria.test.ts` › "lista com filtros…" | OK |

### Tempo real

| S# | Evidência | Status |
|---|---|---|
| S90 | `src/realtime/plugin.ts:34` (`maxHttpBufferSize: 16_384`); `handlers.test.ts` (T57) | OK |
| S91 | `realtime/plugin.ts:26,50-53`; `handshake.ts:34` (Bearer); `handshake.test.ts` (T52, 11º socket) | OK |
| S92 | `realtime/salas.ts`; `handlers.test.ts` (T53) | OK |
| S93 | `salas.ts:7`, `lib/tempo-real.ts:27`; `handlers.test.ts` (T54) | OK |
| S94 | `realtime/revalidacao.ts`; `revalidacao.test.ts` (T55) | OK |
| S95 | `realtime/handlers.ts:74-77`; T57 | OK |
| S96 | `realtime/limites.ts`; T57 (21ª `digitando`) | OK |
| S97 | `realtime/presenca.ts:36-51`; `presenca.test.ts` (T58) | OK |
| S98 | `handlers.test.ts` (T54, leitura) | OK |
| S99 | `realtime/handlers.ts` chama os services HTTP (assentamentos); T54 | OK |

### Menções, feed, notificações e busca

| S# | Evidência | Status |
|---|---|---|
| S100 | `mencoes.test.ts` (T59, 21 menções dão 400) | OK |
| S101 | `notificacoes/fanout.ts`/`regras.ts` (podeVerChamado/podeVerInterno); T59 | OK |
| S102 | `notificacoes.test.ts` (T61) | OK |
| S103 | `notificacoes/service.ts:32` (`whereNotificacoesVisiveis`); `notificacoes.test.ts` (T60) | OK |
| S104 | `apps/web/src/features/notificacoes/desktop.ts:61`; `desktop.test.ts` › "o body nunca contém o texto do comentário"; `desktop-notifications-prompt.tsx:15` (permissão no clique) | OK (o E2E T69 é da trilha T-11.5–T-11.7) |
| S105 | `notificacoes.test.ts` (T61, só `usuario:<id>`) | OK |
| S106 | `busca/service.ts:18-29`; `busca.test.ts` › "S106/T62…" | OK |
| S107 | `busca.test.ts` › "S107/T62…" | OK |
| S108 | `artigos/service.ts` (filtro de visibilidade); `artigos.test.ts` | OK |

### Dependências

| S# | Evidência | Status |
|---|---|---|
| S109 | `pnpm-workspace.yaml` (`savePrefix: ''`); `pnpm-lock.yaml` versionado; `ci.yml:34` (`--frozen-lockfile`) | OK |
| S110 | `apps/api/package.json:31,32,59` (7.10.1); `ci.yml:40-41` (T04) | OK |
| S111 | `ci.yml:35` | **Pendente (alta)**: o passo falha hoje (undici 7.29.1, GHSA-xjj6-f33q-929c) |
| S112 | `renovate.json` (`minimumReleaseAge: 3 days`, sem `automerge`) | OK |
| S113 | `pnpm-workspace.yaml` (`minimumReleaseAge: 1440`, `allowBuilds` esbuild/prisma/@prisma/engines) | OK |
| S114 | `.nvmrc` = 24; `deploy/vinimon.service` (`User=vinimon`, `ProtectSystem=strict`) | OK |

### Banco, backup e deploy

| S# | Evidência | Status |
|---|---|---|
| S115 | `scripts/papeis-postgres.sql`; `docs/operacao.md:13` | OK |
| S116 | `docker-compose.yml:7` (`127.0.0.1:5432`) | OK |
| S117 | `deploy/api.env.example:14-15` (`sslmode=require`) | OK |
| S118 | `deploy/Caddyfile:7`; `api.env.example:5,9` | OK |
| S119 | `scripts/backup.sh`, `deploy/vinimon-backup.{service,timer}`, `docs/operacao.md:102` (restic, 7/4/12) | OK (artefato; a execução no servidor não foi verificada aqui) |
| S120 | `scripts/teste-restauracao.sh`, `deploy/vinimon-restauracao.timer` (mensal), `operacao.md:108` | OK (artefato) |
| S121 | `scripts/release.sh:3,11-13` (`set -euo pipefail` antes do restart) | OK |

### LGPD

| S# | Evidência | Status |
|---|---|---|
| S122 | `usuarios/acoes.ts:91-128`; `acoes.test.ts` › "anonimizar (S122)…" e "anonimizar: 409…" | OK |
| S123 | `jobs/sessoes-limpeza.ts` (falhas 24 h), `notificacoes-limpeza.ts` (lidas, `retencaoDias`), `auditoria-purga.ts` (365 dias), `operacao.md:143` (journald 90 dias); `jobs-limpeza.test.ts` | OK |
| S124 | `GET /me/exportar` | Fase 2 (T-17.8) |

S125–S145 ficam fora desta revisão: LDAP, tokens de API e e-mail entram na Fase 2/3, nas tarefas que a §5.1 indica.

## Verificações manuais (2026-10-24)

### Cabeçalhos em produção
Comandos: `curl -sI https://vinimon.onrender.com/` e `curl -si https://vinimon.onrender.com/api/v1/saude`.

| Cabeçalho | Valor | Situação |
|---|---|---|
| CSP | Igual à S73 (`connect-src 'self' wss://vinimon.onrender.com`, `frame-ancestors 'none'`, `upgrade-insecure-requests`) | Conforme |
| HSTS | `max-age=31536000; includeSubDomains` | Conforme |
| `x-content-type-options` | `nosniff` | Conforme |
| `x-frame-options` | `DENY` | Conforme |
| `referrer-policy` | `same-origin` | Conforme |
| COOP/CORP | `same-origin` | Conforme |
| Permissions-Policy | Conforme a S74 | Conforme |
| `Access-Control-Allow-Origin` | Ausente | Conforme |
| `Cache-Control` | `/` → `no-cache`; `/assets/*.js` → `public, max-age=31536000, immutable`; `/api/v1/saude` → **ausente** | Observação baixa (ver acima) |

Outras checagens:

| Requisição | Resposta |
|---|---|
| `POST /api/v1/auth/login` com `Origin: https://evil.test` | 403 `ORIGEM_INVALIDA` |
| `OPTIONS` com Origin externo | 404, sem cabeçalhos CORS |
| `/docs` e `/api/v1/openapi.json` | 404 (`API_DOCS` desligado) |
| `/assets/index-DpwhaQ6B.js.map` | **200** (pendência S81) |

### `pnpm audit --prod`
`3 vulnerabilities found — Severity: 2 moderate | 1 high`. Todas são de `undici@7.29.1` (corrigido em 7.30.1), via `@scalar/fastify-api-reference > @scalar/json-magic`:

| Severidade | Aviso | Descrição |
|---|---|---|
| Alta | GHSA-xjj6-f33q-929c | DoS por excesso de content-encodings |
| Moderada | GHSA-4qv8-2p9j-2685 | DoS no parser de EventSource |
| Moderada | GHSA-f72v-6w45-q472 | Bypass de SRI |

Ver pendência S111.

### Segredos no histórico
- **gitleaks:** não está instalado neste ambiente, então `gitleaks detect` não foi executado aqui. Ele roda no CI a cada push/PR (`ci.yml:21-24`).
- **Busca alternativa** em `git log HEAD -p` (219 commits):
  - Padrões de chaves de provedor (`AKIA…`, `-----BEGIN … PRIVATE KEY`, `ghp_`, `github_pat_`, `xox?-`, `sk-`, `sk_live_`, `AIza…`, `rnd_…`): **0 commits**.
  - Atribuições `(PASSWORD|SECRET|ENCRYPTION_KEY|TOKEN|SENHA)… = <12+ caracteres>`: só valores de exemplo ou de teste. São os `CSRF_SECRET`/`ENCRYPTION_KEY` em base64 de "dev-apenas-troque-em-producao…" e "troquetroque…", que o `env.ts` recusa em produção; a `SENHA_TESTE` dos testes; e um placeholder de senha do `vinimon_migrator` em SQL parametrizado. Nenhum segredo real.
- **Arquivos sensíveis no histórico:** `data/VINIMON.db` e `data/ocomon.db` (commit inicial `770aec1`, retirados na T-0.1). Ver S2.

### TLS do host
`testssl.sh` **não foi executado neste ambiente**: a ferramenta não está instalada, a tarefa proíbe instalar algo novo, e a saída HTTPS passa por um proxy do agente, que mascararia o handshake real. Para rodar fora daqui: `testssl.sh --severity MEDIUM https://vinimon.onrender.com`. O TLS de produção é terminado pelo Cloudflare/Render; o HTTP/2 e o HSTS foram observados.
