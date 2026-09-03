#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Vuelve el sitio a un commit anterior. Repite los pasos de deploy.sh SALVO la
# migración: nunca se revierte una migración automáticamente. Si el problema es
# una migración, primero `infra/scripts/restore-db.sh <dump>` y después esto.
#
#   ./rollback.sh <sha>          # vuelve a ese commit exacto
#   ./rollback.sh last-good      # vuelve a /var/lib/marketplace/last-good-sha
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

readonly EXPECTED_ROOT="/srv/marketplace"
if [[ "$(pwd -P)" != "$EXPECTED_ROOT" ]]; then
	echo "rollback.sh solo se puede correr desde ${EXPECTED_ROOT} (estás en $(pwd -P))" >&2
	exit 1
fi

TARGET="${1:?uso: ./rollback.sh <sha|last-good>}"
LAST_GOOD_DIR="/var/lib/marketplace"
SMOKE_PORT="${DEPLOY_SMOKE_PORT:-3099}"
HEALTH_URL="http://127.0.0.1:3000/"
API_HEALTH_URL="http://127.0.0.1:3001/health"

if [[ "$TARGET" == "last-good" ]]; then
	[[ -f "${LAST_GOOD_DIR}/last-good-sha" ]] || {
		echo "no hay last-good-sha registrado todavía" >&2
		exit 1
	}
	TARGET="$(cat "${LAST_GOOD_DIR}/last-good-sha")"
fi

step() { echo; echo "── $* ─────────────────────────────────────────────"; }

echo "rollback -> ${TARGET}"

step "sincronizando checkout a ${TARGET}"
infra/scripts/sync-checkout.sh "$TARGET"
ROLLED_SHA="$(git rev-parse HEAD)"

step "pnpm install --frozen-lockfile"
pnpm install --frozen-lockfile

step "prisma generate"
pnpm --filter @marketplace/db db:generate

step "typecheck"
pnpm --filter @marketplace/api typecheck

# (sin `prisma migrate deploy` — nunca se auto-revierte una migración)

step "build API"
pnpm --filter @marketplace/api build

step "build web"
pnpm --filter web build

step "smoke: arrancar el bundle y leer de Postgres"
if [[ -f packages/db/.env ]]; then
	set -a
	# shellcheck disable=SC1091
	. packages/db/.env
	set +a
fi
: "${DATABASE_URL:?DATABASE_URL no está definida (¿falta packages/db/.env?)}"
SMOKE_PORT="$SMOKE_PORT" SMOKE_DATABASE_URL="$DATABASE_URL" bash apps/api/scripts/smoke.sh

step "reiniciando servicios"
sudo systemctl restart marketplace-api marketplace-web

step "verificando (hasta 60s)"
ok=0
for _ in $(seq 1 60); do
	if curl -sf "$API_HEALTH_URL" >/dev/null && curl -sf -o /dev/null "$HEALTH_URL"; then
		ok=1
		break
	fi
	sleep 1
done
[[ "$ok" -eq 1 ]] || {
	echo "rollback.sh: los servicios no respondieron" >&2
	exit 1
}

echo
echo "rollback OK -> ${ROLLED_SHA}"
echo "nota: last-good-sha NO se actualiza en un rollback."
