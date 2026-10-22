#!/usr/bin/env bash
# Backup diário do Vinimon (S119): pg_dump -Fc + restic cifrado (dump e anexos), retenção 7 diários/4 semanais/12 mensais.
# Variáveis: DATABASE_URL, UPLOAD_DIR, RESTIC_REPOSITORY e RESTIC_PASSWORD_FILE (ou RESTIC_PASSWORD).
set -euo pipefail

: "${DATABASE_URL:?defina DATABASE_URL}"
: "${UPLOAD_DIR:?defina UPLOAD_DIR}"
: "${RESTIC_REPOSITORY:?defina RESTIC_REPOSITORY}"
DESTINO="${BACKUP_DIR:-/var/lib/vinimon/backup}"

mkdir -p "$DESTINO"
chmod 700 "$DESTINO"
DUMP="$DESTINO/vinimon.dump"

pg_dump -Fc --no-owner --dbname "$DATABASE_URL" --file "$DUMP.novo"
mv "$DUMP.novo" "$DUMP"

restic snapshots >/dev/null 2>&1 || restic init
restic backup "$DUMP" "$UPLOAD_DIR"
restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 12 --prune
