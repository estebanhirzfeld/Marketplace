#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Baja el artefacto de build prehecho para un SHA y lo extrae.
#
# La micro de 1 GB no puede correr `next build` ni `tsup` (picos de 1–2 GB de
# heap). Los builds se hacen en GitHub Actions —runner linux-x64, misma
# arquitectura que VM.Standard.E2.1.Micro— y se publican como asset de un
# GitHub Release con tag `release-<sha12>`. Este script:
#
#   1. baja  <base>/release-<sha12>/marketplace-release.tar.gz  y su .sha256
#   2. verifica el SHA-256 (un tarball manipulado o a medio bajar -> aborta)
#   3. extrae a un dir de staging y comprueba que RELEASE_SHA == el SHA pedido
#   4. recién entonces mueve el contenido al destino
#
# El repo es público, así que el asset se baja sin credenciales.
#
# Uso:  infra/scripts/fetch-release.sh <sha> <dir-destino>
# Env:  RELEASE_BASE_URL  (default el releases/download de este repo)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SHA="${1:?uso: fetch-release.sh <sha> <dir-destino>}"
DEST="${2:?uso: fetch-release.sh <sha> <dir-destino>}"
SHORT="${SHA:0:12}"
BASE_URL="${RELEASE_BASE_URL:-https://github.com/estebanhirzfeld/Marketplace/releases/download}"
TAG="release-${SHORT}"
ASSET="marketplace-release.tar.gz"

command -v curl >/dev/null || { echo "fetch-release: falta curl" >&2; exit 3; }
command -v sha256sum >/dev/null || { echo "fetch-release: falta sha256sum" >&2; exit 3; }

TMP="$(mktemp -d)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

url="${BASE_URL}/${TAG}/${ASSET}"
echo "fetch-release: bajando ${url}"
curl -fsSL --retry 3 --retry-delay 2 -o "${TMP}/${ASSET}" "$url" || {
	echo "fetch-release: no se pudo bajar ${url}" >&2
	echo "  ¿ya publicó CI el release para ${SHORT}? (workflow 'release')" >&2
	exit 1
}
curl -fsSL --retry 3 --retry-delay 2 -o "${TMP}/${ASSET}.sha256" "${url}.sha256" || {
	echo "fetch-release: falta el .sha256 del release ${TAG}" >&2
	exit 1
}

# El archivo .sha256 trae "<hash>  marketplace-release.tar.gz"; se compara solo
# el hash para no depender del nombre/ruta que haya quedado guardado.
expected="$(awk '{print $1}' "${TMP}/${ASSET}.sha256")"
actual="$(sha256sum "${TMP}/${ASSET}" | awk '{print $1}')"
if [[ -z "$expected" || "$expected" != "$actual" ]]; then
	echo "fetch-release: SHA-256 no coincide" >&2
	echo "  esperado: ${expected:-<vacío>}" >&2
	echo "  obtenido: ${actual}" >&2
	exit 1
fi
echo "fetch-release: checksum OK (${actual})"

mkdir -p "${TMP}/stage"
tar xzf "${TMP}/${ASSET}" -C "${TMP}/stage"

released_sha="$(tr -d '[:space:]' <"${TMP}/stage/RELEASE_SHA" 2>/dev/null || true)"
if [[ "$released_sha" != "$SHA" ]]; then
	echo "fetch-release: el tarball es de otro commit" >&2
	echo "  pedido:   ${SHA}" >&2
	echo "  tarball:  ${released_sha:-<sin RELEASE_SHA>}" >&2
	exit 1
fi

mkdir -p "$DEST"
# copia el contenido del staging al destino (incluye dotfiles como .next)
cp -a "${TMP}/stage/." "$DEST/"
echo "fetch-release: extraído en ${DEST} (commit ${SHORT})"
