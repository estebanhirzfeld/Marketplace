#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Prepara una VM Ubuntu 22.04 recién creada para correr el marketplace.
# Sirve para ambos objetivos: la micro x86_64 (VM.Standard.E2.1.Micro, el
# objetivo actual) y la A1 aarch64 (si se libera capacidad Ampere). La
# arquitectura del repo de Docker se deriva de `dpkg --print-architecture`.
#
# Instala: Node 20, corepack + pnpm, Docker CE + plugin compose, Caddy,
#          un swapfile de 2 GB con vm.swappiness bajo (colchón de emergencia
#          para la micro de 1 GB, no paginación de rutina), la entrada de
#          /etc/fstab para el block volume, y abre 80/443 en iptables (las
#          imágenes de OCI vienen cerradas).
#
# Es IDEMPOTENTE: se puede correr de nuevo sin romper nada.
#
# NO escribe NADA dentro de /srv/marketplace. El checkout lo hace el operador
# después (git clone), y de ahí en más manda deploy.sh. Si este script tocara
# el checkout, deploy.sh dejaría de ser función pura del ref.
#
# Uso (en la VM, como root o con sudo):
#   sudo BLOCK_VOLUME_DEVICE=/dev/sdb infra/provision/bootstrap-vm.sh
#
#   BLOCK_VOLUME_DEVICE  si no se pasa, se detecta: lo ya montado en
#                        /mnt/pgdata, o el unico disco entero sin montar que no
#                        es el de arranque (ver detect_data_device)
#   SWAP_SIZE_GB         default 2
#   SWAPPINESS           default 10  (rango de emergencia; el default del kernel es 60)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
	echo "corré esto como root (sudo)" >&2
	exit 1
fi

# ── detección del volumen de datos ──────────────────────────────────────────
# El nombre del enlace estable de OCI NO es predecible. En esta cuenta el
# volumen adjunto de 50 GB quedó como /dev/oracleoci/oraclevda -> /dev/sdb,
# mientras que las particiones del disco de arranque quedaron como oraclevda1,
# oraclevda14 y oraclevda15 -> /dev/sda*. O sea que el `oraclevdb` que se suele
# dar por sentado directamente no existe.
#
# En vez de adivinar el nombre, se busca el disco que cumple las tres
# condiciones del volumen de datos: es un disco entero (no una partición), no
# tiene nada montado encima, y no es el disco de arranque. Si aparece más de uno
# el script se planta y pide que se lo indiquen a mano, porque formatear el
# disco equivocado es irreversible.
PGDATA_MOUNT="/mnt/pgdata"

detect_data_device() {
	# Si ya está montado de una corrida anterior, ese es el volumen y no hay
	# nada que buscar. Sin este caso el script deja de ser idempotente: el
	# filtro de "disco sin montar" descarta justamente el que ya preparamos.
	local ya_montado
	ya_montado="$(findmnt -no SOURCE "$PGDATA_MOUNT" 2>/dev/null || true)"
	if [[ -n "$ya_montado" ]]; then
		printf '%s' "$ya_montado"
		return 0
	fi

	local candidatos=()
	local root_disk
	root_disk="$(lsblk -no PKNAME "$(findmnt -no SOURCE /)" 2>/dev/null || true)"
	local name type
	# El tercer campo (mountpoint) se lee para consumirlo, no se usa acá:
	# el chequeo de montaje se hace abajo sobre el disco entero.
	while read -r name type _; do
		[[ "$type" == "disk" ]] || continue
		[[ "$name" == "$root_disk" ]] && continue
		# Descarta el disco si él o alguna de sus particiones está montado.
		lsblk -no MOUNTPOINT "/dev/$name" | grep -q . && continue
		candidatos+=("/dev/$name")
	done < <(lsblk -rno NAME,TYPE,MOUNTPOINT)

	case "${#candidatos[@]}" in
	1) printf '%s' "${candidatos[0]}" ;;
	0) return 1 ;;
	*)
		echo "hay ${#candidatos[@]} discos candidatos (${candidatos[*]}); indicá cuál con BLOCK_VOLUME_DEVICE=" >&2
		return 2
		;;
	esac
}

if [[ -z "${BLOCK_VOLUME_DEVICE:-}" ]]; then
	BLOCK_VOLUME_DEVICE="$(detect_data_device)" || {
		echo "no se pudo determinar el volumen de datos; pasalo con BLOCK_VOLUME_DEVICE=" >&2
		exit 1
	}
	echo "→ volumen de datos detectado: ${BLOCK_VOLUME_DEVICE}"
fi
SWAP_SIZE_GB="${SWAP_SIZE_GB:-2}"
SWAPPINESS="${SWAPPINESS:-10}"
SYSCTL_FILE="/etc/sysctl.d/99-marketplace-swap.conf"

step() { echo; echo "── $* ──────────────────────────────────────────────"; }

step "apt update + paquetes base"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl gnupg lsb-release git ufw

step "Node 20 (nodesource)"
if ! command -v node >/dev/null || [[ "$(node -v)" != v20.* ]]; then
	curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
	apt-get install -y nodejs
fi
node -v

step "corepack + pnpm"
# Corepack, invocado FUERA de un proyecto, ignora lo que se haya preparado y
# resuelve a la última versión de pnpm. En esta máquina eso bajó pnpm 11, que
# exige Node >= 22.13 y muere en Node 20 buscando `node:sqlite`. Dentro del
# checkout no pasa, porque el package.json raíz declara pnpm@9.0.0 — pero
# depender de eso deja un `pnpm` roto para cualquiera que lo tipee en otro lado.
export COREPACK_DEFAULT_TO_LATEST=0
grep -q '^COREPACK_DEFAULT_TO_LATEST=' /etc/environment ||
	echo 'COREPACK_DEFAULT_TO_LATEST=0' >>/etc/environment

corepack enable
corepack prepare pnpm@9.0.0 --activate

# `pnpm -v` a secas no verifica nada útil: lo que importa es qué versión resuelve
# dentro de un proyecto, que es donde corre el deploy. Se comprueba con un
# package.json descartable que declara la misma versión que el repo.
PNPM_ESPERADO="9.0.0"
PROBE="$(mktemp -d)"
printf '{"name":"probe","packageManager":"pnpm@%s"}' "$PNPM_ESPERADO" >"${PROBE}/package.json"
PNPM_REAL="$(cd "$PROBE" && pnpm -v 2>/dev/null | tail -1 || true)"
rm -rf "$PROBE"
if [[ "$PNPM_REAL" != "$PNPM_ESPERADO" ]]; then
	echo "  pnpm dentro de un proyecto resolvió '${PNPM_REAL:-nada}', se esperaba ${PNPM_ESPERADO}" >&2
	exit 1
fi
echo "  pnpm ${PNPM_REAL} (dentro de un proyecto)"

step "Docker CE + compose plugin"
if ! command -v docker >/dev/null; then
	install -m 0755 -d /etc/apt/keyrings
	curl -fsSL https://download.docker.com/linux/ubuntu/gpg |
		gpg --dearmor -o /etc/apt/keyrings/docker.gpg
	chmod a+r /etc/apt/keyrings/docker.gpg
	echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
		>/etc/apt/sources.list.d/docker.list
	apt-get update -y
	apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker
docker compose version

step "Caddy (repo oficial)"
if ! command -v caddy >/dev/null; then
	curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key |
		gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
	curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt |
		tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
	apt-get update -y
	apt-get install -y caddy
fi
systemctl enable caddy

step "swapfile de ${SWAP_SIZE_GB} GB (swappiness ${SWAPPINESS})"
# Colchón de emergencia para la micro de 1 GB, NO paginación de rutina. Con
# swappiness 10 el kernel solo recurre al swap bajo presión real de memoria.
# Idempotente: si ya hay un /swapfile activo no se crea otro ni se cambia su
# tamaño (correr esto dos veces es un no-op).
if ! swapon --show | grep -q '/swapfile'; then
	if [[ ! -f /swapfile ]]; then
		fallocate -l "${SWAP_SIZE_GB}G" /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=$((SWAP_SIZE_GB * 1024))
		chmod 600 /swapfile
		mkswap /swapfile
	fi
	swapon /swapfile
else
	echo "  /swapfile ya está activo: $(swapon --show | grep /swapfile)"
fi
grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab

# swappiness + vfs_cache_pressure persistidos. Se reescribe el archivo entero
# (no se acumulan líneas al re-correr) y se aplica en caliente.
cat >"$SYSCTL_FILE" <<EOF
# marketplace — la micro tiene 1 GB; el swap es de emergencia, no de rutina.
vm.swappiness=${SWAPPINESS}
vm.vfs_cache_pressure=50
EOF
sysctl -p "$SYSCTL_FILE" >/dev/null

step "block volume -> ${PGDATA_MOUNT}"
if [[ -b "$BLOCK_VOLUME_DEVICE" ]]; then
	if ! blkid "$BLOCK_VOLUME_DEVICE" >/dev/null 2>&1; then
		echo "  formateando ${BLOCK_VOLUME_DEVICE} como ext4 (vacío)"
		mkfs.ext4 -L pgdata "$BLOCK_VOLUME_DEVICE"
	fi
	UUID="$(blkid -s UUID -o value "$BLOCK_VOLUME_DEVICE")"
	mkdir -p "$PGDATA_MOUNT"
	# _netdev,nofail: el volumen es de red y no debe frenar el boot si falta.
	if ! grep -q "$UUID" /etc/fstab; then
		echo "UUID=${UUID} ${PGDATA_MOUNT} ext4 defaults,_netdev,nofail 0 2" >>/etc/fstab
	fi
	mountpoint -q "$PGDATA_MOUNT" || mount "$PGDATA_MOUNT"
	mkdir -p "${PGDATA_MOUNT}/backups"
	echo "  montado: $(df -h "$PGDATA_MOUNT" | tail -1)"
else
	echo "  AVISO: ${BLOCK_VOLUME_DEVICE} no es un dispositivo de bloques."
	echo "  Adjuntá el block volume desde la consola de OCI y volvé a correr esto."
fi

step "firewall del host: abrir 80/443, mantener 22"
# Las imágenes de OCI traen iptables restrictivo en /etc/iptables/rules.v4.
# ufw es más simple de auditar y persiste solo.
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status verbose

step "listo"
cat <<'NEXT'
bootstrap OK. Siguiente (operador):
  1. git clone <repo> /srv/marketplace  &&  cd /srv/marketplace
     git checkout fase-5-frontend-y-avisos
  2. Crear /etc/marketplace/{api,web,db}.env  (0600) y packages/db/.env  (ver infra/README.md)
  3. docker compose -f docker-compose.prod.yml up -d
  4. Instalar las units de systemd y el Caddyfile (ver infra/README.md)
  5. ./deploy.sh fase-5-frontend-y-avisos
NEXT
