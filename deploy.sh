#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Despliegue continuo del marketplace en la VM. Idempotente: correrlo de nuevo
# sobre el mismo ref no cambia nada observable.
#
#   ./deploy.sh [<ref>]        # ref por defecto: fase-5-frontend-y-avisos
#
# Todo lo que puede fallar (typecheck, migración, builds, smoke) corre ANTES de
# tocar los servicios. Si algo falla, la versión anterior sigue sirviendo.
#
# El criterio de éxito NO es "el build terminó en 0": el paso 8b arranca el
# bundle y le pide una lectura real a Postgres. Un artefacto que compila pero
# muere al arrancar —o una base mal nombrada— se detecta acá, no después de
# reiniciar los servicios en producción.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Guarda de cwd: este script opera con `git` sobre el checkout de la VM.
#    Corriendo desde otro directorio tocaría el repo equivocado.
readonly EXPECTED_ROOT="/srv/marketplace"
if [[ "$(pwd -P)" != "$EXPECTED_ROOT" ]]; then
	echo "deploy.sh solo se puede correr desde ${EXPECTED_ROOT} (estás en $(pwd -P))" >&2
	exit 1
fi

REF="${1:-fase-5-frontend-y-avisos}"
SMOKE_PORT="${DEPLOY_SMOKE_PORT:-3099}"
HEALTH_URL="http://127.0.0.1:3000/"
API_HEALTH_URL="http://127.0.0.1:3001/health"
LAST_GOOD_DIR="/var/lib/marketplace"

step() { echo; echo "── $* ─────────────────────────────────────────────"; }

step "1-2  sincronizando checkout a origin/${REF}"
infra/scripts/sync-checkout.sh "$REF"
DEPLOY_SHA="$(git rev-parse HEAD)"
echo "  SHA objetivo: ${DEPLOY_SHA}"

step "3    pnpm install --frozen-lockfile"
# SIN --prod a propósito: `dotenv` es devDependency de apps/api y se importa en
# runtime (apps/api/src/server.ts: import 'dotenv/config'). Con --prod el
# servicio no arrancaría. No lo "optimices" agregando --prod.
pnpm install --frozen-lockfile

step "4    prisma generate (cliente + engine ARM nativo para el CLI)"
pnpm --filter @marketplace/db db:generate

step "5    typecheck (hard gate)"
pnpm --filter @marketplace/api typecheck

step "6    prisma migrate deploy"
# El cwd importa: packages/db/prisma.config.ts hace `import 'dotenv/config'` y
# lee env('DATABASE_URL') relativo a ese directorio. NUNCA `prisma db push`.
(cd packages/db && pnpm exec prisma migrate deploy)

step "7    build API (bundle ESM con tsup)"
pnpm --filter @marketplace/api build

step "8    build web (next build)"
pnpm --filter web build

step "8b   smoke: arrancar el bundle y leer de Postgres"
# Reusa apps/api/scripts/smoke.sh. Necesita DATABASE_URL de producción: sale
# del .env del checkout (0600), el mismo que usa prisma.
if [[ -f packages/db/.env ]]; then
	set -a
	# shellcheck disable=SC1091
	. packages/db/.env
	set +a
fi
: "${DATABASE_URL:?DATABASE_URL no está definida (¿falta packages/db/.env?)}"
SMOKE_PORT="$SMOKE_PORT" SMOKE_DATABASE_URL="$DATABASE_URL" bash apps/api/scripts/smoke.sh

step "9    reiniciando servicios"
sudo systemctl restart marketplace-api marketplace-web

step "10   verificando que el sitio responde (hasta 60s)"
ok=0
for _ in $(seq 1 60); do
	if curl -sf "$API_HEALTH_URL" >/dev/null && curl -sf -o /dev/null "$HEALTH_URL"; then
		ok=1
		break
	fi
	sleep 1
done
if [[ "$ok" -ne 1 ]]; then
	echo "deploy.sh: los servicios no respondieron tras el restart" >&2
	echo "  revisá: journalctl -u marketplace-api -u marketplace-web -n 50" >&2
	echo "  para volver atrás: ./rollback.sh last-good" >&2
	exit 1
fi

step "11   registrando last-good-sha"
sudo mkdir -p "$LAST_GOOD_DIR"
echo "$DEPLOY_SHA" | sudo tee "${LAST_GOOD_DIR}/last-good-sha" >/dev/null

echo
echo "deploy OK -> ${DEPLOY_SHA}"
