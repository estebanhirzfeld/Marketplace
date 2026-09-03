#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Prueba de humo del artefacto de producción de la API.
#
# Construye el bundle, lo arranca en un puerto libre y comprueba que responde
# una lectura real contra Postgres. El criterio de aceptación NO es "el build
# terminó en 0": un bundle CJS de esta app compila y produce un artefacto que
# muere al arrancar. Lo que se verifica acá es que el proceso levanta y que
# `POST /auth/login` devuelve el 403 propio del dominio, lo que prueba la
# cadena completa: bundle -> Prisma -> pg -> Postgres -> caso de uso.
#
# Uso:  bash apps/api/scripts/smoke.sh
# Env:  SMOKE_PORT        (default 3099)
#       SMOKE_DATABASE_URL (default apunta al contenedor de desarrollo)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$REPO_ROOT"

PORT="${SMOKE_PORT:-3099}"
DATABASE_URL="${SMOKE_DATABASE_URL:-postgresql://marketplace:marketplace@127.0.0.1:5434/marketplace_dev}"
ARTIFACT="apps/api/dist/server.mjs"
BASE="http://127.0.0.1:${PORT}"

SERVER_PID=""
cleanup() {
    if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
        kill "$SERVER_PID" 2>/dev/null || true
        wait "$SERVER_PID" 2>/dev/null || true
    fi
}
trap cleanup EXIT

fail() { echo "SMOKE FAIL: $*" >&2; exit 1; }

echo "→ build"
pnpm --filter @marketplace/api build >/dev/null

[[ -f "$ARTIFACT" ]] || fail "no se generó $ARTIFACT (¿el build no es un bundle ESM?)"

# El artefacto no debe referenciar archivos .ts en tiempo de ejecución: los
# paquetes de workspace se inlinan en el bundle.
if grep -Eq "(require\(|from *)['\"][^'\"]*\.ts['\"]" "$ARTIFACT"; then
    fail "el bundle referencia archivos .ts — no es autocontenido"
fi

echo "→ boot en :${PORT}"
JWT_SECRET=smoke-secret \
DATABASE_URL="$DATABASE_URL" \
PORT="$PORT" \
NODE_ENV=production \
node "$ARTIFACT" &
SERVER_PID=$!

# Espera a que /health responda (máx ~30s).
for i in $(seq 1 60); do
    if kill -0 "$SERVER_PID" 2>/dev/null; then
        if curl -sf "${BASE}/health" >/dev/null 2>&1; then break; fi
    else
        fail "el proceso murió durante el arranque"
    fi
    sleep 0.5
    [[ "$i" == "60" ]] && fail "/health no respondió a tiempo"
done

HEALTH="$(curl -sf "${BASE}/health")"
echo "  /health -> ${HEALTH}"
[[ "$HEALTH" == '{"status":"ok"}' ]] || fail "/health inesperado: ${HEALTH}"

# Lectura real contra Postgres: un usuario inexistente debe dar el 403 del
# dominio, no un 500 ni un error de engine/ENOENT.
LOGIN_BODY="$(mktemp)"
LOGIN_CODE="$(curl -s -o "$LOGIN_BODY" -w '%{http_code}' \
    -X POST "${BASE}/auth/login" \
    -H 'content-type: application/json' \
    -d '{"email":"noexiste@test.com","password":"malapassword"}')"
LOGIN_JSON="$(cat "$LOGIN_BODY")"; rm -f "$LOGIN_BODY"
echo "  POST /auth/login -> ${LOGIN_CODE} ${LOGIN_JSON}"

[[ "$LOGIN_CODE" == "403" ]] || fail "login esperaba 403, obtuvo ${LOGIN_CODE}: ${LOGIN_JSON}"
case "$LOGIN_JSON" in
    *'"code":"FORBIDDEN"'*) : ;;
    *) fail "login no devolvió el error de dominio: ${LOGIN_JSON}" ;;
esac

echo "SMOKE OK"
