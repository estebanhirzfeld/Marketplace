#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Reescribe las reglas de ingreso de la security list del marketplace para que
# SSH (22/tcp) quede abierto SOLO a la IP pública desde la que se corre esto.
#
# Es la recuperación de lockout documentada: la IP residencial del operador
# rota, y cuando lo hace SSH deja de entrar. Este script se corre desde
# cualquier máquina que tenga la API key de OCI configurada (~/.oci/config) y
# vuelve a habilitar el acceso. NO necesita SSH a la VM.
#
# REEMPLAZA todas las reglas de ingreso por el conjunto canónico:
#     22/tcp   <- <IP detectada>/32     (SSH, solo el operador)
#     80/tcp   <- 0.0.0.0/0             (HTTP, para el redirect y Let's Encrypt)
#     443/tcp  <- 0.0.0.0/0             (HTTPS)
# No hace merge con lo que hubiera antes: el objetivo es una postura conocida.
#
# Uso:
#   infra/scripts/allow-my-ip.sh --security-list-id <ocid> [--ip <ip>] [--dry-run]
#   MARKETPLACE_SSH_SECURITY_LIST_OCID=<ocid> infra/scripts/allow-my-ip.sh
#   infra/scripts/allow-my-ip.sh --help
#
#   --security-list-id  OCID EXPLÍCITO de la security list del VCN del
#                       marketplace. Nunca se descubre "la primera": lo emite
#                       launch-instance.sh en infra/provision/launch.log.
#   --ip                fuerza la IP en vez de detectarla (para pruebas).
#   --dry-run           imprime las reglas y el comando, no toca nada.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

usage() {
	awk 'NR>1 && /^[^#]/{exit} NR>1{sub(/^# ?/,"");print}' "$0"
}

SECURITY_LIST_ID="${MARKETPLACE_SSH_SECURITY_LIST_OCID:-}"
FORCED_IP=""
DRY_RUN=0

while [[ $# -gt 0 ]]; do
	case "$1" in
	--help | -h)
		usage
		exit 0
		;;
	--security-list-id)
		SECURITY_LIST_ID="${2:?--security-list-id necesita un OCID}"
		shift 2
		;;
	--ip)
		FORCED_IP="${2:?--ip necesita un valor}"
		shift 2
		;;
	--dry-run)
		DRY_RUN=1
		shift
		;;
	*)
		echo "opción desconocida: $1" >&2
		exit 2
		;;
	esac
done

if [[ -z "$SECURITY_LIST_ID" ]]; then
	echo "falta --security-list-id (o MARKETPLACE_SSH_SECURITY_LIST_OCID)." >&2
	echo "el OCID está en infra/provision/launch.log" >&2
	exit 2
fi
case "$SECURITY_LIST_ID" in
ocid1.securitylist.*) : ;;
*)
	echo "esto no parece un OCID de security list: $SECURITY_LIST_ID" >&2
	exit 2
	;;
esac

command -v oci >/dev/null || {
	echo "falta el CLI de oci" >&2
	exit 3
}

if [[ -n "$FORCED_IP" ]]; then
	IP="$FORCED_IP"
else
	echo "→ detectando IP pública" >&2
	IP="$(curl -fsS --max-time 10 https://api.ipify.org)"
fi

if [[ ! "$IP" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
	echo "IP inválida: '$IP'" >&2
	exit 1
fi
echo "  IP = ${IP}" >&2

read -r -d '' RULES <<JSON || true
[
  {
    "source": "${IP}/32",
    "sourceType": "CIDR_BLOCK",
    "protocol": "6",
    "isStateless": false,
    "description": "SSH solo desde la IP del operador (allow-my-ip.sh)",
    "tcpOptions": { "destinationPortRange": { "min": 22, "max": 22 } }
  },
  {
    "source": "0.0.0.0/0",
    "sourceType": "CIDR_BLOCK",
    "protocol": "6",
    "isStateless": false,
    "description": "HTTP (redirect + ACME HTTP-01)",
    "tcpOptions": { "destinationPortRange": { "min": 80, "max": 80 } }
  },
  {
    "source": "0.0.0.0/0",
    "sourceType": "CIDR_BLOCK",
    "protocol": "6",
    "isStateless": false,
    "description": "HTTPS",
    "tcpOptions": { "destinationPortRange": { "min": 443, "max": 443 } }
  }
]
JSON

echo "── reglas de ingreso a aplicar ──────────────────────────────────" >&2
echo "$RULES" >&2
echo "────────────────────────────────────────────────────────────────" >&2

if [[ "$DRY_RUN" -eq 1 ]]; then
	echo "[dry-run] oci network security-list update \\"
	echo "  --security-list-id ${SECURITY_LIST_ID} \\"
	echo "  --ingress-security-rules '<las reglas de arriba>' \\"
	echo "  --force"
	exit 0
fi

oci network security-list update \
	--security-list-id "$SECURITY_LIST_ID" \
	--ingress-security-rules "$RULES" \
	--force

echo "listo: SSH ahora entra solo desde ${IP}/32"
