# Registro de revisão do plano

O plano foi produzido em 21/10/2026 por 6 especialistas e 2 sínteses. Depois, passou por dois revisores adversariais:
- **R1:** executabilidade por Haiku e correção técnica das APIs;
- **R2:** cobertura, segurança e performance.

Os revisores levantaram 65 problemas (R1-1…R1-33 e R2-1…R2-32), que foram todos aplicados nos arquivos de `fundamentos/`, `tarefas/` e `CLAUDE.md`. Um verificador independente conferiu a aplicação, e as 6 lacunas restantes foram corrigidas em seguida.

Principais mudanças:
- novas tarefas **T-9.16**, infraestrutura de teste de telas (`renderRota` + `apiFalsa`), e **T-10.0**, rotas placeholder;
- critérios "manual" das telas substituídos por testes de rota;
- APIs reais corrigidas:
  - zxcvbn-ts 4 (`ZxcvbnFactory`);
  - P2002/P2039 do Prisma 7 com adapter (`CAMPO_POR_INDICE`, `originalCode`);
  - `$on('query')` com log por evento;
  - `vi.mock` do argon2;
  - `timeStep` do otplib;
- comandos corrigidos:
  - `mkdir` antes do `git mv`;
  - `psql` via `docker compose exec`;
  - sem `--` nos scripts pnpm;
  - `--passWithNoTests`;
  - `db:teste:recriar`;
  - `tsr generate`;
- E2E: `cwd` do webServer, `storageState` por usuário (evita replay de TOTP), `page.clock`;
- segurança:
  - teste T40 (segredos nas respostas);
  - equivalência entre `escopoChamados` e `podeVerChamado`;
  - escopo em relatórios e CSV;
  - tokens de API revogados junto com as sessões;
  - sem sinais laterais de conteúdo interno;
  - tags só para a equipe;
  - anonimização completa (LGPD);
  - localStorage por usuário;
  - HMAC com separação de propósito;
  - prévia só de imagens;
- performance: painel com `count`, debounce e throttle nas contagens, atores do feed numa única consulta, EXPLAIN ampliado;
- importação idempotente: uuid determinístico dos anexos, sem enxurrada de alertas de SLA, invariantes conferidas;
- nomes: recursos Teams como **TM1–TM8**, sem colidir com os testes T01–T72.

**Decisão D-1 (auditoria).** As revisões conflitavam sobre o trigger. Ficou assim:
- `BEFORE UPDATE … FOR EACH STATEMENT` sempre bloqueia;
- `BEFORE DELETE … FOR EACH ROW` só permite com a GUC `vinimon.purga_auditoria='on'` e registro com mais de 365 dias;
- não há trigger de TRUNCATE.

**Modelo por tarefa** (pedido do usuário): Haiku nas 170 tarefas mecânicas e Sonnet nas 43 críticas. Cada cartão traz a linha `Modelo:`.
