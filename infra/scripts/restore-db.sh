#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Restaura un dump generado por backup-db.sh.
#
#   gunzip < dump.sql.gz | psql
#
# DESTRUCTIVO por defecto: reemplaza el contenido de la base destino. Pensado
# para dos casos:
#   1. Recuperar la base de producción tras una migración fallida (destino:
#      marketplace, previo restore-db.sh, luego rollback.sh).
#   2. El simulacro de restore que exige la spec: restaurar en una base
#      scratch y comparar conteos de filas (usar --db marketplace_restore_check).
#
# Uso:
#   infra/scripts/restore-db.sh <dump.sql.gz> [--db <nombre>] [--yes]
#   infra/scripts/restore-db.sh --help
#
#   --db    base destino (default: marketplace)
#   --yes   no preguntar confirmación (para el simulacro automatizado)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

usage() {
	awk 'NR>1 && /^[^#]/{exit} NR>1{sub(/^# ?/,"");print}' "$0"
}

DUMP=""
TARGET_DB="${MARKETPLACE_DB_NAME:-marketplace}"
ASSUME_YES=0

while [[ $# -gt 0 ]]; do
	case "$1" in
	--help | -h)
		usage
		exit 0
		;;
	--db)
		TARGET_DB="${2:?--db necesita un valor}"
		shift 2
		;;
	--yes)
		ASSUME_YES=1
		shift
		;;
	-*)
		echo "opción desconocida: $1" >&2
		exit 2
		;;
	*)
		DUMP="$1"
		shift
		;;
	esac
done

if [[ -z "$DUMP" ]]; then
	usage
	exit 2
fi
if [[ ! -f "$DUMP" ]]; then
	echo "no existe el dump: $DUMP" >&2
	exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${REPO_ROOT}/docker-compose.prod.yml"
DB_USER="${MARKETPLACE_DB_USER:-marketplace}"

echo "Dump   : $DUMP"
echo "Destino: base '${TARGET_DB}' (se DROPea y recrea)"
if [[ "$ASSUME_YES" -ne 1 ]]; then
	read -r -p "¿Continuar? Esto borra '${TARGET_DB}'. [escribí 'si']: " ANSWER
	[[ "$ANSWER" == "si" ]] || {
		echo "cancelado"
		exit 1
	}
fi

psql_db() {
	docker compose -f "$COMPOSE_FILE" exec -T db \
		psql --username="$DB_USER" --dbname="$1" -v ON_ERROR_STOP=1 "${@:2}"
}

echo "→ recreando '${TARGET_DB}'"
psql_db postgres -c "DROP DATABASE IF EXISTS \"${TARGET_DB}\";"
psql_db postgres -c "CREATE DATABASE \"${TARGET_DB}\" OWNER \"${DB_USER}\";"

echo "→ cargando el dump"
gunzip -c "$DUMP" | docker compose -f "$COMPOSE_FILE" exec -T db \
	psql --username="$DB_USER" --dbname="$TARGET_DB" -v ON_ERROR_STOP=1 >/dev/null

echo "→ verificación rápida (conteo de filas por tabla)"
psql_db "$TARGET_DB" -c "
  SELECT schemaname, relname, n_live_tup
  FROM pg_stat_user_tables
  ORDER BY n_live_tup DESC;"

echo "restore OK"
