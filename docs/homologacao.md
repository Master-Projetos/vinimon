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
   SEED_ADMIN_PASSWORD='<senha forte>' DATABASE_URL="$DATABASE_URL_MIGRATOR" pnpm db:seed
   ```
   O `db:seed` cria a área TI e o administrador de login `admin`. Sem `SEED_ADMIN_PASSWORD`, ele gera uma senha e a mostra **uma única vez** na saída; anote-a. Repetir `db:deploy` a cada release que traga migração, **antes** de publicar a imagem nova. Para dados de demonstração (usuários e chamados de exemplo), `pnpm --filter @vinimon/api seed:dev` com a mesma URL; só em homologação, nunca em produção.
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
6. **Primeiro acesso.** Entrar com o login `admin` e a senha do passo 2. O login pede troca de senha e cadastro do 2FA no primeiro acesso.

## Atualizar a cada merge

1. Se o merge trouxe migração nova (`apps/api/prisma/migrations`), rodar o `db:deploy` do passo 2 antes.
2. Publicar o commit novo do `v2` (automático se a plataforma estiver ligada à branch).
3. Conferir `GET /api/v1/saude` e abrir a tela alterada.

## O que ainda não está automatizado

- Deploy automático por GitHub Actions (precisa de um cartão no plano; o `protocolo.yml` só aceita mudanças de plano em `docs/` e `scripts/plano/`).
- Rodar a migração dentro da plataforma: a imagem final não tem o CLI do Prisma de propósito. A migração roda do seu computador (passo 2) ou a partir da imagem `migrar` (`docker build --target migrar`), como em `docs/operacao.md`.

---

# Roteiro grátis: Render + Neon

Específico do plano gratuito. Conferir preços e limites nas páginas de cada serviço antes de criar a conta; eles mudam.

## 1. Neon (banco)

1. Criar um projeto no Neon. Escolher a região mais próxima da do Render (por exemplo, ambas na Virgínia/Ohio, ou ambas em Frankfurt) e a **maior versão do Postgres disponível**. O projeto roda no Postgres 18 em desenvolvimento e no CI; as migrações só usam `pg_trgm` e `unaccent` (extensões confiáveis, que o dono do banco pode criar) e nada exclusivo do 18, mas **não foram testadas em versão menor**: se algo falhar na migração, anote o erro.
2. Em *Connect*, **desligar a opção "Pooled connection"** e copiar a URL direta (host sem `-pooler`). O pg-boss usa travas e sessões que não funcionam no pooler (PgBouncer em modo transação). Use a URL direta para tudo.
3. Rodar o script de papéis com o usuário administrador que o Neon criou (o `neondb_owner` é o dono do projeto e pode criar papéis e bancos):
   ```sh
   psql "<URL direta do Neon>" -v senha_migrator="$SENHA_MIGRATOR" -v senha_app="$SENHA_APP" -f scripts/papeis-postgres.sql
   ```
   O script cria o banco `vinimon`. Daí em diante as URLs usam o banco `vinimon` no lugar de `neondb`:
   - migrator: `postgresql://vinimon_migrator:<senha>@<host direto>/vinimon?sslmode=require`
   - app: `postgresql://vinimon_app:<senha>@<host direto>/vinimon?sslmode=require`
4. Migração e seed, do seu computador, com a URL do **migrator** (passo 2 do roteiro geral acima).

O plano grátis do Neon suspende o banco depois de alguns minutos sem uso; o primeiro acesso depois disso demora um pouco mais. Se a API reclamar de conexão encerrada logo depois de um período ocioso, repita a requisição e anote o erro.

## 2. Render (aplicação)

1. *New → Web Service*, conectar o repositório no GitHub, branch `v2`.
2. *Language*: **Docker**. *Instance type*: **Free**. *Dockerfile path*: `./Dockerfile`.
3. *Health check path*: `/api/v1/saude`. *Auto-deploy*: ligado (publica a cada merge no `v2`).
4. Variáveis de ambiente (as do quadro do roteiro geral), com estas particularidades:
   - **não definir `PORT`**: o Render injeta a porta e a API a lê;
   - `HOST=0.0.0.0`;
   - `DATABASE_URL`: a URL direta do papel `vinimon_app`;
   - `APP_ORIGIN`: `https://<nome-do-serviço>.onrender.com`. O endereço só é conhecido depois de criar o serviço; crie, copie o endereço, preencha e faça *Manual Deploy*;
   - `UPLOAD_DIR=/data/anexos` (no plano grátis o disco é efêmero: os anexos somem a cada deploy ou reinício);
   - `TRUST_PROXY`: o Render não publica uma faixa fixa que eu tenha verificado. Para homologação, use as faixas privadas `10.0.0.0/8,172.16.0.0/12,192.168.0.0/16` (o tráfego de fora entra pelo proxy da plataforma, que chega por rede privada). Não use `true` nem `0.0.0.0/0`. Para produção, descubra a faixa real.
5. O serviço grátis dorme depois de um tempo sem acessos e acorda no primeiro acesso, em cerca de 1 minuto. Enquanto dorme, o Socket.IO fica desconectado e os jobs (SLA, limpezas, e-mail) não rodam.

## Limitações de uma homologação grátis

- Tempo real, presença e jobs só funcionam enquanto o serviço está acordado.
- Anexos não persistem.
- Não use dados reais.
