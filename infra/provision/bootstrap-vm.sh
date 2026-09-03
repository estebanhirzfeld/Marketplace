#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Prepara una VM Ubuntu 22.04 aarch64 recién creada para correr el marketplace.
#
# Instala: Node 20, corepack + pnpm, Docker CE + plugin compose, Caddy,
#          un swapfile de 4 GB, la entrada de /etc/fstab para el block volume,
#          y abre 80/443 en iptables (las imágenes de OCI vienen cerradas).
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
#   BLOCK_VOLUME_DEVICE  default /dev/oracleoci/oraclevdb (link estable de OCI)
#   SWAP_SIZE_GB         default 4
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
	echo "corré esto como root (sudo)" >&2
	exit 1
fi

BLOCK_VOLUME_DEVICE="${BLOCK_VOLUME_DEVICE:-/dev/oracleoci/oraclevdb}"
SWAP_SIZE_GB="${SWAP_SIZE_GB:-4}"
PGDATA_MOUNT="/mnt/pgdata"

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
corepack enable
corepack prepare pnpm@9.0.0 --activate
pnpm -v

step "Docker CE + compose plugin"
if ! command -v docker >/dev/null; then
	install -m 0755 -d /etc/apt/keyrings
	curl -fsSL https://download.docker.com/linux/ubuntu/gpg |
		gpg --dearmor -o /etc/apt/keyrings/docker.gpg
	chmod a+r /etc/apt/keyrings/docker.gpg
	echo "deb [arch=arm64 signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
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

step "swapfile de ${SWAP_SIZE_GB} GB"
if ! swapon --show | grep -q '/swapfile'; then
	if [[ ! -f /swapfile ]]; then
		fallocate -l "${SWAP_SIZE_GB}G" /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=$((SWAP_SIZE_GB * 1024))
		chmod 600 /swapfile
		mkswap /swapfile
	fi
	swapon /swapfile
fi
grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab

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
