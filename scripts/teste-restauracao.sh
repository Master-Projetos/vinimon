#!/usr/bin/env bash
# Teste mensal de restauração (S120): restaura o último snapshot do restic num diretório temporário e num banco
# descartável, confere chamados > 0 e o sha256 de 10 anexos aleatórios; depois apaga tudo.
# Variáveis: RESTIC_REPOSITORY e RESTIC_PASSWORD_FILE (ou RESTIC_PASSWORD); UPLOAD_DIR (padrão
# /var/lib/vinimon/anexos); conexão ao Postgres pelas variáveis PGHOST, PGPORT, PGUSER e PGPASSWORD
# (o usuário precisa poder criar bancos).
set -euo pipefail

: "${RESTIC_REPOSITORY:?defina RESTIC_REPOSITORY}"
UPLOAD_DIR="${UPLOAD_DIR:-/var/lib/vinimon/anexos}"
BANCO="vinimon_restauracao_$(date +%Y%m%d)"
TMP="$(mktemp -d)"

limpar() {
  psql -d postgres -qc "DROP DATABASE IF EXISTS \"$BANCO\"" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap limpar EXIT

restic restore latest --target "$TMP"

DUMP="$(find "$TMP" -name vinimon.dump -type f | head -n 1)"
[ -n "$DUMP" ] || { echo "ERRO: vinimon.dump não está no snapshot" >&2; exit 1; }

psql -d postgres -qc "DROP DATABASE IF EXISTS \"$BANCO\""
psql -d postgres -qc "CREATE DATABASE \"$BANCO\""
pg_restore --no-owner --dbname "$BANCO" "$DUMP"

CHAMADOS="$(psql -d "$BANCO" -Atc 'SELECT count(*) FROM chamados')"
if [ "$CHAMADOS" -le 0 ]; then
  echo "ERRO: o banco restaurado não tem chamados" >&2
  exit 1
fi

VERIFICADOS=0
while IFS='|' read -r chave sha; do
  [ -n "$chave" ] || continue
  arquivo="$TMP$UPLOAD_DIR/$chave"
  [ -f "$arquivo" ] || { echo "ERRO: anexo ausente na restauração: $chave" >&2; exit 1; }
  calculado="$(sha256sum "$arquivo" | cut -d' ' -f1)"
  [ "$calculado" = "$sha" ] || { echo "ERRO: sha256 diferente no anexo $chave" >&2; exit 1; }
  VERIFICADOS=$((VERIFICADOS + 1))
done < <(psql -d "$BANCO" -Atc 'SELECT storage_chave, sha256 FROM anexos ORDER BY random() LIMIT 10')

echo "restauração ok: $CHAMADOS chamados, $VERIFICADOS anexos conferidos"
