> Parte B (tarefas). Antes de executar qualquer tarefa leia `CLAUDE.md`, `docs/plano/tarefas/00-convencoes.md` e as seções da Parte A citadas no cartão (mapa §→arquivo em `docs/plano/README.md`).

### Fase 19 — (Fase 3) Entrada externa e identidade

### T-19.1 — Abertura e resposta por e-mail (IMAP)
- **Depende de:** T-12.3 · **Paralelo com:** T-19.5
- **Requisitos:** B18; S139–S145
- **Arquivos:** `apps/api/src/env.ts`, `apps/api/prisma/schema.prisma` + migração, `apps/api/src/lib/email-entrada.ts`, `apps/api/src/jobs/{email-importar.ts,index.ts}`, `apps/api/src/lib/email-entrada.test.ts`, `apps/api/src/lib/{cripto.ts,cripto.test.ts}`, `packages/shared/src/enums.ts`, `apps/api/src/lib/enums-check.ts` (status de `EmailEntrada`), `apps/api/test/fixtures/emails/*.eml`, `apps/api/package.json` (imapflow 2.5.9 e mailparser 3.10.0, versões exatas do plano)
- **Passos:**
  1. Instalar `imapflow@2.5.9` e `mailparser@3.10.0`.
  2. Env `IMAP_URL` e `IMAP_PASTA` (padrão INBOX), `MAIL_AUTHSERV_ID` e `MAIL_RESPOSTA_DOMINIO`.
  3. Model `EmailEntrada {id, messageId @unique, remetente, recebidoEm, chamadoId?, status (PROCESSADO|IGNORADO|TRIAGEM), motivo?}`.
  4. Job `*/2`, com regras anti-loop, `dmarc=pass` via `Authentication-Results`, só `text/plain`, anexos pelo pipeline e limite de 10 chamados por hora por remetente.
  5. Respostas só para `suporte+<id>.<hmac10>@`, com `hmac10` = 10 primeiros caracteres de `hmacProposito('email-resposta', id)`, sendo `hmacProposito(proposito: 'email-resposta' | 'avaliacao', valor) = createHmac('sha256', createHmac('sha256', CSRF_SECRET).update('vinimon:' + proposito).digest()).update(valor).digest()`, em `lib/cripto.ts` (com teste de que propósitos diferentes geram valores diferentes), e remetente participante. Além de participante, o usuário do remetente precisa estar ativo e passar em `podeVerChamado` no momento do processamento. O comentário criado é sempre público (`interno=false`) e passa pelo mesmo service da T-6.3, com `clienteId = uuid determinístico do Message-ID`.
  6. Fila "Triagem" (visão nova, só equipe) para não verificados. Canal "Automático: via e-mail".
- **Pronto quando:**
  - [ ] T65 com os `.eml` de fixture;
  - [ ] ex-participante que perdeu o acesso responde por e-mail e nada é criado;
  - [ ] `hmacProposito('email-resposta', x) !== hmacProposito('avaliacao', x)`;
  - [ ] `pnpm verificar`.
- **Trilha:** C
- **Modelo:** Opus
- **Tamanho:** M

### T-19.2 — OIDC (SSO)
- **Depende de:** Fase 2 · **Paralelo com:** T-19.1
- **Requisitos:** A13; S26
- **Arquivos:** `apps/api/src/env.ts`, `apps/api/src/lib/oidc.ts`, `apps/api/src/modules/auth/{oidc.ts,routes.ts,oidc.test.ts}`, `apps/api/prisma/schema.prisma` + migração, `packages/shared/src/enums.ts`, `apps/api/src/lib/enums-check.ts`
- **Passos:**
  1. `npm view openid-client version`; fixar a versão exata com mais de 24 h.
  2. Env `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` e `OIDC_REDIRECT` (todas ou nenhuma).
  3. Fluxo authorization code + PKCE, com `state` e `nonce` em cookie `__Host-` HttpOnly de 10 min. O e-mail precisa estar verificado.
  4. Mapeia para usuário existente pelo e-mail (origem `OIDC`, novo valor do enum `OrigemAutenticacao` da T-13.1, também em `enums.ts`). Não cria usuário: isso depende de T-19.3.
  5. Depois, a sessão segue S26 (TOTP local para a equipe).
- **Pronto quando:**
  - [ ] teste com provedor simulado (`vi.mock`): `state` errado dá 400;
  - [ ] `pnpm verificar`.
- **Trilha:** C
- **Modelo:** Opus
- **Tamanho:** M

### T-19.3 — Auto-cadastro com aprovação
- **Depende de:** T-12.1 · **Paralelo com:** T-19.2
- **Requisitos:** A14
- **Arquivos:** `apps/api/prisma/schema.prisma` + migração, `packages/shared/src/{config.ts,modulos/cadastro.ts}`, `apps/api/src/modules/cadastro/{service.ts,routes.ts,cadastro.test.ts}`
- **Passos:**
  1. Config `cadastro.habilitado` (padrão `false`) e `cadastro.dominiosPermitidos: string[]`.
  2. Model `CadastroPendente {id, login, nome, email, departamentoId?, tokenHash, confirmadoEm?, criadoEm}`.
  3. `POST /publico/cadastro` (3 por hora por IP; resposta genérica): envia e-mail de confirmação.
  4. O ADMIN aprova, o que cria o USUARIO com senha definida pelo link de redefinição (T-12.4).
- **Pronto quando:**
  - [ ] domínio fora da lista é ignorado em silêncio;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** M

### T-19.4 — Formulário sem login e avaliação por link
- **Depende de:** T-12.2, T-19.1 · **Paralelo com:** —
- **Requisitos:** B19, E07
- **Arquivos:** `apps/api/src/modules/publico/{service.ts,routes.ts,publico.test.ts}`, `packages/shared/src/{config.ts,modulos/publico.ts}`, `apps/api/src/app.ts`, `apps/api/src/lib/cripto.ts`
- **Passos:**
  1. Config `publico.formularioHabilitado` e `publico.problemaId`.
  2. `POST /publico/chamados` (`publico`, 5/h por IP, campo honeypot `site` que precisa vir vazio): cria o chamado no usuário técnico `formulario.publico` (seed, inativo para login), com canal "Sistema Web" e o contato no corpo.
  3. Link de avaliação `hmacProposito('avaliacao', chamadoId|exp)` (`lib/cripto.ts`, criado na T-19.1) com 14 dias de validade: `GET/POST /publico/avaliacao/:token`, uso único (guarda o `jti` no `dados` do evento).
- **Pronto quando:**
  - [ ] token alterado ou expirado dá 400;
  - [ ] o honeypot preenchido descarta;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Sonnet
- **Tamanho:** M

### T-19.5 — Listas de distribuição
- **Depende de:** T-12.2 · **Paralelo com:** T-19.1, T-19.4
- **Requisitos:** E05
- **Arquivos:** `apps/api/prisma/schema.prisma` + migração, `apps/api/src/modules/listas-email/{service.ts,routes.ts,listas.test.ts}`, `apps/api/src/modules/modelos-email/service.ts`
- **Passos:**
  1. Model `ListaEmail {id, nome @unique, emails String[] (≤ 100, z.email)}`.
  2. `ModeloEmail.listaIds Int[]` como destinatários extras, só para eventos sem conteúdo interno.
- **Pronto quando:**
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** P

### T-19.6 — Telas de entrada externa e identidade
- **Depende de:** T-19.1–T-19.5 · **Paralelo com:** Fase 20
- **Requisitos:** B18, B19, E05, E07, A13, A14
- **Arquivos:** `apps/web/src/routes/{publico/abrir.tsx,publico/avaliacao.$token.tsx,cadastro.tsx}`, `apps/web/src/routes/_app/admin/{cadastros-pendentes.tsx,listas-email.tsx}`, `apps/web/src/features/chamados/components/visoes-pane.tsx`, `apps/web/src/routes/login.tsx`, `apps/web/src/routes/{cadastro.test.tsx,_app/admin/cadastros-pendentes.test.tsx}`
- **Passos:** páginas públicas fora do `_app`, botão "Entrar com SSO", aprovação de cadastros, listas e a visão "Triagem".
- **Pronto quando:**
  - [ ] T66 (CSP) sem violação nas páginas públicas;
  - [ ] `cadastro.test.tsx` e `cadastros-pendentes.test.tsx` com `renderRota` + `apiFalsa` (T-9.16): (a) renderiza com os dados; (b) o submit chama o contrato esperado com o body esperado; (c) 400 com `detalhes` aparece no campo; (d) 403/404 mostram `ErrorState`;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** M
