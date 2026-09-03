#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# RED test — frontera "estado de commits".
#
# deploy.sh hace `git reset --hard origin/<ref>`: descarta cambios locales a
# propósito, para que el estado de la VM sea función pura del ref. Este test
# aísla ese paso (infra/scripts/sync-checkout.sh) y exige que, partiendo de un
# checkout sucio, termine:
#   - en el SHA de origin/<ref>
#   - con el árbol de archivos versionados limpio (sin modificaciones)
#   - con salida 0
# Los archivos NO versionados (node_modules, packages/db/.env) deben sobrevivir:
# el script no debe hacer `git clean`.
#
# Uso: bash tests/deploy/dirty-worktree.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SYNC="${REPO_ROOT}/infra/scripts/sync-checkout.sh"

if [[ ! -f "$SYNC" ]]; then
	echo "FAIL: infra/scripts/sync-checkout.sh no existe todavía"
	exit 1
fi

WORK="$(mktemp -d)"
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t

ORIGIN="${WORK}/origin.git"
CLONE="${WORK}/clone"
REF="fase-5-frontend-y-avisos"

git init -q --bare "$ORIGIN"

git init -q "${WORK}/seed"
(
	cd "${WORK}/seed"
	git checkout -q -b "$REF"
	echo "v1" >app.txt
	echo "config" >tracked.txt
	git add -A
	git commit -q -m "v1"
	git remote add origin "$ORIGIN"
	git push -q origin "$REF"
)

git clone -q "$ORIGIN" "$CLONE"
cd "$CLONE"
git checkout -q "$REF"

# Segundo commit en origin: el destino real.
(
	cd "${WORK}/seed"
	echo "v2" >app.txt
	git add -A
	git commit -q -m "v2"
	git push -q origin "$REF"
)
TARGET="$(git -C "${WORK}/seed" rev-parse HEAD)"

# Ensuciar el clone: modificar un archivo versionado y dejar uno sin versionar.
echo "LOCAL EDIT" >>tracked.txt
echo "secreto" >.env.local
mkdir -p node_modules && echo x >node_modules/marker

set +e
OUT="$(bash "$SYNC" "$REF" 2>&1)"
CODE=$?
set -e

FAIL=0
if [[ "$CODE" -ne 0 ]]; then
	echo "FAIL: sync-checkout salió ${CODE}"
	echo "$OUT"
	FAIL=1
fi

HEAD_NOW="$(git rev-parse HEAD)"
if [[ "$HEAD_NOW" != "$TARGET" ]]; then
	echo "FAIL: HEAD=${HEAD_NOW}, esperaba ${TARGET}"
	FAIL=1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
	echo "FAIL: quedan modificaciones en archivos versionados"
	git status --porcelain
	FAIL=1
fi

if [[ "$(cat app.txt)" != "v2" ]]; then
	echo "FAIL: app.txt no quedó en v2"
	FAIL=1
fi

if [[ ! -f node_modules/marker || ! -f .env.local ]]; then
	echo "FAIL: se borraron archivos no versionados (node_modules/.env)"
	FAIL=1
fi

if [[ "$FAIL" -ne 0 ]]; then
	exit 1
fi
echo "dirty-worktree: OK"
