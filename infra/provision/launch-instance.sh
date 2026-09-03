#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Aprovisiona la VM del marketplace en Oracle Cloud, de forma ADITIVA.
#
# Crea, en este orden (cada prerequisito es independiente de la instancia, así
# que N lanzamientos fallidos no cuestan nada y un éxito reengancha todo):
#
#   1. IP pública RESERVADA          -> el DNS sobrevive al reemplazo de la VM
#   2. Block volume de 20 GB          -> los datos de Postgres, fuera del disco
#                                        de arranque; sobreviven a terminar la VM
#   3. VCN 10.1.0.0/16 propia         -> NUNCA se toca vcn-20260815-0137 (agency)
#      + subnet pública 10.1.0.0/24
#      + Internet Gateway + route
#      + security list: 22 desde 181.47.21.233/32, 80 y 443 desde 0.0.0.0/0
#   4. Instancia VM.Standard.A1.Flex (2 OCPU / 12 GB; --small -> 1/6), en un
#      loop que REINTENTA solo ante "Out of host capacity" y FALLA RÁPIDO ante
#      cualquier 4xx (shape mala, quota, auth, OCID malformado).
#
# Los OCID de todo lo creado se anotan en infra/provision/launch.log. Ese
# archivo es la fuente para allow-my-ip.sh (--security-list-id) y para el
# teardown.
#
# NO toca `agency` ni `agency-demo`: no los lee, no los referencia, y todo lo
# que crea lo selecciona por el OCID que acaba de generar.
#
# Uso:
#   MARKETPLACE_COMPARTMENT_OCID=ocid1.compartment.oc1..xxx \
#   MARKETPLACE_SSH_PUBKEY=$HOME/.ssh/id_ed25519.pub \
#   infra/provision/launch-instance.sh [--small] [--dry-run]
#
#   --small     1 OCPU / 6 GB (se agenda más fácil si A1 está saturado;
#               obliga a mover `next build` fuera de la VM, ver design Dec. 10)
#   --dry-run   imprime el plan y sale, sin llamar a OCI para crear nada
#
# Variables:
#   MARKETPLACE_COMPARTMENT_OCID  (obligatoria)
#   MARKETPLACE_SSH_PUBKEY        (obligatoria) ruta a la clave pública SSH
#   MARKETPLACE_REGION            default sa-saopaulo-1
#   MARKETPLACE_AD                default ofEW:SA-SAOPAULO-1-AD-1
#   MARKETPLACE_DISPLAY_NAME      default marketplace-traspaso
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

usage() { awk 'NR>1 && /^[^#]/{exit} NR>1{sub(/^# ?/,"");print}' "$0"; }

SHAPE_OCPUS=2
SHAPE_MEM_GB=12
DRY_RUN=0

while [[ $# -gt 0 ]]; do
	case "$1" in
	--help | -h)
		usage
		exit 0
		;;
	--small)
		SHAPE_OCPUS=1
		SHAPE_MEM_GB=6
		shift
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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG="${SCRIPT_DIR}/launch.log"

REGION="${MARKETPLACE_REGION:-sa-saopaulo-1}"
AD="${MARKETPLACE_AD:-ofEW:SA-SAOPAULO-1-AD-1}"
DISPLAY_NAME="${MARKETPLACE_DISPLAY_NAME:-marketplace-traspaso}"
COMPARTMENT="${MARKETPLACE_COMPARTMENT_OCID:-}"
PUBKEY_PATH="${MARKETPLACE_SSH_PUBKEY:-}"

SSH_CIDR="181.47.21.233/32"
VCN_CIDR="10.1.0.0/16"
SUBNET_CIDR="10.1.0.0/24"
SHAPE="VM.Standard.A1.Flex"
BOOT_VOLUME_GB=50
DATA_VOLUME_GB=20
OS_NAME="Canonical Ubuntu"
OS_VERSION="22.04"

log() { echo "[$(date -u +%FT%TZ)] $*" | tee -a "$LOG"; }

require() {
	local name="$1" val="$2"
	[[ -n "$val" ]] || {
		echo "falta $name" >&2
		exit 2
	}
}

require MARKETPLACE_COMPARTMENT_OCID "$COMPARTMENT"
require MARKETPLACE_SSH_PUBKEY "$PUBKEY_PATH"
case "$COMPARTMENT" in
ocid1.compartment.* | ocid1.tenancy.*) : ;;
*)
	echo "MARKETPLACE_COMPARTMENT_OCID no parece un OCID: $COMPARTMENT" >&2
	exit 2
	;;
esac
[[ -f "$PUBKEY_PATH" ]] || {
	echo "no existe la clave pública: $PUBKEY_PATH" >&2
	exit 2
}
command -v oci >/dev/null || {
	echo "falta el CLI de oci" >&2
	exit 3
}

cat <<PLAN
── plan de aprovisionamiento ────────────────────────────────────
  región / AD      : ${REGION} / ${AD}
  compartment      : ${COMPARTMENT}
  nombre           : ${DISPLAY_NAME}
  shape            : ${SHAPE}  ${SHAPE_OCPUS} OCPU / ${SHAPE_MEM_GB} GB
  imagen           : ${OS_NAME} ${OS_VERSION} aarch64
  boot / data      : ${BOOT_VOLUME_GB} GB boot  +  ${DATA_VOLUME_GB} GB block volume
  VCN / subnet     : ${VCN_CIDR}  /  ${SUBNET_CIDR}  (nueva, aislada de agency)
  ingress          : 22 <- ${SSH_CIDR} | 80,443 <- 0.0.0.0/0
  clave SSH        : ${PUBKEY_PATH}
  log de OCIDs     : ${LOG}
─────────────────────────────────────────────────────────────────
PLAN

if [[ "$DRY_RUN" -eq 1 ]]; then
	echo "[dry-run] no se crea nada."
	exit 0
fi

# ── wrapper: distingue "Out of host capacity" (reintentable) de 4xx (fatal) ──
# Devuelve:
#   0   -> ok, imprime stdout
#   75  -> reintentable (capacidad)
#   1   -> fatal (4xx u otro)
oci_call() {
	local out err code
	err="$(mktemp)"
	set +e
	out="$("$@" 2>"$err")"
	code=$?
	set -e
	if [[ "$code" -eq 0 ]]; then
		rm -f "$err"
		printf '%s' "$out"
		return 0
	fi
	local msg
	msg="$(cat "$err")"
	rm -f "$err"
	echo "$msg" >&2
	if grep -qiE "Out of host capacity|InternalError.*capacity|LimitExceeded.*capacity" <<<"$msg"; then
		return 75
	fi
	if grep -qiE '"status": *4[0-9][0-9]|NotAuthorized|InvalidParameter|QuotaExceeded|CannotParseRequest' <<<"$msg"; then
		log "FATAL 4xx: $(head -1 <<<"$msg")"
		return 1
	fi
	log "FATAL (no reintentable): $(head -1 <<<"$msg")"
	return 1
}

json_get() { python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]'"$1"')'; }

log "== inicio de aprovisionamiento =="

# ── 1. IP pública reservada ─────────────────────────────────────────────────
log "→ IP pública reservada"
IP_JSON="$(oci_call oci network public-ip create \
	--compartment-id "$COMPARTMENT" --lifetime RESERVED \
	--display-name "${DISPLAY_NAME}-ip" --region "$REGION")" || exit 1
RESERVED_IP_OCID="$(json_get '["id"]' <<<"$IP_JSON")"
RESERVED_IP_ADDR="$(json_get '["ip-address"]' <<<"$IP_JSON")"
log "  ip=${RESERVED_IP_ADDR} ocid=${RESERVED_IP_OCID}"

# ── 2. Block volume de datos ────────────────────────────────────────────────
log "→ block volume ${DATA_VOLUME_GB} GB"
VOL_JSON="$(oci_call oci bv volume create \
	--compartment-id "$COMPARTMENT" --availability-domain "$AD" \
	--size-in-gbs "$DATA_VOLUME_GB" --display-name "${DISPLAY_NAME}-pgdata" \
	--region "$REGION")" || exit 1
DATA_VOLUME_OCID="$(json_get '["id"]' <<<"$VOL_JSON")"
log "  ocid=${DATA_VOLUME_OCID}"

# ── 3. Red ─────────────────────────────────────────────────────────────────
log "→ VCN ${VCN_CIDR}"
VCN_JSON="$(oci_call oci network vcn create \
	--compartment-id "$COMPARTMENT" --cidr-blocks "[\"$VCN_CIDR\"]" \
	--display-name "${DISPLAY_NAME}-vcn" --region "$REGION")" || exit 1
VCN_OCID="$(json_get '["id"]' <<<"$VCN_JSON")"
log "  ocid=${VCN_OCID}"

log "→ Internet Gateway"
IGW_JSON="$(oci_call oci network internet-gateway create \
	--compartment-id "$COMPARTMENT" --vcn-id "$VCN_OCID" --is-enabled true \
	--display-name "${DISPLAY_NAME}-igw" --region "$REGION")" || exit 1
IGW_OCID="$(json_get '["id"]' <<<"$IGW_JSON")"
log "  ocid=${IGW_OCID}"

log "→ route table"
RT_RULES="[{\"destination\":\"0.0.0.0/0\",\"destinationType\":\"CIDR_BLOCK\",\"networkEntityId\":\"$IGW_OCID\"}]"
RT_JSON="$(oci_call oci network route-table create \
	--compartment-id "$COMPARTMENT" --vcn-id "$VCN_OCID" \
	--route-rules "$RT_RULES" --display-name "${DISPLAY_NAME}-rt" \
	--region "$REGION")" || exit 1
RT_OCID="$(json_get '["id"]' <<<"$RT_JSON")"
log "  ocid=${RT_OCID}"

log "→ security list (22<-${SSH_CIDR}, 80/443<-0.0.0.0/0)"
INGRESS="$(
	cat <<JSON
[
 {"source":"${SSH_CIDR}","sourceType":"CIDR_BLOCK","protocol":"6","isStateless":false,
  "description":"SSH solo desde la IP del operador",
  "tcpOptions":{"destinationPortRange":{"min":22,"max":22}}},
 {"source":"0.0.0.0/0","sourceType":"CIDR_BLOCK","protocol":"6","isStateless":false,
  "description":"HTTP (redirect + ACME HTTP-01)",
  "tcpOptions":{"destinationPortRange":{"min":80,"max":80}}},
 {"source":"0.0.0.0/0","sourceType":"CIDR_BLOCK","protocol":"6","isStateless":false,
  "description":"HTTPS",
  "tcpOptions":{"destinationPortRange":{"min":443,"max":443}}}
]
JSON
)"
EGRESS='[{"destination":"0.0.0.0/0","destinationType":"CIDR_BLOCK","protocol":"all","isStateless":false}]'
SL_JSON="$(oci_call oci network security-list create \
	--compartment-id "$COMPARTMENT" --vcn-id "$VCN_OCID" \
	--ingress-security-rules "$INGRESS" --egress-security-rules "$EGRESS" \
	--display-name "${DISPLAY_NAME}-sl" --region "$REGION")" || exit 1
SL_OCID="$(json_get '["id"]' <<<"$SL_JSON")"
log "  ocid=${SL_OCID}   <-- este es el --security-list-id de allow-my-ip.sh"

log "→ subnet ${SUBNET_CIDR}"
SUBNET_JSON="$(oci_call oci network subnet create \
	--compartment-id "$COMPARTMENT" --vcn-id "$VCN_OCID" --cidr-block "$SUBNET_CIDR" \
	--route-table-id "$RT_OCID" --security-list-ids "[\"$SL_OCID\"]" \
	--display-name "${DISPLAY_NAME}-subnet" --region "$REGION")" || exit 1
SUBNET_OCID="$(json_get '["id"]' <<<"$SUBNET_JSON")"
log "  ocid=${SUBNET_OCID}"

# ── imagen aarch64 más reciente ────────────────────────────────────────────
log "→ resolviendo imagen ${OS_NAME} ${OS_VERSION} aarch64"
IMG_JSON="$(oci_call oci compute image list \
	--compartment-id "$COMPARTMENT" --operating-system "$OS_NAME" \
	--operating-system-version "$OS_VERSION" --shape "$SHAPE" \
	--sort-by TIMECREATED --sort-order DESC --region "$REGION")" || exit 1
IMAGE_OCID="$(python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print(d[0]["id"])' <<<"$IMG_JSON")"
log "  ocid=${IMAGE_OCID}"

# ── 4. Loop de lanzamiento ─────────────────────────────────────────────────
SHAPE_CONFIG="{\"ocpus\":${SHAPE_OCPUS},\"memoryInGBs\":${SHAPE_MEM_GB}}"
attempt=0
INSTANCE_OCID=""
while :; do
	attempt=$((attempt + 1))
	log "→ launch intento #${attempt} (${SHAPE_OCPUS} OCPU / ${SHAPE_MEM_GB} GB)"
	set +e
	INST_JSON="$(oci_call oci compute instance launch \
		--compartment-id "$COMPARTMENT" --availability-domain "$AD" \
		--shape "$SHAPE" --shape-config "$SHAPE_CONFIG" \
		--image-id "$IMAGE_OCID" --subnet-id "$SUBNET_OCID" \
		--assign-public-ip false \
		--boot-volume-size-in-gbs "$BOOT_VOLUME_GB" \
		--display-name "$DISPLAY_NAME" \
		--ssh-authorized-keys-file "$PUBKEY_PATH" \
		--region "$REGION")"
	rc=$?
	set -e
	if [[ "$rc" -eq 0 ]]; then
		INSTANCE_OCID="$(json_get '["id"]' <<<"$INST_JSON")"
		log "  LANZADA ocid=${INSTANCE_OCID}"
		break
	elif [[ "$rc" -eq 75 ]]; then
		sleep_for=$((60 + RANDOM % 31 - 15))
		log "  sin capacidad; reintento en ${sleep_for}s"
		sleep "$sleep_for"
		continue
	else
		log "  fallo fatal; abortando (los prerequisitos quedan creados y reusables)"
		exit 1
	fi
done

log "== aprovisionamiento OK =="
cat <<DONE | tee -a "$LOG"

── recursos creados ─────────────────────────────────────────────
  RESERVED_IP     ${RESERVED_IP_ADDR}   ${RESERVED_IP_OCID}
  DATA_VOLUME     ${DATA_VOLUME_OCID}
  VCN             ${VCN_OCID}
  SECURITY_LIST   ${SL_OCID}
  SUBNET          ${SUBNET_OCID}
  INSTANCE        ${INSTANCE_OCID}
─────────────────────────────────────────────────────────────────
Siguiente:
  1. Asociar la IP reservada a la VNIC primaria de la instancia.
  2. Adjuntar el block volume (paravirtualized) y correr bootstrap-vm.sh.
  3. export MARKETPLACE_SSH_SECURITY_LIST_OCID=${SL_OCID}
DONE
