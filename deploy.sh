#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Despliegue continuo del marketplace en la VM. Idempotente: correrlo de nuevo
# sobre el mismo ref no cambia nada observable.
#
#   ./deploy.sh [<ref>]        # ref por defecto: fase-5-frontend-y-avisos
#
# La caja es una VM.Standard.E2.1.Micro (1 OCPU / 1 GB). NO puede correr
# `next build` ni `tsup` (picos de 1–2 GB de heap): esos builds se hacen en
# GitHub Actions (runner linux-x64, misma arquitectura que la micro) y se
# publican como asset de un GitHub Release. Este script BAJA ese artefacto
# prehecho, no lo construye.
#
# Lo que sí corre acá: sincronizar el checkout, `pnpm install` (tolera el swap,
# no mantiene heaps grandes), `prisma migrate deploy` (aplica SQL, liviano), y
# un smoke real contra Postgres antes de tocar los servicios.
#
# El criterio de éxito NO es "el build terminó en 0": el paso de smoke arranca
# el bundle y le pide una lectura real a Postgres; y la verificación final hace
# un `POST /auth/login` que debe dar 403 del dominio (toca la base de verdad,
# a diferencia de /health).
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
WEB_URL="http://127.0.0.1:3000/"
API_HEALTH_URL="http://127.0.0.1:3001/health"
API_LOGIN_URL="http://127.0.0.1:3001/auth/login"
LAST_GOOD_DIR="/var/lib/marketplace"

step() { echo; echo "── $* ─────────────────────────────────────────────"; }

step "1-2  sincronizando checkout a origin/${REF}"
infra/scripts/sync-checkout.sh "$REF"
DEPLOY_SHA="$(git rev-parse HEAD)"
echo "  SHA objetivo: ${DEPLOY_SHA}"

step "3    pnpm install --frozen-lockfile (solo API + db)"
# Filtrado a @marketplace/api y @marketplace/db: deja afuera `next`, `tailwind`,
# `turbo` y demás — pesado e inútil en la caja de 1 GB, porque el web ya viene
# construido en el artefacto. install tolera el swap (es I/O, no heap grande).
# SIN --prod: `dotenv` es devDependency de apps/api y se importa en runtime, y
# `prisma` (el CLI de migraciones) es devDependency de packages/db.
pnpm install --frozen-lockfile \
	--filter "@marketplace/api..." \
	--filter "@marketplace/db..."

# DATABASE_URL sale del MISMO archivo que usa la API, /etc/marketplace/api.env
# (root, 0600). Antes había que duplicarla en packages/db/.env, y el propio
# diseño marcaba que desincronizar esas dos copias era el error más probable:
# falla tarde, porque /health responde 200 igual y el problema recién aparece
# en el primer pedido real. Con una sola fuente ese modo de falla no existe.
#
# Se exporta ACÁ, antes del paso 4, porque `prisma generate` ya carga
# prisma.config.ts y ese archivo resuelve env('DATABASE_URL') al importarse —
# no solo `migrate deploy`. `dotenv/config` no pisa lo que ya está en el
# entorno, así que exportarla alcanza para los dos pasos y para el smoke.
DATABASE_URL="$(sudo sed -n 's/^DATABASE_URL=//p' /etc/marketplace/api.env)"
export DATABASE_URL
: "${DATABASE_URL:?no se pudo leer DATABASE_URL de /etc/marketplace/api.env}"

step "4    prisma generate (cliente para el CLI de migraciones)"
pnpm --filter @marketplace/db db:generate

step "5    prisma migrate deploy"
# El cwd importa: prisma.config.ts se resuelve relativo a packages/db.
# NUNCA `prisma db push`. DATABASE_URL ya está exportada más arriba.
(cd packages/db && pnpm exec prisma migrate deploy)

step "6    bajando el artefacto de build prehecho (CI) para ${DEPLOY_SHA:0:12}"
# fetch-release.sh baja + verifica SHA-256 + comprueba que RELEASE_SHA coincide,
# y recién entonces deja el contenido en el destino. Si CI todavía no publicó el
# release para este commit, aborta acá — los servicios viejos siguen arriba.
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
infra/scripts/fetch-release.sh "$DEPLOY_SHA" "$STAGE"

# Reemplaza SOLO las salidas de build (ambas gitignored, no ensucian el árbol).
rm -rf apps/api/dist apps/web/.next
mkdir -p apps/api apps/web
cp -a "${STAGE}/apps/api/dist" apps/api/dist
cp -a "${STAGE}/apps/web/.next" apps/web/.next
rm -rf "$STAGE"
trap - EXIT
echo "  artefacto en su lugar: apps/api/dist + apps/web/.next/standalone"

step "7    smoke: arrancar el bundle de la API y leer de Postgres"
# Reusa apps/api/scripts/smoke.sh, con la misma DATABASE_URL que ya se exportó
# en el paso 5: una sola fuente para las migraciones, el smoke y la API.
SMOKE_PORT="$SMOKE_PORT" SMOKE_DATABASE_URL="$DATABASE_URL" \
	SMOKE_SKIP_BUILD=1 bash apps/api/scripts/smoke.sh

step "8    reiniciando servicios"
sudo systemctl restart marketplace-api marketplace-web

step "9    verificando el stack (hasta 60s) — health + lectura real de Postgres"
# /health NO alcanza: responde 200 sin tocar la base. La prueba de que el stack
# anda es un login de un usuario inexistente que devuelve el 403 del dominio.
ok=0
for _ in $(seq 1 60); do
	if curl -sf "$API_HEALTH_URL" >/dev/null 2>&1 && curl -sf -o /dev/null "$WEB_URL" 2>/dev/null; then
		code="$(curl -s -o /dev/null -w '%{http_code}' \
			-X POST "$API_LOGIN_URL" -H 'content-type: application/json' \
			-d '{"email":"noexiste@deploy.check","password":"x"}' || true)"
		if [[ "$code" == "403" ]]; then
			ok=1
			break
		fi
	fi
	sleep 1
done
if [[ "$ok" -ne 1 ]]; then
	echo "deploy.sh: el stack no verificó tras el restart" >&2
	echo "  revisá: journalctl -u marketplace-api -u marketplace-web -n 50" >&2
	echo "  para volver atrás: ./rollback.sh last-good" >&2
	exit 1
fi

step "10   registrando last-good-sha"
sudo mkdir -p "$LAST_GOOD_DIR"
echo "$DEPLOY_SHA" | sudo tee "${LAST_GOOD_DIR}/last-good-sha" >/dev/null

echo
echo "deploy OK -> ${DEPLOY_SHA}"
