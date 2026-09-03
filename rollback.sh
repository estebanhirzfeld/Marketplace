#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Vuelve el sitio a un commit anterior. Repite los pasos de deploy.sh SALVO la
# migración: nunca se revierte una migración automáticamente. Si el problema es
# una migración, primero `infra/scripts/restore-db.sh <dump>` y después esto.
#
#   ./rollback.sh <sha>          # vuelve a ese commit exacto
#   ./rollback.sh last-good      # vuelve a /var/lib/marketplace/last-good-sha
#
# Igual que deploy.sh: el artefacto de build lo produce CI y lo baja
# fetch-release.sh. El release del commit destino tiene que seguir publicado
# (los GitHub Releases se conservan; no se borran en cada deploy).
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
WEB_URL="http://127.0.0.1:3000/"
API_HEALTH_URL="http://127.0.0.1:3001/health"
API_LOGIN_URL="http://127.0.0.1:3001/auth/login"

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

step "pnpm install --frozen-lockfile (solo API + db)"
pnpm install --frozen-lockfile \
	--filter "@marketplace/api..." \
	--filter "@marketplace/db..."

step "prisma generate"
pnpm --filter @marketplace/db db:generate

# (sin `prisma migrate deploy` — nunca se auto-revierte una migración)

step "bajando el artefacto de build prehecho para ${ROLLED_SHA:0:12}"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
infra/scripts/fetch-release.sh "$ROLLED_SHA" "$STAGE"
rm -rf apps/api/dist apps/web/.next
mkdir -p apps/api apps/web
cp -a "${STAGE}/apps/api/dist" apps/api/dist
cp -a "${STAGE}/apps/web/.next" apps/web/.next
rm -rf "$STAGE"
trap - EXIT

step "smoke: arrancar el bundle y leer de Postgres"
DATABASE_URL="$(sudo sed -n 's/^DATABASE_URL=//p' /etc/marketplace/api.env)"
export DATABASE_URL
: "${DATABASE_URL:?no se pudo leer DATABASE_URL de /etc/marketplace/api.env}"
SMOKE_PORT="$SMOKE_PORT" SMOKE_DATABASE_URL="$DATABASE_URL" \
	SMOKE_SKIP_BUILD=1 bash apps/api/scripts/smoke.sh

step "reiniciando servicios"
sudo systemctl restart marketplace-api marketplace-web

step "verificando (hasta 60s) — health + lectura real de Postgres"
ok=0
for _ in $(seq 1 60); do
	if curl -sf "$API_HEALTH_URL" >/dev/null 2>&1 && curl -sf -o /dev/null "$WEB_URL" 2>/dev/null; then
		code="$(curl -s -o /dev/null -w '%{http_code}' \
			-X POST "$API_LOGIN_URL" -H 'content-type: application/json' \
			-d '{"email":"noexiste@rollback.check","password":"x"}' || true)"
		[[ "$code" == "403" ]] && ok=1 && break
	fi
	sleep 1
done
[[ "$ok" -eq 1 ]] || {
	echo "rollback.sh: el stack no verificó tras el restart" >&2
	exit 1
}

echo
echo "rollback OK -> ${ROLLED_SHA}"
echo "nota: last-good-sha NO se actualiza en un rollback."
