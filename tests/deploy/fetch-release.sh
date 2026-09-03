#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Test — descarga y verificación del artefacto de build prehecho.
#
# La caja de 1 GB no puede correr `next build` ni `tsup`: los builds se hacen en
# GitHub Actions (linux-x64, igual arquitectura que VM.Standard.E2.1.Micro) y se
# publican como asset de un GitHub Release. `infra/scripts/fetch-release.sh`
# baja ese tarball, verifica su SHA-256 y lo extrae.
#
# Este test levanta un servidor HTTP local que hace de "GitHub Releases" y exige:
#   - tarball con checksum correcto  -> extrae y sale 0
#   - tarball manipulado             -> aborta != 0, NO deja archivos a medias
#   - RELEASE_SHA que no coincide     -> aborta != 0
#
# Uso: bash tests/deploy/fetch-release.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="${REPO_ROOT}/infra/scripts/fetch-release.sh"

if [[ ! -f "$SCRIPT" ]]; then
	echo "FAIL: infra/scripts/fetch-release.sh no existe todavía"
	exit 1
fi

command -v python3 >/dev/null || {
	echo "SKIP: hace falta python3 para el servidor de prueba"
	exit 0
}

WORK="$(mktemp -d)"
SRV_PID=""
cleanup() {
	if [[ -n "$SRV_PID" ]]; then
		kill "$SRV_PID" 2>/dev/null || true
		wait "$SRV_PID" 2>/dev/null || true
	fi
	rm -rf "$WORK"
}
trap cleanup EXIT

FAKE_SHA="0123456789abcdef0123456789abcdef01234567"
SHORT="${FAKE_SHA:0:12}"
OTHER_SHA="deadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
OTHER_SHORT="${OTHER_SHA:0:12}"

# ── armar un "release" plausible ────────────────────────────────────────────
BUILD="${WORK}/build"
mkdir -p "${BUILD}/apps/api/dist" "${BUILD}/apps/web/.next/standalone/apps/web"
echo "console.log('api')" >"${BUILD}/apps/api/dist/server.mjs"
echo "console.log('web')" >"${BUILD}/apps/web/.next/standalone/apps/web/server.js"
printf '%s\n' "$FAKE_SHA" >"${BUILD}/RELEASE_SHA"

PAGES="${WORK}/pages/release-${SHORT}"
mkdir -p "$PAGES"
tar czf "${PAGES}/marketplace-release.tar.gz" -C "$BUILD" .
( cd "$PAGES" && sha256sum marketplace-release.tar.gz >marketplace-release.tar.gz.sha256 )

# El MISMO tarball (RELEASE_SHA=$FAKE_SHA) publicado bajo el tag de OTRO commit,
# para el caso 3: el checksum va a estar bien pero el RELEASE_SHA no coincide.
OTHER_PAGES="${WORK}/pages/release-${OTHER_SHORT}"
mkdir -p "$OTHER_PAGES"
cp "${PAGES}/marketplace-release.tar.gz" "${PAGES}/marketplace-release.tar.gz.sha256" "$OTHER_PAGES/"

# ── servidor local que hace de github.com/.../releases/download ─────────────
PORT_FILE="${WORK}/port"
python3 - "${WORK}/pages" "$PORT_FILE" <<'PY' &
import sys, http.server, socketserver, os
root, port_file = sys.argv[1], sys.argv[2]
os.chdir(root)
with socketserver.TCPServer(("127.0.0.1", 0), http.server.SimpleHTTPRequestHandler) as httpd:
    with open(port_file, "w") as fh:
        fh.write(str(httpd.server_address[1]))
    httpd.serve_forever()
PY
SRV_PID=$!
PORT=""
for _ in $(seq 1 50); do
	[[ -s "$PORT_FILE" ]] && PORT="$(cat "$PORT_FILE")" && break
	sleep 0.1
done
[[ -n "$PORT" ]] || { echo "FAIL: no se pudo descubrir el puerto del servidor de prueba"; exit 1; }

BASE="http://127.0.0.1:${PORT}"
FAILURES=0

# ── caso 1: checksum correcto -> extrae y sale 0 ───────────────────────────
DEST1="${WORK}/dest-ok"
if RELEASE_BASE_URL="$BASE" bash "$SCRIPT" "$FAKE_SHA" "$DEST1" >/dev/null 2>&1; then
	if [[ -f "${DEST1}/apps/api/dist/server.mjs" && -f "${DEST1}/apps/web/.next/standalone/apps/web/server.js" ]]; then
		echo "ok   caso 1: checksum válido -> extrae los artefactos"
	else
		echo "FAIL caso 1: salió 0 pero no dejó los artefactos donde corresponde"
		FAILURES=$((FAILURES + 1))
	fi
else
	echo "FAIL caso 1: rechazó un tarball con checksum correcto"
	FAILURES=$((FAILURES + 1))
fi

# ── caso 2: tarball manipulado -> aborta != 0 ──────────────────────────────
echo "basura extra" >>"${PAGES}/marketplace-release.tar.gz"
DEST2="${WORK}/dest-tampered"
set +e
RELEASE_BASE_URL="$BASE" bash "$SCRIPT" "$FAKE_SHA" "$DEST2" >/dev/null 2>&1
code2=$?
set -e
if [[ "$code2" -ne 0 ]]; then
	echo "ok   caso 2: tarball manipulado -> aborta (code ${code2})"
else
	echo "FAIL caso 2: aceptó un tarball con checksum incorrecto"
	FAILURES=$((FAILURES + 1))
fi
# restaurar el tarball bueno para el caso 3
tar czf "${PAGES}/marketplace-release.tar.gz" -C "$BUILD" .
( cd "$PAGES" && sha256sum marketplace-release.tar.gz >marketplace-release.tar.gz.sha256 )

# ── caso 3: checksum OK pero RELEASE_SHA != el SHA pedido -> aborta != 0 ───
DEST3="${WORK}/dest-mismatch"
set +e
OUT3="$(RELEASE_BASE_URL="$BASE" bash "$SCRIPT" "$OTHER_SHA" "$DEST3" 2>&1)"
code3=$?
set -e
if [[ "$code3" -ne 0 ]] && grep -qi "otro commit" <<<"$OUT3"; then
	echo "ok   caso 3: checksum OK pero RELEASE_SHA distinto -> aborta (code ${code3})"
elif [[ "$code3" -ne 0 ]]; then
	echo "FAIL caso 3: abortó pero no por el desajuste de RELEASE_SHA"
	echo "       salida: ${OUT3}"
	FAILURES=$((FAILURES + 1))
else
	echo "FAIL caso 3: no detectó el desajuste de SHA"
	FAILURES=$((FAILURES + 1))
fi

if [[ "$FAILURES" -ne 0 ]]; then
	echo "fetch-release: ${FAILURES} fallo(s)"
	exit 1
fi
echo "fetch-release: OK"
