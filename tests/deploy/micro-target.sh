#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Test — objetivo x86 `VM.Standard.E2.1.Micro` en launch-instance.sh.
#
# La capacidad de Ampere A1 en `sa-saopaulo-1` está agotada (44 intentos, ~2 h,
# "Out of host capacity" siempre). El despliegue se reorienta a la micro x86
# `VM.Standard.E2.1.Micro` (1 OCPU / 1 GB, AMD EPYC, x86_64 — NO ARM), sin
# borrar el camino A1: puede liberarse capacidad más adelante.
#
# Exige, sobre `launch-instance.sh --micro --dry-run`:
#   - el plan nombra `VM.Standard.E2.1.Micro`
#   - el plan dice `x86_64` y NO `aarch64` (imagen distinta)
#   - la micro es shape fija: el código NO le pasa `--shape-config`
#   - el default (sin --micro) sigue siendo A1
#
# Uso: bash tests/deploy/micro-target.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="${REPO_ROOT}/infra/provision/launch-instance.sh"
FAILURES=0

[[ -f "$SCRIPT" ]] || { echo "FAIL: no existe launch-instance.sh"; exit 1; }

pass() { echo "ok   $1"; }
fail() { echo "FAIL $1"; FAILURES=$((FAILURES + 1)); }

FAKE_KEY="${REPO_ROOT}/.git/HEAD" # cualquier archivo que exista
run_plan() {
	MARKETPLACE_COMPARTMENT_OCID="ocid1.compartment.oc1..fake" \
		MARKETPLACE_SSH_PUBKEY="$FAKE_KEY" \
		bash "$SCRIPT" "$@" --dry-run 2>&1
}

# ── micro ──────────────────────────────────────────────────────────────────
set +e
MICRO_PLAN="$(run_plan --micro)"
micro_code=$?
set -e
if [[ "$micro_code" -ne 0 ]]; then
	echo "FAIL: 'launch-instance.sh --micro --dry-run' salió ${micro_code}"
	echo "$MICRO_PLAN"
	exit 1
fi

if grep -q "VM.Standard.E2.1.Micro" <<<"$MICRO_PLAN"; then
	pass "micro: el plan nombra VM.Standard.E2.1.Micro"
else
	fail "micro: el plan no nombra la shape micro"
fi

if grep -qiE "x86_64|amd64" <<<"$MICRO_PLAN"; then
	pass "micro: el plan indica imagen x86_64"
else
	fail "micro: el plan no indica x86_64"
fi

if grep -qiE "aarch64|arm64" <<<"$MICRO_PLAN"; then
	fail "micro: el plan todavía dice aarch64/arm64"
else
	pass "micro: el plan ya no dice aarch64"
fi

# ── la micro no admite --shape-config: no debe enviarse en ese camino ──────
if grep -Eq 'E2\.1\.Micro' "$SCRIPT" && grep -Eq 'shape-config' "$SCRIPT"; then
	if grep -Eq 'SHAPE_CONFIG_ARGS' "$SCRIPT"; then
		pass "micro: hay un guard que omite --shape-config para la micro"
	else
		fail "micro: --shape-config aparece sin un guard para la shape fija"
	fi
fi

# ── default sigue siendo A1 ────────────────────────────────────────────────
set +e
A1_PLAN="$(run_plan)"
a1_code=$?
set -e
if [[ "$a1_code" -ne 0 ]]; then
	fail "default: 'launch-instance.sh --dry-run' salió ${a1_code}"
elif grep -q "VM.Standard.A1.Flex" <<<"$A1_PLAN"; then
	pass "default: sigue siendo VM.Standard.A1.Flex"
else
	fail "default: ya no es A1"
fi

if [[ "$FAILURES" -ne 0 ]]; then
	echo "micro-target: ${FAILURES} fallo(s)"
	exit 1
fi
echo "micro-target: OK"
