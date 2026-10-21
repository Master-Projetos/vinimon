> Parte B (tarefas). Antes de executar qualquer tarefa leia `CLAUDE.md`, `docs/plano/tarefas/00-convencoes.md` e as seções da Parte A citadas no cartão (mapa §→arquivo em `docs/plano/README.md`).

### Fase 12 — (Fase 2) E-mail e recuperação de senha

### T-12.1 — Infraestrutura de e-mail (outbox e jobs)
- **Depende de:** MVP · **Paralelo com:** Fases 13 e 14
- **Requisitos:** E03; S145; NOT-7 (`docs/plano/relatorios/seguranca.md`, NOT-7)
- **Arquivos:** `apps/api/prisma/schema.prisma` + migração `email`, `apps/api/src/lib/email.ts`, `apps/api/src/jobs/{email-enviar.ts,email-varrer.ts,index.ts}`, `packages/shared/src/config.ts`, `apps/api/src/lib/email.test.ts`, `apps/api/src/env.ts` (`SMTP_URL: z.url().optional()`), `packages/shared/src/enums.ts` e `apps/api/src/lib/enums-check.ts` (enum `StatusEmail`)
- **Passos:**
  1. Instalar `nodemailer@10.1.7` (exato).
  2. Model `EmailSaida {id Int, para VarChar(254), assunto VarChar(300), texto Text, html Text?, evento VarChar(60), chamadoId Int?, usuarioId Int?, chaveIdempotencia String @unique, status StatusEmail (PENDENTE|ENVIADO|FALHOU) @default(PENDENTE), tentativas Int @default(0), erro VarChar(1000)?, criadoEm, enviadoEm?}` com `@@map("emails_saida")` e índice `(status, criadoEm)`.
  3. Config `email.habilitado` (bool, padrão `false`). Sem `SMTP_URL`, `PATCH` para `true` dá 422.
  4. `email.ts`:
     - `enfileirarEmail(tx, {...})` grava a outbox e devolve o id; depois do commit, `enfileirar('email-enviar', {id}, {retryLimit:5, retryBackoff:true})` (opções aceitas pela interface `Filas` da T-4.3: `startAfter`, `singletonKey`, `retryLimit`, `retryBackoff`);
     - `enviarEmail(id)`: claim `UPDATE … WHERE status='PENDENTE'`; transporte `nodemailer.createTransport(env.SMTP_URL)` (em `NODE_ENV=test`, `{jsonTransport:true}`); cabeçalhos `Auto-Submitted: auto-generated` e `X-Auto-Response-Suppress: All`.
  5. `email-varrer` (`*/5`): pendentes com mais de 5 min são reenfileirados; com mais de 24 h viram FALHOU.
- **Pronto quando:**
  - [ ] teste: envio idempotente (a mesma chave não duplica) e falha que volta a PENDENTE;
  - [ ] Mailpit (`localhost:8025`) recebe em dev;
  - [ ] `pnpm verificar`.
- **Modelo:** Haiku
- **Tamanho:** M

### T-12.2 — Modelos de e-mail
- **Depende de:** T-12.1 · **Paralelo com:** T-12.4
- **Requisitos:** E04
- **Arquivos:** `apps/api/prisma/schema.prisma` + migração, `packages/shared/src/modulos/modelos-email.ts`, `apps/api/src/modules/modelos-email/{service.ts,routes.ts,render.ts,modelos-email.test.ts}`, `apps/api/prisma/seed.ts`
- **Passos:**
  1. Model `ModeloEmail {evento String @id, assunto VarChar(200), corpoTexto Text, ativo Boolean, atualizadoEm}`.
  2. Eventos: `abertura`, `comentario`, `encaminhamento`, `agendamento`, `conclusao`, `rejeicao`, `solicitacao_retorno`, `encerramento_automatico`, `lembrete`, `recuperar_senha`.
  3. `render(modelo, vars)` substitui só a lista fechada `{{numero}}`, `{{assunto}}`, `{{solicitante}}`, `{{area}}`, `{{operador}}`, `{{autor}}`, `{{status}}`, `{{dataAgendamento}}`, `{{link}}` e `{{sistema}}`. A variável desconhecida sai literal. O HTML é gerado do texto com escape e `<br>`.
  4. CRUD `GET/PUT /modelos-email[/:evento]` (`config.gerenciar`) com auditoria.
  5. `POST /modelos-email/teste {para}` (5/h).
  6. O seed cria os padrões em pt-BR (só cria).
- **Pronto quando:**
  - [ ] `<script>` numa variável sai escapado no HTML;
  - [ ] o envio de teste chega ao `jsonTransport`;
  - [ ] `pnpm verificar`.
- **Modelo:** Haiku
- **Tamanho:** M

### T-12.3 — Canal e-mail nas notificações
- **Depende de:** T-12.2 · **Paralelo com:** T-12.4
- **Requisitos:** S101, S102, S145
- **Arquivos:** `apps/api/prisma/schema.prisma` + migração, `packages/shared/src/notificacoes.ts`, `apps/api/src/modules/notificacoes/{fanout.ts,email-notificacao.ts,email.test.ts}`, `apps/api/src/jobs/{email-resumo-diario.ts,index.ts}`, `packages/shared/src/enums.ts` e `apps/api/src/lib/enums-check.ts` (enum `CanalEmail`)
- **Passos:**
  1. `PreferenciaNotificacao.email CanalEmail (NUNCA|IMEDIATO|RESUMO)` com padrão por `preferenciaPadrao` (`docs/plano/relatorios/tempo-real.md` §5.6, coluna E-mail).
  2. Depois do upsert do fanout, para destinatários com IMEDIATO e com `email.habilitado`: `enfileirarEmail` com chave `notif:<id>:<atualizadoEmISO>` e `startAfter: 60`. O job descarta (marca ENVIADO sem enviar, com erro "lida") se a notificação já estiver lida.
  3. Interno: o e-mail diz só "Há um novo comentário interno no chamado #N"; o solicitante **nunca** recebe interno.
  4. `email-resumo-diario` às `0 8 * * *` (tz).
- **Pronto quando:**
  - [ ] o e-mail de comentário interno não contém o texto;
  - [ ] lida antes do envio não envia;
  - [ ] `pnpm verificar`.
- **Modelo:** Haiku
- **Tamanho:** M

### T-12.4 — Recuperação de senha
- **Depende de:** T-12.1 · **Paralelo com:** T-12.2, T-12.3
- **Requisitos:** A11; SEN-10 (`docs/plano/relatorios/seguranca.md`, SEN-10); S10, S20
- **Arquivos:** `apps/api/prisma/schema.prisma` + migração, `packages/shared/src/modulos/auth.ts`, `apps/api/src/modules/auth/{recuperacao.ts,routes.ts,recuperacao.test.ts}`
- **Passos:**
  1. Model `TokenSenha {id, usuarioId, tokenHash Char(64) @unique, expiraEm, usadoEm?, ip?, criadoEm}`.
  2. `POST /auth/esqueci-senha {login}` (público, 3/h por IP e por login): a resposta é **sempre** 202 "Se o login existir, enviaremos instruções". Só envia para usuário ativo, com e-mail, origem LOCAL e `email.habilitado`. Token de 32 bytes, sha256 e validade de 30 min.
  3. `POST /auth/redefinir-senha {token, novaSenha}`: uso único; `validarNovaSenha`; revoga todas as sessões (`revogarSessoesDoUsuario`; a partir da T-17.2, também `revogarTokensDoUsuario` na mesma transação); auditoria `senha.redefinida`.
- **Pronto quando:**
  - [ ] login inexistente e existente recebem a mesma resposta;
  - [ ] token usado ou expirado dá 400;
  - [ ] `pnpm verificar`.
- **Modelo:** Haiku
- **Tamanho:** M

### T-12.5 — Telas de e-mail e recuperação
- **Depende de:** T-12.2–T-12.4 · **Paralelo com:** Fase 13
- **Requisitos:** E03, E04, A11
- **Arquivos:** `apps/web/src/routes/{recuperar-senha.tsx,redefinir-senha.tsx}`, `apps/web/src/routes/_app/admin/modelos-email.tsx`, `apps/web/src/features/modelos-email/queries.ts`, `apps/web/src/features/perfil/components/preferencias-notificacao-table.tsx`, `apps/web/src/routes/login.tsx`
- **Passos:**
  1. Link "Esqueci minha senha" no login, só quando a config pública `email.habilitado` estiver ligada.
  2. Editor de modelos com a lista das variáveis e "Enviar teste".
  3. Coluna "E-mail" na matriz de preferências.
- **Pronto quando:**
  - [ ] E2E acrescentado em `login.spec.ts`: o e-mail aparece no Mailpit (API `GET localhost:8025/api/v1/messages`) e a redefinição funciona;
  - [ ] `pnpm verificar`.
- **Modelo:** Haiku
- **Tamanho:** M
