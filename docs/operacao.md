# Operação do Vinimon

Este guia cobre a implantação em produção (§3.13): um único processo Node com API, SPA, Socket.IO e workers do pg-boss, atrás do Caddy, que faz só TLS e compressão.

## 1. Banco de dados (uma vez)

Rodar como superusuário do Postgres. Os papéis e o schema `pgboss` estão em `scripts/papeis-postgres.sql`:

```sh
psql -v senha_migrator="$SENHA_MIGRATOR" -v senha_app="$SENHA_APP" -f scripts/papeis-postgres.sql
```

- `vinimon_migrator` (DDL): dono do banco e das migrações. Só é usado no deploy.
- `vinimon_app` (DML): usado pela aplicação. Não tem permissão de DDL no `public` (S115).
- Banco remoto: `DATABASE_URL` com `sslmode=require` (S117).

## 2. Servidor com systemd (caminho principal)

1. Criar o usuário e as pastas:
   ```sh
   sudo useradd --system --home /var/lib/vinimon --shell /usr/sbin/nologin vinimon
   sudo install -d -o vinimon -g vinimon /var/lib/vinimon/anexos
   sudo install -d -m 0750 -o root -g vinimon /etc/vinimon
   ```
2. Copiar `deploy/api.env.example` para `/etc/vinimon/api.env` (modo `0640`, dono `root:vinimon`) e trocar **todos** os valores `troque…`. Gerar os segredos com:
   ```sh
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
   ```
   O `env.ts` recusa a aplicação em `NODE_ENV=production` se algum segredo ainda for de exemplo (S4).
3. Instalar a unit `deploy/vinimon.service` em `/etc/systemd/system/vinimon.service` e rodar `sudo systemctl daemon-reload && sudo systemctl enable vinimon`.
4. Caddy: usar `deploy/Caddyfile` como `/etc/caddy/Caddyfile` (TLS automático, `reverse_proxy 127.0.0.1:3000`). A API fica só em `127.0.0.1` e `TRUST_PROXY=127.0.0.1` (S118).
5. Deploy: com `DATABASE_URL_MIGRATOR` (papel `vinimon_migrator`) e `HOST` (domínio público) no ambiente:
   ```sh
   DATABASE_URL_MIGRATOR='postgresql://vinimon_migrator:…@host:5432/vinimon?sslmode=require' HOST=chamados.suaempresa.com.br scripts/release.sh
   ```
   O script faz `git pull --ff-only`, `pnpm install --frozen-lockfile`, `pnpm build`, `db:deploy` com o papel de migração e só então `systemctl restart vinimon`. Se a migração falhar, o script para e **não reinicia** o serviço (S121). Por fim confere `https://$HOST/api/v1/saude/pronto`.

## 3. Imagem Docker (alternativa)

Mesmo processo, empacotado em imagem. O `Dockerfile` usa `node:24-bookworm-slim` fixada por digest e roda como `USER node`.

Antes de subir a imagem final, **rodar as migrações** com o papel de migração. Se falhar, não suba a imagem:

```sh
docker build --target migrar -t vinimon-migrar . && docker run --rm -e DATABASE_URL="$DATABASE_URL_MIGRATOR" vinimon-migrar
docker build -t vinimon .
```

Subir a aplicação (com `deploy/api.env.example` já preenchido com segredos reais, fora do repositório):

```sh
sudo install -d -o 1000 -g 1000 /var/lib/vinimon/anexos
docker run -d --name vinimon --network host --read-only --tmpfs /tmp \
  --env-file /etc/vinimon/api.env \
  -v /var/lib/vinimon/anexos:/data/anexos \
  --restart always vinimon
```

- `--network host` deixa a API em `127.0.0.1:3000` do host, para o Caddy (`reverse_proxy 127.0.0.1:3000`).
- Em Docker, `UPLOAD_DIR=/data/anexos` (o volume). No `api.env` usado pelo systemd, o valor é `/var/lib/vinimon/anexos`.

## 4. Saúde

- `GET /api/v1/saude`: processo no ar (`{ok: true}`).
- `GET /api/v1/saude/pronto`: faz `SELECT 1` e confere que o pg-boss iniciou. É o endereço usado no `release.sh`.

## 5. Segredos e arquivos que não vão ao repositório

- `/etc/vinimon/api.env` e `DATABASE_URL*` nunca são commitados. O repositório só tem `deploy/api.env.example`, com valores de exemplo que o `env.ts` recusa em produção.
- Não usar `TRUST_PROXY=true` nem `@fastify/cors`; o Caddy é o único proxy.
