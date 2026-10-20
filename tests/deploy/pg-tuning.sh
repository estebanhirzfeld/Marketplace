#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Test — Postgres afinado para 1 GB de RAM en docker-compose.prod.yml.
#
# La micro comparte 1 GB entre SO, Postgres, Next standalone, el bundle de la
# API y Caddy. Postgres 16 con los defaults (shared_buffers 128 MB,
# max_connections 100) se come demasiado. Este test exige que la config de
# producción baje esos valores.
#
# Corre `docker compose config` (render real) y verifica los flags.
#
# Uso: bash tests/deploy/pg-tuning.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE="${REPO_ROOT}/docker-compose.prod.yml"
FAILURES=0

[[ -f "$COMPOSE" ]] || { echo "FAIL: no existe docker-compose.prod.yml"; exit 1; }

command -v docker >/dev/null || { echo "SKIP: docker no está disponible"; exit 0; }

RENDER="$(cd "$REPO_ROOT" && docker compose -f docker-compose.prod.yml config 2>/dev/null)" \
	|| { echo "FAIL: 'docker compose config' no validó"; exit 1; }
echo "ok   docker compose config valida"

check() {
	local needle="$1" desc="$2"
	if grep -q -- "$needle" <<<"$RENDER"; then
		echo "ok   pg: ${desc}"
	else
		echo "FAIL pg: falta ${desc} (${needle})"
		FAILURES=$((FAILURES + 1))
	fi
}

check "max_connections=20"      "max_connections=20"
check "shared_buffers=96MB"     "shared_buffers=96MB"
check "effective_cache_size"    "effective_cache_size fijado"
check "work_mem="               "work_mem fijado"

if [[ "$FAILURES" -ne 0 ]]; then
	echo "pg-tuning: ${FAILURES} fallo(s)"
	exit 1
fi
echo "pg-tuning: OK"
