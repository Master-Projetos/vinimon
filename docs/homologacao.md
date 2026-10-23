# Homologação em plataforma gerenciada (Docker)

Ambiente só para acompanhar o andamento do front e da API com dados de teste. Usa o `Dockerfile` do repositório, sem mudar código. O caminho de produção continua sendo o de `docs/operacao.md`.

## O que a plataforma precisa oferecer

- Build por Dockerfile (a imagem final é o último estágio, `final`, que é o padrão).
- Postgres 18 gerenciado (ou um externo, como Neon ou Supabase) com `sslmode=require`.
- Um volume persistente montado em `/data/anexos` (sem ele os anexos somem a cada deploy).
- HTTPS no domínio público (a API recusa `APP_ORIGIN` sem https em produção).
- WebSocket liberado (o Socket.IO usa só `websocket`).
- **Uma única instância.** Enquanto a T-20.7 (adaptador de Postgres do Socket.IO) não existir, mais de uma instância quebra tempo real e presença.

## Passo a passo

1. **Banco.** Criar o banco e rodar `scripts/papeis-postgres.sql` como superusuário (cria `vinimon_migrator`, dono das migrações, e `vinimon_app`, que a aplicação usa e não tem DDL):
   ```sh
   psql "$DATABASE_URL_ADMIN" -v senha_migrator="$SENHA_MIGRATOR" -v senha_app="$SENHA_APP" -f scripts/papeis-postgres.sql
   ```
2. **Migrações e dados iniciais**, do seu computador, apontando para o banco (use o túnel/proxy da plataforma ou a URL pública com `sslmode=require`):
   ```sh
   pnpm install --frozen-lockfile
   DATABASE_URL="$DATABASE_URL_MIGRATOR" pnpm db:deploy
   DATABASE_URL="$DATABASE_URL_MIGRATOR" pnpm db:seed
   ```
   Repetir `db:deploy` a cada release que traga migração, **antes** de publicar a imagem nova. Para dados de demonstração (usuários e chamados de exemplo), `pnpm --filter @vinimon/api seed:dev` com a mesma URL; só em homologação, nunca em produção.
3. **Segredos novos** (nunca reutilizar os de exemplo; o `env.ts` os recusa em produção):
   ```sh
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"   # CSRF_SECRET
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"   # ENCRYPTION_KEY
   ```
4. **Variáveis do serviço** (guardar como segredos da plataforma, fora do repositório):

   | Variável | Valor |
   |---|---|
   | `NODE_ENV` | `production` |
   | `HOST` | `0.0.0.0` (dentro do contêiner; o padrão `127.0.0.1` não é alcançável pela plataforma) |
   | `PORT` | `3000` (ou a porta que a plataforma injeta) |
   | `APP_ORIGIN` | `https://<domínio público>`, sem barra final |
   | `DATABASE_URL` | URL do papel `vinimon_app`, com `?sslmode=require` |
   | `CSRF_SECRET`, `ENCRYPTION_KEY` | os segredos do passo 3 |
   | `UPLOAD_DIR` | `/data/anexos` (o volume) |
   | `TRUST_PROXY` | IP ou CIDR do proxy da plataforma que fala com o contêiner (veja abaixo) |
   | `JOBS_HABILITADOS` | `true` |
   | `API_DOCS` | `false` |

   **`TRUST_PROXY`:** o `env.ts` aceita só `false` ou uma lista de IPs/CIDRs; `true` é proibido (S118). Pegue na documentação da plataforma a faixa de rede interna de onde o proxy dela chega ao contêiner. Se errar a faixa, a API enxerga o IP do proxy em vez do IP do usuário (o limite de taxa e as sessões ficam por proxy, não por pessoa). Não use `0.0.0.0/0`.
5. **Publicar.** Apontar a plataforma para o repositório, branch `v2`, e o `Dockerfile` da raiz. Health check em `GET /api/v1/saude`. Montar o volume em `/data/anexos`. Anotar o domínio e conferir se `APP_ORIGIN` é exatamente ele.
6. **Primeiro acesso.** Entrar com o administrador criado pelo `db:seed` e trocar a senha. O login pede troca de senha e cadastro do 2FA no primeiro acesso.

## Atualizar a cada merge

1. Se o merge trouxe migração nova (`apps/api/prisma/migrations`), rodar o `db:deploy` do passo 2 antes.
2. Publicar o commit novo do `v2` (automático se a plataforma estiver ligada à branch).
3. Conferir `GET /api/v1/saude` e abrir a tela alterada.

## O que ainda não está automatizado

- Deploy automático por GitHub Actions (precisa de um cartão no plano; o `protocolo.yml` só aceita mudanças de plano em `docs/` e `scripts/plano/`).
- Rodar a migração dentro da plataforma: a imagem final não tem o CLI do Prisma de propósito. A migração roda do seu computador (passo 2) ou a partir da imagem `migrar` (`docker build --target migrar`), como em `docs/operacao.md`.
