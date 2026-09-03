# Despliegue — pasos del operador

Todo lo que sigue lo corre **una persona**, no un asistente: crea recursos en la
cuenta de Oracle Cloud y escribe archivos `.env` (el tooling del asistente tiene
ambas cosas bloqueadas). Los pasos van en orden. Los scripts que se mencionan
están en `infra/` y `deploy.sh` / `rollback.sh` en la raíz.

Valores fijos de este despliegue:

| Cosa | Valor |
|---|---|
| Hostname | `traspaso.forzalabs.online` |
| Rama a desplegar | `fase-5-frontend-y-avisos` |
| Región / AD | `sa-saopaulo-1` / `ofEW:SA-SAOPAULO-1-AD-1` |
| Shape | `VM.Standard.A1.Flex`, 2 OCPU / 12 GB (palanca `--small` = 1/6) |
| IP SSH permitida | `181.47.21.233/32` (solo esa; **no** `0.0.0.0/0`) |
| Base de datos | `marketplace` (**no** `marketplace_dev`) |
| MercadoPago | activo | Google/YouTube | apagado (rutas 503 por diseño) |

> **La VCN nueva es más restrictiva a propósito.** `vcn-20260815-0137` (proyecto
> `agency`) permite SSH desde cualquier lado. La VCN de este despliegue abre el
> 22 solo a `181.47.21.233/32`. Si esa IP rota y te quedás afuera, ver
> [Recuperación de lockout SSH](#recuperación-de-lockout-ssh) — no hace falta SSH
> para arreglarlo.

---

## 1. Credenciales de MercadoPago (tarea 6.1)

Desde el panel de MercadoPago → tu aplicación, obtené:

- `MERCADOPAGO_ACCESS_TOKEN` (Access Token de producción)
- `MERCADOPAGO_WEBHOOK_SECRET` (Configuración → Webhooks → clave secreta)

Guardalos para el paso 4. No los pegues en ningún archivo versionado.

---

## 2. Baseline de los vecinos + aprovisionamiento (tarea 6.2)

Primero, registrá el estado actual de `agency` y `agency-demo` para poder probar
después que no se tocaron:

```bash
oci compute instance list \
  --compartment-id "$MARKETPLACE_COMPARTMENT_OCID" \
  --query 'data[?contains("display-name", `agency`)].{name:"display-name",id:"id",state:"lifecycle-state"}' \
  --output table | tee infra/provision/neighbors-baseline.txt
```

Después, aprovisioná (creá antes la config de OCI en `~/.oci/config`):

```bash
export MARKETPLACE_COMPARTMENT_OCID=ocid1.compartment.oc1..xxxxx
export MARKETPLACE_SSH_PUBKEY=$HOME/.ssh/id_ed25519.pub

# Ensayo: imprime el plan, no crea nada
infra/provision/launch-instance.sh --dry-run

# De verdad:
infra/provision/launch-instance.sh
```

Al terminar, `infra/provision/launch.log` tiene los OCID de todo. Anotá el de la
security list:

```bash
export MARKETPLACE_SSH_SECURITY_LIST_OCID=ocid1.securitylist.oc1..xxxxx
```

Asociá la IP reservada a la VNIC primaria de la instancia (desde la consola de
OCI o con `oci network vnic ...`).

---

## 3. Bootstrap de la VM + block volume (tarea 6.3)

Adjuntá el block volume a la instancia (paravirtualized) desde la consola.
Después, por SSH a la VM:

```bash
# en la VM
sudo BLOCK_VOLUME_DEVICE=/dev/oracleoci/oraclevdb bash infra/provision/bootstrap-vm.sh
```

(El repo todavía no está clonado; copiá el script con `scp` o cloná el repo
primero sin tocar `/srv/marketplace` y corré el script desde ahí.)

Instala Node 20, pnpm, Docker, Caddy, swap de 4 GB, la entrada de `/etc/fstab`
del volumen y abre 80/443 en ufw. Es idempotente.

---

## 4. Checkout y archivos de secretos (tarea 6.4)

```bash
# en la VM
sudo git clone <URL-del-repo> /srv/marketplace
cd /srv/marketplace
sudo git checkout fase-5-frontend-y-avisos
```

Generá los secretos frescos (no reuses los de dev):

```bash
JWT_SECRET=$(openssl rand -base64 48)
PG_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=')
DATABASE_URL="postgresql://marketplace:${PG_PASSWORD}@127.0.0.1:5434/marketplace"
```

Creá los cuatro archivos (0600, root). **Los dos `DATABASE_URL` deben ser
idénticos y nombrar `marketplace`.**

```bash
sudo mkdir -p /etc/marketplace

# ── Postgres (lo lee docker-compose.prod.yml) ──
printf 'POSTGRES_PASSWORD=%s\n' "$PG_PASSWORD" | sudo tee /etc/marketplace/db.env >/dev/null

# ── API ──
sudo tee /etc/marketplace/api.env >/dev/null <<EOF
NODE_ENV=production
PORT=3001
JWT_SECRET=${JWT_SECRET}
DATABASE_URL=${DATABASE_URL}
MERCADOPAGO_ACCESS_TOKEN=<pegar>
MERCADOPAGO_WEBHOOK_SECRET=<pegar>
MERCADOPAGO_BACK_URL=https://traspaso.forzalabs.online/operaciones
MERCADOPAGO_NOTIFICATION_URL=https://traspaso.forzalabs.online/webhooks/mercadopago
EOF

# ── Web ──
sudo tee /etc/marketplace/web.env >/dev/null <<'EOF'
NODE_ENV=production
API_URL=http://127.0.0.1:3001
NEXT_PUBLIC_APP_URL=https://traspaso.forzalabs.online
SEARCH_INDEXING=true
EOF

# ── Prisma dentro del checkout (lo lee prisma.config.ts) ──
printf 'DATABASE_URL=%s\n' "$DATABASE_URL" | sudo tee /srv/marketplace/packages/db/.env >/dev/null

sudo chmod 600 /etc/marketplace/*.env /srv/marketplace/packages/db/.env
```

Editá `/etc/marketplace/api.env` y pegá los dos valores de MercadoPago del paso 1.

`YOUTUBE_*` se deja sin definir: las rutas de verificación devuelven 503 por
diseño.

La referencia completa de variables está en `env.example` (raíz del repo).

---

## 5. Registro DNS (tarea 6.5)

Creá un registro **A**: `traspaso.forzalabs.online` → la IP reservada del paso 2.
Esperá a que propague (`dig +short traspaso.forzalabs.online`).

---

## 6. Levantar Postgres + servicios (tarea 6.6)

```bash
# en la VM, en /srv/marketplace
sudo docker compose -f docker-compose.prod.yml up -d
sudo docker compose -f docker-compose.prod.yml ps   # db healthy

# systemd
sudo cp infra/systemd/marketplace-*.service infra/systemd/marketplace-*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now marketplace-backup.timer
# marketplace-api y marketplace-web los arranca deploy.sh; habilitalos para el boot:
sudo systemctl enable marketplace-api marketplace-web

# Caddy
sudo cp infra/caddy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

---

## 7. Primer deploy (tarea 6.7)

```bash
# en la VM, en /srv/marketplace
sudo ./deploy.sh fase-5-frontend-y-avisos
```

Corre install → generate → typecheck → migrate deploy → build API → build web →
**smoke contra Postgres** → restart → verificación. Si el smoke falla, los
servicios viejos siguen arriba.

---

## 8. Seed inicial, una sola vez (tarea 6.8)

```bash
# en la VM, en /srv/marketplace
sudo -E DATABASE_URL="$(sudo grep -h '^DATABASE_URL=' /srv/marketplace/packages/db/.env | cut -d= -f2-)" \
  pnpm --filter @marketplace/db db:seed
```

Deja las cuentas demo. **No** se re-corre en cada deploy.

---

## 9. Simulacro de restore (tarea 6.9)

Probá que un backup sirve, antes de necesitarlo:

```bash
# en la VM, en /srv/marketplace
sudo infra/scripts/backup-db.sh
LATEST=$(ls -1t /mnt/pgdata/backups/*.sql.gz | head -1)
sudo infra/scripts/restore-db.sh "$LATEST" --db marketplace_restore_check --yes
# compará los conteos de filas que imprime con la base real
sudo docker compose -f docker-compose.prod.yml exec -T db \
  psql -U marketplace -c "DROP DATABASE marketplace_restore_check;"
```

---

## Recuperación de lockout SSH

Si SSH deja de entrar porque tu IP cambió, desde **cualquier** máquina con
`~/.oci/config` configurado:

```bash
infra/scripts/allow-my-ip.sh --security-list-id "$MARKETPLACE_SSH_SECURITY_LIST_OCID" --dry-run
infra/scripts/allow-my-ip.sh --security-list-id "$MARKETPLACE_SSH_SECURITY_LIST_OCID"
```

Detecta tu IP pública actual y **reescribe** las reglas de ingreso al conjunto
canónico: 22 desde tu IP `/32`, 80 y 443 desde `0.0.0.0/0`. El OCID de la
security list está en `infra/provision/launch.log`.

---

## Redeploy y rollback

```bash
sudo ./deploy.sh fase-5-frontend-y-avisos      # redeploy (idempotente)
sudo ./rollback.sh last-good                   # volver al último SHA que sirvió
sudo ./rollback.sh <sha>                       # volver a un commit puntual
```

Rollback repite todos los pasos **menos la migración**. Si el problema es una
migración: primero `infra/scripts/restore-db.sh <dump>`, después `rollback.sh`.

---

## Teardown

```bash
oci compute instance terminate --instance-id <ocid>   # de launch.log
oci bv volume delete --volume-id <ocid>
oci network vcn delete --vcn-id <ocid>                 # borrar antes subnet/igw/rt/sl
# quitar el registro DNS A
```

Impacto cero sobre `agency` / `agency-demo`: nada fuera de la VCN nueva se toca.
