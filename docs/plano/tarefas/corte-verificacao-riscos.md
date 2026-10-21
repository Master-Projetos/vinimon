> Parte B, §9–§11: migração e corte, verificação ponta a ponta, riscos.

## 9. Migração de dados e corte

**Pré-requisitos:**
- MVP aceito em homologação (§10);
- T-11.3 e T-11.8–T-11.10 concluídas;
- janela de corte aprovada (sugestão: sexta-feira, 18h, com 4 h de janela; RTO de 4 h).

1. **Identificar o banco vivo.** A v1 usa `VINIMON_DB` ou `./data/VINIMON.db`; o README antigo cita `ocomon.db`. No servidor da v1, rode:
   ```bash
   node -e "const {DatabaseSync}=require('node:sqlite');for(const f of process.argv.slice(1)){const d=new DatabaseSync(f,{readOnly:true});console.log(f,d.prepare('SELECT count(*) n, max(data_abertura) ult FROM chamados').get())}" data/VINIMON.db data/ocomon.db
   ```
   O arquivo com o `ult` mais recente é o de produção. Registre esse caminho no runbook.
2. **Backup inicial e checksum.** Copie `<db>`, `<db>-wal` e `<db>-shm` para um armazenamento fora do servidor e grave o `sha256sum`. Este é o backup B0.
3. **Provisionar a v2 em homologação:**
   - Postgres com `scripts/papeis-postgres.sql`;
   - `api.env` com segredos novos (S4);
   - `scripts/release.sh`.
   - **Não** rode `db:seed`: o importador faz o `seedBase`.
4. **Dry-run em homologação** sobre uma cópia de B0:
   ```bash
   pnpm -F @vinimon/api importar:v1 --sqlite /tmp/b0/VINIMON.db --dry-run
   ```
   - Erros abortam: corrija os dados **na cópia** (por exemplo, `UPDATE` de data inválida via `node:sqlite`) e documente cada correção. Repita na v1 real no dia do corte, ou aceite o aviso.
   - Avisos (e-mail duplicado, operador sem área, cor inválida): revise e aceite.
5. **Ensaio completo em homologação:**
   1. execução real, sem `--dry-run`, com `--exigir-troca-todos` (obrigatório: os `.db` com hashes estiveram no git);
   2. `UPLOAD_DIR` de homologação;
   3. criar o admin de emergência com `pnpm -F @vinimon/api cli usuario:redefinir-senha admin`;
   4. validar (passo 6);
   5. testar logins com senhas reais da v1: devem pedir troca de senha e, para a equipe, 2FA;
   6. contas listadas com hash anulado: usar `cli usuario:redefinir-senha`.
   - Para refazer o ensaio, um DBA faz `DROP DATABASE`/`CREATE DATABASE` e roda `db:deploy` de novo. Nunca `migrate reset`.
6. **Validação de contagens.** Cada linha precisa bater, com tolerância zero.

   | Entidade | SQLite (v1) | Postgres (v2) |
   |---|---|---|
   | áreas | `SELECT count(*) FROM areas` | `SELECT count(*) FROM areas` |
   | usuários | `… FROM usuarios` | `… FROM usuarios` |
   | locais → departamentos | `… FROM locais` | `… FROM departamentos WHERE unidade_id = (SELECT id FROM unidades WHERE nome='Principal')` |
   | prioridades / status / problemas | idem | idem, com status ≥ v1 (podem existir papéis criados) |
   | equipamentos → ativos | `… FROM equipamentos` | `… FROM ativos` |
   | faq → artigos | `… FROM faq` | `… FROM artigos` |
   | chamados | `count(*)`, `max(id)`, `sum(status encerrado)` | `count(*)`, `max(id)`, `count(*) FILTER (WHERE status_tipo='ENCERRADO')` |
   | assentamentos | `count(*)`, `sum(tipo='privado')` | `count(*)`, `count(*) FILTER (WHERE interno)` |
   | anexos | `count(*)`, `sum(length(dados))` | `count(*)`, `sum(tamanho)` + `find $UPLOAD_DIR -type f \| wc -l` |

   Faça também:
   - amostra manual de 20 chamados aleatórios (assunto, solicitante, operador, histórico e anexos abrem);
   - `SELECT last_value FROM chamados_id_seq` = `max(id)+1`;
   - abertura de um chamado novo, que deve receber `max+1`.
7. **Comunicação.** Avise com D-5 e D-1: data, indisponibilidade, primeiro acesso com troca de senha, 2FA para a equipe (apps recomendados) e o novo endereço HTTPS.
8. **Congelamento da v1** no início da janela:
   - pare o processo (Windows: feche o `iniciar.bat` ou `nssm stop`);
   - confirme que nada escreve (o `-wal` não muda por 1 min);
   - faça o backup B1 com checksum. B1 é a fonte da migração.
9. **Migração definitiva:**
   1. banco de produção vazio com `db:deploy`;
   2. `importar:v1 --sqlite <B1> --dry-run`, depois sem `--dry-run`, ambos com `--exigir-troca-todos`;
   3. validação do passo 6;
   4. backup imediato da v2 (`scripts/backup.sh`).
10. **Troca:**
    - DNS ou Caddy apontando para a v2;
    - `systemctl start vinimon`;
    - `curl -fsS https://<host>/api/v1/saude/pronto`;
    - o admin entra, troca a senha e cadastra o 2FA;
    - smoke test: abrir chamado, comentar com chat ao vivo, anexar, concluir e validar;
    - libere o acesso.
11. **Pós-corte:**
    - monitorar por 48 h (`journalctl -u vinimon -p warning`, `/saude/pronto`, fila `pgboss`, tamanho de `UPLOAD_DIR`);
    - a v1 fica desligada, com B1 guardado por 90 dias.
    - **Rollback:** até D+1, se houver falha crítica sem correção em 4 h, pare a v2 e religue a v1 com B1. Registros criados na v2 nesse intervalo são relançados à mão a partir do relatório `GET /chamados/exportar`. Depois de D+1, não há rollback; os problemas viram correção à frente.
12. **Limpeza:**
    - apagar `data/` do diretório de trabalho do repositório (já ignorado) depois de confirmar B0 e B1;
    - decidir sobre `git filter-repo` (S2) e registrar a decisão em `SECURITY.md`;
    - rodar o primeiro `teste-restauracao.sh`.

---

## 10. Verificação ponta a ponta

**Automatizada** (tudo verde é condição para o aceite):
1. **CI no `main`:** gitleaks, higiene, `pnpm audit --prod --audit-level=high`, `biome ci`, `pnpm typecheck`, `pnpm test` (API, shared e web) e `pnpm build`.
2. **SLA em dois fusos:** `pnpm -F @vinimon/api test:sla-tz`.
3. **E2E:** `pnpm test:e2e` (login, fluxo do chamado, tempo real, segurança e a11y), com 3 repetições sem falha intermitente (`--repeat-each=3`).
4. **Rastreabilidade:** `rastreabilidade.test.ts` (T-11.11) e `docs/plano/revisao-seguranca.md` sem pendência alta.
5. **Desempenho:** `scripts/carga.ts` + `EXPLAIN`, com metas da T-11.12 atendidas e orçamento de bundle respeitado.
6. **Restauração:** `scripts/teste-restauracao.sh` sai com 0 em homologação.
7. **Importação:** o dry-run e a importação real de homologação passam na validação de contagens da §9.

**Manual** (homologação HTTPS, Chrome e Firefox, mais um celular), com um roteiro por papel:
- **ADMIN:**
  - primeiro acesso → troca de senha → 2FA → códigos;
  - cadastrar jornada Comercial, feriado, área, problema (com SLA) e prioridade `#ffff00` (contraste ≥ 4,5);
  - criar operador e usuário;
  - configurações (anexos desligados → o dropzone some);
  - auditoria lista tudo;
  - redefinir a senha de um usuário, que é obrigado a trocar;
  - resetar o 2FA de um operador.
- **USUARIO:**
  - abrir chamado com PNG e ver a sugestão de artigo;
  - reincidência aparece ao escolher um ativo com chamados anteriores;
  - não vê tags, comentário interno, pessoas no Ctrl+K nem Admin;
  - validar com "Bom"; rejeitar outro chamado com motivo;
  - cancelar um chamado sem operador;
  - ativar notificações na área de trabalho por clique; o conteúdo não aparece na notificação.
- **OPERADOR** (duas janelas: operador e usuário):
  - assumir;
  - "digitando…" e "Visto por" em ≤ 2 s;
  - menção gera notificação e item no feed de Atividade;
  - comentário interno invisível ao usuário;
  - presença Ocupado suprime a notificação de comentário;
  - encaminhar para outra área → o operador antigo perde o acesso ao vivo;
  - agendar para daqui a 2 min → o job devolve o chamado;
  - concluir → validação;
  - SLA "em risco" e "vencido" (problema com SLA de 2 min);
  - painel e relatórios: os números batem com a lista;
  - CSV com assunto `=1+1` abre como texto no Excel;
  - Ctrl+K com `#N` de chamado fora do escopo não acha nada.
- **Segurança:**
  - `curl -sI https://<host>/` mostra CSP, HSTS, XFO DENY, nosniff e Permissions-Policy;
  - `Set-Cookie` com `__Host-`, Secure, HttpOnly e SameSite=Strict;
  - POST sem `X-CSRF-Token` dá 403;
  - 6 tentativas de login dão 429;
  - `testssl.sh <host>` sem itens "NOT ok" altos;
  - DevTools: nenhum segredo em localStorage.
- **Acessibilidade e design:**
  - tudo pelo teclado (SkipLink, Ctrl+K, `j`/`k`, compositor);
  - NVDA ou VoiceOver anunciam mensagens novas e "digitando";
  - modo escuro, modo compacto e 375 px (barra inferior);
  - `prefers-reduced-motion` sem animações.
- **Operação:**
  - reiniciar o serviço não perde sessões (estão no banco) e os sockets reconectam;
  - backup do dia existe no restic;
  - logs sem senha nem token (`journalctl … | grep -i senha` vazio).

**Critério de aceite:** todos os itens automatizados verdes, roteiro manual sem defeito crítico ou alto em aberto, e validação de contagens da migração exata.

---

## 11. Riscos e mitigação

| # | Risco | Impacto | Mitigação |
|---|---|---|---|
| 1 | Haiku desvia do plano (renomeia, "melhora", adiciona lib) | Inconsistência entre tarefas | `CLAUDE.md` com regras e `BLOQUEADO`; tarefas pequenas com "Pronto quando" objetivo; revisão humana por fase; Biome com `noRestrictedImports`/`Globals`; greps no CI |
| 2 | Prisma 7 bloqueia ações destrutivas de agentes ou pede reset em drift | Tarefa travada | Nunca `migrate reset`; testes com `migrate deploy` + TRUNCATE; fallbacks (a)–(d) da §4.2; reset do banco de teste via `db:teste:recriar` (script de `apps/api/package.json`, criado na T-1.9) |
| 3 | Instalar Prisma 8 RC ou outra versão não fixada | Quebra de schema e cliente | Versões exatas, `savePrefix ''`, Renovate com `allowedVersions <8`, T04 no CI |
| 4 | Índices parciais, FK composta ou GIN em `Unsupported` geram drift | "Already in sync" falha | Verificação obrigatória na T-1.5; fallbacks documentados; índices sempre no Prisma |
| 5 | Chaves do pnpm 12 (`allowBuilds`, `savePrefix`) e `minimumReleaseAge` barram versões | Instalação falha | T-0.2 confere com `pnpm help config`; versões escolhidas com mais de 24 h; registro no commit |
| 6 | API do pg-boss 12, otplib 13 ou Socket.IO difere da memória | Erros de tipo e execução | Conferir os `.d.ts` antes (T-7.6); funções de job puras, com teste direto |
| 7 | CSP quebra Zod, Radix ou Scalar | Tela branca ou violações | `jitless` no `theme-init.js`; `style-src 'unsafe-inline'` só para estilos; Scalar só em dev; T66 no E2E |
| 8 | Vazamento de conteúdo interno (feed, socket, busca, e-mail, desktop) | Exposição de dados | Escopo e regras numa fonte só (`autorizacao/chamados.ts`); salas internas; notificação sem texto; T35, T54, T59–T62, T69 |
| 9 | IDOR por espalhar escopo e filtro | Acesso indevido | Regra S45; T33/T34 em matriz; revisão T-11.11 |
| 10 | Qualidade dos dados da v1 (datas, FKs, logins colidindo) | Importação aborta | `validar()` puro com relatório; dry-run em homologação; correções documentadas |
| 11 | Hashes da v1 expostos no histórico git | Quebra offline das senhas padrão | Hashes de senha padrão anulados; `--exigir-troca-todos`; 2FA da equipe; decisão sobre `filter-repo` (S2) |
| 12 | Incompatibilidade do scrypt legado (salt como string hex) | Ninguém consegue entrar | T06 com hash gerado como na v1; teste na fixture com `db.js` real; CLI de redefinição como contingência |
| 13 | Custo das consultas de escopo com `OR` em volume | Lentidão nas listas | Índices `(area_id, status_tipo, id)` e parciais `concluido_em IS NULL`; T-11.12 com 50 mil chamados; paginação ≤ 100 |
| 14 | SLA errado em fuso, horário de verão ou feriado | Indicadores falsos | luxon com fuso da jornada; testes em `TZ=UTC` e `TZ=Asia/Tokyo`; fast-check; feriados lidos por `toISOString` |
| 15 | WebSocket bloqueado por proxy, ou instância única saturada | Sem tempo real | Caddy repassa upgrade; o REST continua funcionando (o cliente se corrige); Fase 3 com adapter Postgres (T-20.7) |
| 16 | Notificação na área de trabalho indisponível (HTTP, Android, permissão negada) | Recurso parcial | HTTPS obrigatório; `try/catch`; toast e feed como alternativa; instrução de liberação na tela |
| 17 | Deploy em Windows (iniciar.bat, NSSM) | Diferenças de ambiente | `@node-rs/argon2` pré-compilado; runbook Windows; a imagem Docker como alternativa |
| 18 | Falha silenciosa de backup | Perda de dados | restic com retenção; teste mensal de restauração automatizado; alerta pelo status do timer systemd |
| 19 | Flakiness dos E2E (tempo real) | CI instável | Um worker, `SOCKET_REVALIDAR_MS` curto, esperas por evento (não `sleep`), 3 repetições no aceite |
| 20 | Escopo da Fase 2/3 cresce sem controle (custos, OIDC, IMAP) | Atrasos | Fases independentes e opcionais; dependências declaradas; nenhuma tarefa de Fase 2/3 bloqueia o MVP |
| 21 | Resistência dos usuários (2FA, troca de senha, layout novo) | Adoção lenta | Comunicação D-5/D-1; guia curto no README; a v1 fica só como snapshot; atalhos e Ctrl+K documentados no diálogo de Ajuda |
| 22 | Bibliotecas de Fase 2/3 sem versão verificada (exceljs, openid-client) | Supply chain | `npm view` + idade mínima de 24 h + versão exata + `pnpm audit`, registrados no commit |
