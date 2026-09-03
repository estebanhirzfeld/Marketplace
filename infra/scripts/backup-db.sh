#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Dump lógico de la base de producción.
#
#   pg_dump (dentro del contenedor) | gzip  ->  /mnt/pgdata/backups/
#
# Guarda los últimos 7 dumps y borra los más viejos. El destino está en el
# block volume, así que el backup sobrevive a la pérdida de la instancia igual
# que los datos. Un dump lógico además protege contra la corrupción del
# directorio de datos, que un volumen no cubre.
#
# Uso:
#   infra/scripts/backup-db.sh            # corre el backup
#   infra/scripts/backup-db.sh --help
#
# Lo dispara marketplace-backup.timer una vez por día. Se puede correr a mano
# en cualquier momento; los nombres llevan timestamp y no se pisan.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

usage() {
	awk 'NR>1 && /^[^#]/{exit} NR>1{sub(/^# ?/,"");print}' "$0"
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
	usage
	exit 0
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${REPO_ROOT}/docker-compose.prod.yml"
BACKUP_DIR="${MARKETPLACE_BACKUP_DIR:-/mnt/pgdata/backups}"
KEEP="${MARKETPLACE_BACKUP_KEEP:-7}"
DB_NAME="${MARKETPLACE_DB_NAME:-marketplace}"
DB_USER="${MARKETPLACE_DB_USER:-marketplace}"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="${BACKUP_DIR}/marketplace-${STAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "→ pg_dump ${DB_NAME} -> ${DEST}"
# -T: sin TTY, necesario cuando lo corre systemd.
docker compose -f "$COMPOSE_FILE" exec -T db \
	pg_dump --username="$DB_USER" --no-owner --no-privileges "$DB_NAME" |
	gzip -9 >"${DEST}.partial"
mv "${DEST}.partial" "$DEST"

SIZE="$(du -h "$DEST" | cut -f1)"
echo "  ok (${SIZE})"

# Retención: dejar los $KEEP más nuevos, borrar el resto. Los nombres los
# generamos nosotros con timestamp ISO, así que el orden lexicográfico de `ls`
# es el orden cronológico y no hay caracteres raros.
# shellcheck disable=SC2012
mapfile -t OLD < <(ls -1t "${BACKUP_DIR}"/marketplace-*.sql.gz 2>/dev/null | tail -n "+$((KEEP + 1))")
if [[ ${#OLD[@]} -gt 0 ]]; then
	echo "→ retención: borrando ${#OLD[@]} dump(s) viejos"
	for f in "${OLD[@]}"; do
		rm -f -- "$f"
		echo "  - $(basename "$f")"
	done
fi

echo "backup OK"
