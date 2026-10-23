# Vinimon

Sistema de chamados (help desk) com SLA, tempo real, base de conhecimento e inventário básico. É a reescrita (v2) do sistema antigo, que continua só para leitura em `legado/v1`.

- **API:** Fastify 5, Zod 4, Prisma 7 sobre PostgreSQL, Socket.IO e pg-boss (filas e jobs).
- **Web:** React 19, TanStack Router e Query, Tailwind 4 e shadcn.
- **Monorepo pnpm:** `packages/shared` (contratos, schemas e permissões), `apps/api`, `apps/web`.

## Requisitos

- Node 24 (>= 24.11)
- pnpm 12 (versão fixada em `packageManager`)
- Docker, para o PostgreSQL e o Mailpit de desenvolvimento

## Início rápido

```sh
pnpm install
pnpm db:up                                  # PostgreSQL + Mailpit
cp apps/api/.env.example apps/api/.env      # ajuste se precisar
pnpm db:deploy                              # aplica as migrações
pnpm db:seed                                # dados base (cria só o admin, que troca a senha no primeiro acesso)
pnpm --filter @vinimon/api seed:dev         # dados de demonstração (recusa NODE_ENV=production)
pnpm dev                                    # API em :3000 e web em :5173
```

A senha temporária do administrador é gerada pelo seed e mostrada uma única vez no terminal (ou defina `SEED_ADMIN_PASSWORD` antes de rodar). Nada de senha fica versionado.

## Comandos

| Comando | O que faz |
|---|---|
| `pnpm dev` | API e web em desenvolvimento (a web faz proxy de `/api` e `/socket.io`) |
| `pnpm verificar` | `lint`, `typecheck` e testes: precisa ficar verde antes de qualquer commit |
| `pnpm lint` / `pnpm lint:fix` | Biome |
| `pnpm typecheck` | TypeScript em todos os pacotes |
| `pnpm test` / `pnpm test:e2e` | Vitest (contra Postgres real) / Playwright |
| `pnpm build` | Build da web e da API |
| `pnpm db:up` / `db:generate` / `db:deploy` / `db:seed` | Banco de desenvolvimento, cliente Prisma, migrações e seed |
| `pnpm --filter @vinimon/api cli usuario:redefinir-senha <login>` | Gera senha temporária e exige troca |
| `pnpm -F @vinimon/api importar:v1 --sqlite <arquivo.db> [--dry-run]` | Importa os dados da v1 |

## Estrutura

```
apps/api        Fastify + Prisma + Socket.IO + jobs (src/modules/<módulo>/{schemas,service,routes}.ts)
apps/web        React (src/routes, src/lib/api.ts)
packages/shared Schemas Zod, enums, permissões e contratos de rota
deploy/         systemd, Caddy e exemplo de variáveis de produção
scripts/        release, backup, teste de restauração, papéis do Postgres
docs/           operação (docs/operacao.md) e plano de execução (docs/plano/)
legado/v1       sistema antigo, somente leitura
```

## Documentação

- Operação, release, backup e corte da v1: [`docs/operacao.md`](docs/operacao.md)
- Segurança e como reportar vulnerabilidades: [`SECURITY.md`](SECURITY.md)
- Plano completo: [`docs/plano/`](docs/plano/) (fundamentos em `fundamentos/`, tarefas em `tarefas/`)
- Regras para quem contribui: [`CLAUDE.md`](CLAUDE.md)
