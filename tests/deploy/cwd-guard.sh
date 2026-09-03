#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# RED test — frontera "selección de repositorio git".
#
# deploy.sh y rollback.sh corren `git` sobre el checkout de la VM. Si se los
# invocara desde otro directorio, operarían sobre el repo equivocado. Este test
# exige que ambos aborten con salida != 0 cuando el cwd no es /srv/marketplace,
# y que lo digan en el mensaje.
#
# Uso: bash tests/deploy/cwd-guard.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FAILURES=0

check() {
	local script="$1"
	local path="${REPO_ROOT}/${script}"

	if [[ ! -f "$path" ]]; then
		echo "FAIL ${script}: no existe todavía"
		FAILURES=$((FAILURES + 1))
		return
	fi

	local tmp out code
	tmp="$(mktemp -d)"
	set +e
	out="$(cd "$tmp" && bash "$path" fase-5-frontend-y-avisos 2>&1)"
	code=$?
	set -e
	rm -rf "$tmp"

	if [[ "$code" -eq 0 ]]; then
		echo "FAIL ${script}: salió 0 corriendo desde ${tmp} (esperaba != 0)"
		FAILURES=$((FAILURES + 1))
		return
	fi

	if ! grep -qi "/srv/marketplace" <<<"$out"; then
		echo "FAIL ${script}: abortó (code ${code}) pero no nombró /srv/marketplace"
		echo "       salida: ${out}"
		FAILURES=$((FAILURES + 1))
		return
	fi

	echo "ok   ${script}: aborta desde otro cwd (code ${code})"
}

check deploy.sh
check rollback.sh

if [[ "$FAILURES" -ne 0 ]]; then
	echo "cwd-guard: ${FAILURES} fallo(s)"
	exit 1
fi
echo "cwd-guard: OK"
