#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Test — swap de emergencia en bootstrap-vm.sh para la micro de 1 GB.
#
# La caja tiene 1 GB de RAM. El swapfile es un colchón de emergencia, no
# paginación de rutina: por eso `vm.swappiness` bajo y persistido. Correr
# bootstrap dos veces NO debe crear un segundo swapfile.
#
# No hay Linux ni root en la máquina de desarrollo, así que esto verifica de
# forma estática (como el resto de la suite infra) que el script:
#   - usa 2 GB por defecto
#   - fija vm.swappiness bajo y lo persiste en /etc/sysctl.d
#   - tiene un guard de idempotencia contra un segundo swapfile
#
# Uso: bash tests/deploy/swap-config.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="${REPO_ROOT}/infra/provision/bootstrap-vm.sh"
FAILURES=0

[[ -f "$SCRIPT" ]] || { echo "FAIL: no existe bootstrap-vm.sh"; exit 1; }

want() {
	local desc="$1" pattern="$2"
	if grep -Eq "$pattern" "$SCRIPT"; then
		echo "ok   ${desc}"
	else
		echo "FAIL ${desc}  (esperaba /${pattern}/)"
		FAILURES=$((FAILURES + 1))
	fi
}

if bash -n "$SCRIPT"; then
	echo "ok   sintaxis: bash -n"
else
	echo "FAIL: bootstrap-vm.sh no parsea"
	exit 1
fi

want "swap: 2 GB por defecto"                    'SWAP_SIZE_GB:-2\}'
want "swap: configura vm.swappiness"             'vm\.swappiness'
want "swap: persiste el sysctl en /etc/sysctl.d" '/etc/sysctl\.d/'
want "swap: swappiness bajo por defecto (<=20)"  'SWAPPINESS:-([1-9]|1[0-9]|20)\}'
want "swap: guard de idempotencia (swapon)"      'swapon --show'

if [[ "$FAILURES" -ne 0 ]]; then
	echo "swap-config: ${FAILURES} fallo(s)"
	exit 1
fi
echo "swap-config: OK"
