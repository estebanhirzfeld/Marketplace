#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Deja el checkout exactamente en origin/<ref>, descartando cambios locales en
# archivos versionados. Los archivos NO versionados (node_modules, .env,
# packages/db/generated) se conservan: nunca se hace `git clean`.
#
# Es el paso de deploy.sh y rollback.sh que toca `git`, aislado para poder
# testearlo (tests/deploy/dirty-worktree.sh).
#
# Uso:  infra/scripts/sync-checkout.sh <ref-o-sha>
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REF="${1:?uso: sync-checkout.sh <ref-o-sha>}"

git rev-parse --git-dir >/dev/null 2>&1 || {
	echo "sync-checkout: el directorio actual no es un repositorio git" >&2
	exit 1
}

git fetch --all --prune

if git rev-parse --verify --quiet "origin/${REF}" >/dev/null; then
	TARGET="origin/${REF}"
	git checkout -f -B "$REF" "origin/${REF}"
else
	# Es un SHA (o un tag): checkout directo en detached HEAD.
	TARGET="$REF"
	git checkout -f "$REF"
fi

git reset --hard "$TARGET"

echo "sync-checkout: HEAD en $(git rev-parse --short HEAD) ($TARGET)"
