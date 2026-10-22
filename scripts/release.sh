#!/usr/bin/env bash
# Release do Vinimon no servidor (systemd). Rodar na raiz do repositório, como o usuário de deploy.
set -euo pipefail

: "${DATABASE_URL_MIGRATOR:?defina DATABASE_URL_MIGRATOR (papel vinimon_migrator)}"
: "${HOST:?defina HOST (domínio público, ex.: chamados.suaempresa.com.br)}"

git pull --ff-only
pnpm install --frozen-lockfile
pnpm build
# Se a migração falhar, o set -e encerra o script antes do restart (S121).
DATABASE_URL="$DATABASE_URL_MIGRATOR" pnpm db:deploy
systemctl restart vinimon
curl -fsS "https://$HOST/api/v1/saude/pronto"
