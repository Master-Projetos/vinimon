# Plano total do Vinimon v2

Reescrita do Vinimon (clone do OCOMON) em TypeScript, com:
- **Fastify 5 + Zod 4 + Prisma 7 + PostgreSQL 18** na API;
- **React 19 + TanStack Router/Query + Tailwind 4 + shadcn/ui** no front;
- tempo real com **Socket.IO** e filas com **pg-boss**.

Junta as funções do OCOMON original a uma experiência inspirada no Microsoft Teams. O plano foi escrito para ser executado por **agentes Claude Haiku (e Sonnet nas tarefas críticas), uma tarefa por vez**.

> Gerado em 21/10/2026 por um workflow de 10 agentes: 6 especialistas, 2 sínteses e 2 revisores adversariais. Versões de bibliotecas conferidas com `npm view` e nos tarballs na mesma data. As 65 correções dos revisores estão aplicadas; o registro fica em [`revisao-do-plano.md`](revisao-do-plano.md).

## Mapa do plano

| Referência | Arquivo | Conteúdo |
|---|---|---|
| — | [`/CLAUDE.md`](../../CLAUDE.md) | Regras para os agentes: comandos, proibições, armadilhas de versão |
| §1 | [`fundamentos/01-escopo.md`](fundamentos/01-escopo.md) | Visão, MVP, Fase 2, Fase 3, fora do escopo |
| §2 | [`fundamentos/02-decisoes-libs.md`](fundamentos/02-decisoes-libs.md) | Bibliotecas com versão exata, decisões de conflito, **sugestões de libs para a API** |
| §3 | [`fundamentos/03-arquitetura.md`](fundamentos/03-arquitetura.md) | Monorepo, fluxo de requisição, erros/paginação, autorização, rotas, tempo real, jobs, arquivos de ferramenta, deploy |
| §4 | [`fundamentos/04-dados.md`](fundamentos/04-dados.md) | `schema.prisma` completo, SQL extra, seed, importador da v1, algoritmo de SLA |
| §5 | [`fundamentos/05-seguranca.md`](fundamentos/05-seguranca.md) | Requisitos S1… e checklist de testes T01–T72 |
| §6 | [`fundamentos/06-design.md`](fundamentos/06-design.md) | Tokens (`globals.css`), layout estilo Teams, telas, componentes |
| §7 | [`fundamentos/07-codigo-canonico.md`](fundamentos/07-codigo-canonico.md) | Código de referência para copiar |
| §8 | [`tarefas/00-convencoes.md`](tarefas/00-convencoes.md) + `tarefas/fase-00.md` … `fase-20.md` | Convenções, resumo das fases e os cartões `T-x.y` |
| §9–§11 | [`tarefas/corte-verificacao-riscos.md`](tarefas/corte-verificacao-riscos.md) | Migração e corte, verificação ponta a ponta, riscos |
| — | [`relatorios/`](relatorios/) | Relatórios literais dos especialistas (OCOMON, segurança, stack, dados, design, tempo real) |

**Precedência em conflito:** Parte A (`fundamentos/`) > Parte B (`tarefas/`) > relatórios.

**Nomes usados no plano:**
- `T-x.y`: tarefa;
- `T##`: teste da §5.2;
- `S#`: requisito de segurança;
- `TM1`–`TM8`: recursos estilo Teams;
- `A01`…`I18`: itens do inventário OCOMON (ver `relatorios/ocomon.md`).

## Escopo

- **MVP (Fases 0–11).** Substitui a v1 e importa os dados dela.
  - **Segurança:** sessões no Postgres, argon2id com migração dos hashes scrypt, 2FA TOTP para a equipe, CSRF, CSP, rate limit e auditoria imutável.
  - **Chamados:** visões e filas; ações de assumir, encaminhar, agendar e concluir; validação pelo solicitante; histórico; CSV.
  - **SLA útil:** jornadas, feriados e estados "em risco" e "vencido".
  - **Demais módulos:** base de conhecimento, inventário básico, painel e relatórios.
  - **Teams:**
    - TM1: chat ao vivo na linha do tempo;
    - TM2: presença;
    - TM3: "digitando…";
    - TM4: "Visto por";
    - TM5: @menções;
    - TM6: feed de Atividade;
    - TM7: notificações na área de trabalho;
    - TM8: busca Ctrl+K.
- **Fase 2 (Fases 12–17).**
  - **Contas:** e-mail e recuperação de senha, LDAP/AD.
  - **Abertura:** campos personalizados e formulários.
  - **Ciclo:** subchamados, lembretes, co-autoria, registro de horas.
  - **Comunicação e consultas:** mural de avisos, filtros salvos e XLSX, relatórios avançados.
  - **Integração e outros:** API pública com tokens, inventário completo, LGPD.
- **Fase 3 (Fases 18–20).** Clientes e custos, abertura por e-mail (IMAP), OIDC, formulário anônimo, projetos, licenças, escala horizontal.
- **Fora do escopo.** Reações com emoji, conversas/DMs/canais/equipes, reuniões de vídeo e multi-idioma.

## Sugestões de libs para a API (resumo; detalhes na §2.4)

A recomendação adotada é **Fastify + Zod + fastify-type-provider-zod + Prisma 7 (adapter-pg) + Socket.IO + pg-boss**.
- Um schema só valida e serializa.
- O OpenAPI sai gerado.
- Testes sem rede com `app.inject`.
- Plugins oficiais para cookie, helmet, rate-limit, multipart e static.

Alternativas avaliadas:

| Alternativa | Avaliação |
|---|---|
| Hono + zod-openapi | Bom para multi-runtime |
| NestJS | DI e decorators, mais pesado para agentes |
| Express 5 | Sem tipagem por schema |
| tRPC | Perde REST e a API pública |
| Elysia | Exige Bun |
| better-auth | Impõe o próprio schema |
| BullMQ | Exige Redis |

## Como executar com Haiku

0. **Modelo por tarefa.** Cada cartão traz a linha **Modelo:**.
   - **Haiku** (170 tarefas): tarefas mecânicas, como cadastros que copiam `areas`, telas, componentes, scaffold, ferramentas e docs.
   - **Sonnet** (43 tarefas): lógica sutil ou sensível à segurança, como sessões, 2FA e CSRF, SLA, escopo e ações de chamado, menções e fanout, Socket.IO e presença, importador, E2E de tempo real, LDAP, API pública, IMAP e OIDC, além das revisões finais.
   - Os portões de fase também usam o Sonnet. Se o Haiku travar duas vezes em `BLOQUEADO` na mesma tarefa, rode-a com o Sonnet.
1. **Uma tarefa por sessão ou agente.** No Claude Code, use `/model haiku` (ou `/model sonnet`, conforme o cartão) e o prompt:
   ```
   Execute a tarefa T-<x.y> exatamente como descrita em docs/plano/tarefas/fase-<NN>.md.
   Siga o CLAUDE.md e docs/plano/tarefas/00-convencoes.md. Leia só as seções §/S#/T## citadas no cartão.
   Termine com `pnpm verificar` verde e um commit "T-<x.y>: <resumo>", ou com "BLOQUEADO: <motivo>".
   ```
2. **Ordem:** siga as fases em sequência e, dentro de cada fase, o campo "Depende de". Tarefas marcadas "Paralelo com" podem rodar ao mesmo tempo, cada uma num git worktree separado (`git worktree add ../vinimon-T-x.y`).
3. **Portão por fase:** ao fim de cada fase, uma revisão humana ou do Sonnet antes de seguir. Use `/code-review` ou `/security-review` nas Fases 2, 5, 6, 7 e 11.
4. **`BLOQUEADO`:** corrija a ambiguidade **no plano** (cartão ou Parte A), com um commit `plano: …`, e rode a tarefa de novo. Nunca aceite um "conserto" improvisado no código.
5. **Retomada:** cada tarefa termina num commit. Para saber onde parou, rode `git log --oneline | grep '^.\{8\} T-'`.

## Verificação e aceite

O roteiro completo está em [`tarefas/corte-verificacao-riscos.md`](tarefas/corte-verificacao-riscos.md) §10:
- CI verde: gitleaks, Biome, typecheck, testes da API, shared e web, build;
- E2E Playwright com 3 repetições;
- rastreabilidade S#/T## sem pendência alta;
- metas de performance;
- teste de restauração de backup;
- validação de contagens da importação da v1;
- roteiro manual por papel (ADMIN, OPERADOR, USUARIO).
