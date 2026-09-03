# Fase 12 — Despliegue

> **Estado**: 🚧 En curso
> **Fecha**: Septiembre 2026
> **Objetivo**: Que la aplicación sea desplegable de forma continua y accesible por HTTPS desde una VM de Oracle Cloud, sin tocar los proyectos vecinos.

Este documento se completa por partes, siguiendo el orden de los PRs del cambio
`deploy-vps-oracle`. La primera entrega (PR1) cubrió el **artefacto de producción
de la API** y el **aviso de demo** del frontend. La segunda (PR2) cubre la
**infraestructura**: configuración de producción, aprovisionamiento en OCI y los
scripts de deploy/redeploy/rollback.

> **Reorientación (PR3): el objetivo dejó de ser una VM Ampere ARM.** La
> capacidad de `VM.Standard.A1.Flex` en `sa-saopaulo-1` está agotada a nivel de
> host físico (medido: 44 intentos de lanzamiento en ~2 h, con quota libre,
> siempre `"Out of host capacity"`). El despliegue se reorienta a una
> `VM.Standard.E2.1.Micro` **x86_64** de 1 GB. El camino A1 se conserva
> seleccionable (`launch-instance.sh` sin flags) por si se libera capacidad.
> Detalle completo en la **Decisión 11**.

---

## El artefacto de producción de la API

### El defecto

`apps/api` no podía arrancar en producción. `pnpm --filter @marketplace/api start`
ejecutaba `node dist/server.js` sobre la salida cruda de `tsc`, y esa salida no
es ejecutable por Node a secas:

1. `dist/server.js` emitía `from './app'` sin extensión. Es legal bajo
   `moduleResolution: "Bundler"` —el modo que declara `tsconfig.base.json`— pero
   ilegal bajo la resolución de módulos ESM de Node.
2. `dist/container.js` emitía `from '@marketplace/domain/src/use-cases/...'` y
   `from '@marketplace/db'`, que resuelven a archivos `.ts`. Los paquetes
   `packages/db` y `packages/api-contract` declaran `"main": "src/index.ts"` y
   entregan TypeScript a propósito.

El fondo del problema: `tsconfig.base.json` declara `"module": "ESNext"` +
`"moduleResolution": "Bundler"`. Eso es un contrato — *estas fuentes las consume
un bundler, no Node directamente*. `apps/web` lo respeta porque Next bundlea.
`apps/api` lo rompía al alimentar `tsc` directo a `node`.

### La decisión: bundlear `apps/api` a un único archivo ESM, sin tocar ninguna fuente

Se agrega `tsup` (encima de esbuild) como única dependencia nueva y un
`apps/api/tsup.config.ts`. Cero cambios en código fuente: los 255+ imports
relativos del dominio y los 150+ especificadores `@marketplace/*/src/` quedan
intactos. Solo `apps/api` se bundlea; el resto del monorepo se sigue
desarrollando y consumiendo exactamente igual, y la convención de imports
profundos sin barrel de `CLAUDE.md` **se preserva** (ningún archivo fuente
cambia; el bundle es un output que nadie importa).

Cambios exactos:

| Archivo | Cambio |
|---|---|
| `apps/api/tsup.config.ts` | Nuevo. `format: ['esm']`, extensión `.mjs`, banner `createRequire`, `target: 'node20'`, paquetes de workspace inlineados (`noExternal`), deps npm reales externas. |
| `apps/api/package.json` | `build` → `tsup`; `start` → `node dist/server.mjs`; nuevo `typecheck` → `tsc --noEmit`; `tsup` como devDependency; `pg` y `@prisma/adapter-pg` promovidos a dependencias directas (ver abajo). **No se agrega `"type": "module"`.** |
| `apps/api/tsconfig.json` | `noEmit: true`; se quitan `outDir`/`rootDir`. Pasa a ser la config del typecheck; el emit lo hace tsup. |
| `turbo.json` | Nueva tarea `typecheck` cacheable, `dependsOn: ["^db:generate"]`. |

### Por qué ESM, y por qué el banner no es opcional — tres configuraciones, medidas

| Config | Build | Runtime | Causa |
|---|---|---|---|
| `--format=cjs` | **Compila** (7,1 MB) | **Muere antes de que Fastify arranque**: `TypeError [ERR_INVALID_ARG_TYPE]` en `fileURLToPath` | El cliente Prisma 7 hace `path.dirname(fileURLToPath(import.meta.url))`. La salida CJS vacía `import.meta`, así que `fileURLToPath(undefined)` explota. |
| `--format=esm` | Compila | **Muere**: `Error: Dynamic require of "fs" is not supported`, desde `dotenv` | Dependencias CommonJS en el grafo llaman a `require`; la salida ESM de esbuild no provee ese binding. |
| `--format=esm` + banner `createRequire` | Compila | **Arranca, sirve y consulta.** `GET /health` → 200; `POST /auth/login` → 403 del dominio tras un ida y vuelta real contra Postgres. | El banner reconstruye un `require` funcional desde `import.meta.url`, satisface las deps CJS, y `import.meta` sigue siendo real para Prisma. |

**La ruta CJS es una trampa precisamente porque el build termina en 0.** Un
`tsup --format cjs` compila, emite un artefacto de 7,1 MB que parece correcto, y
muere al primer arranque. Cualquier criterio de aceptación que se detenga en "el
build pasó" desplegaría un artefacto muerto — que es exactamente la clase de
falla que este cambio existe para eliminar.

**Por eso el criterio de aceptación es "el bundle arranca y responde una consulta
real", nunca "el build terminó en 0".** Se verifica con `apps/api/scripts/smoke.sh`:
construye, arranca el `.mjs` en un puerto libre contra el Postgres de
desarrollo, comprueba `GET /health` → 200 y `POST /auth/login` con un usuario
inexistente → **403 `{"code":"FORBIDDEN","message":"Email o contraseña
incorrectos."}`**. Ese 403 es el error propio del dominio y prueba la cadena
completa: bundle → Prisma → `pg` → Postgres → caso de uso.

### `dist/server.mjs` en vez de `"type": "module"`

Ambos hacen ESM la salida. Se elige `.mjs` porque:

- **Radio de impacto.** Agregar `"type": "module"` a `apps/api/package.json`
  reinterpreta *todos* los `.js` del paquete, cambiando la resolución para la
  ruta de vitest (`apps/api/tests/*`) y la de `tsx` en desarrollo — para
  beneficio de un solo archivo emitido. `.mjs` es una declaración por archivo y
  no toca nada más.
- **Artefacto autodescriptivo.** `dist/server.mjs` declara su propio sistema de
  módulos, así que `node dist/server.mjs` se comporta igual sin importar qué diga
  cualquier `package.json` por encima.

### Por qué un bundle de un solo archivo funciona acá: el driver adapter

`packages/db/src/client.ts` construye el cliente sobre un **driver adapter**
(`@prisma/adapter-pg`) encima de un `Pool` de `pg` puro JavaScript. Con un driver
adapter, Prisma **no carga `libquery_engine-*.so.node` en runtime**: la ejecución
de queries sale por `pg`, que es JS puro y bundlea limpio. El compilador de
queries de Prisma 7 es un módulo WASM que tsup inlinea como chunk.

Consecuencias:

- No hace falta la variable `PRISMA_QUERY_ENGINE_LIBRARY` ni un paso de copia de
  engine en el build: serían mitigación de una falla que no ocurre.
- El engine sí importa para el **CLI** de Prisma (`prisma generate`,
  `prisma migrate deploy`), pero eso corre desde el checkout con `node_modules`
  presente, nunca desde el bundle.

### Desviación respecto del diseño: `pg` y `@prisma/adapter-pg` como deps directas

El diseño listaba `pg` y `@prisma/adapter-pg` como `external` (quedan en
`node_modules`), pero eran dependencias solo de `packages/db`. pnpm no las eleva,
así que `apps/api/dist/server.mjs` no las podía resolver en runtime
(`ERR_MODULE_NOT_FOUND`). Se promovieron a dependencias directas de
`@marketplace/api`, que es el composition root donde efectivamente se cablean los
repositorios Prisma. Es el cambio mínimo coherente con la intención del diseño
(esas deps quedan en `node_modules`, solo que en el correcto).

### Prueba

`bash apps/api/scripts/smoke.sh` sobre `main` de hoy: **falla** (el build `tsc`
emite `server.js`, no `.mjs`). Con los cambios de esta entrega: **pasa**.

```
→ build
→ boot en :3099
  /health -> {"status":"ok"}
  POST /auth/login -> 403 {"code":"FORBIDDEN","message":"Email o contraseña incorrectos."}
SMOKE OK
```

---

# Infraestructura (PR2)

La topología es una sola VM Ampere A1 en `sa-saopaulo-1`, en su propia VCN, con
un checkout completo del repo en `/srv/marketplace`. Cuatro procesos de larga
vida:

```
Internet ──443──▶ Caddy ──▶ Next :3000 ──▶ Fastify :3001 ──▶ Postgres :5434
                            (solo server-side)   (loopback)     (/mnt/pgdata,
                                                              block volume)
```

Los builds corren en la VM. Un `deploy.sh` idempotente y un `rollback.sh`. Los
proyectos vecinos `agency` (163.176.174.23) y `agency-demo`
(`demo.forzalabs.online`) **no se tocan**: nada fuera de la VCN nueva se lee ni
se referencia, y todo lo que se crea se selecciona por el OCID recién generado.

## Decisión 2 — Instancia, imagen, almacenamiento

| Ítem | Elección | Motivo |
|---|---|---|
| Shape | `VM.Standard.A1.Flex`, 2 OCPU / 12 GB | Todo el cupo ARM gratis en una sola VM. Los picos de build importan más que la redundancia. Palanca `--small` (1 OCPU / 6 GB) si A1 está saturado. |
| Imagen | Canonical Ubuntu 22.04 LTS **aarch64** | glibc 2.35 + openssl 3.0.x = el engine `linux-arm64-openssl-3.0.x` que necesita el CLI de Prisma para migrar. musl queda descartado. |
| Disco de arranque | 50 GB (default) | 50 boot + 20 datos = 70 GB contra 103 GB libres de los 200 del cupo. |
| Volumen de datos | **Block volume separado de 20 GB**, ext4, montado en `/mnt/pgdata`, `_netdev,nofail` en `/etc/fstab` | Los datos del disco de arranque mueren con la instancia. Un volumen separado sobrevive a terminarla y recrearla — el punto de todo el ejercicio. |
| Swap | Archivo de 4 GB en el disco de arranque | Seguro para que `next build` conviva con Postgres y dos procesos Node. |
| IP pública | **Reservada**, no efímera | El DNS sobrevive al reemplazo de la instancia. Se crea antes que la VM, así que un lanzamiento fallido no la pierde. |

## Decisión 3 — Topología de red

VCN nueva `10.1.0.0/16`, subnet pública `10.1.0.0/24`, Internet Gateway, ruta
`0.0.0.0/0 → IGW`. La VCN de `agency` (`vcn-20260815-0137`, `10.0.0.0/16`) no se
toca, no se peerea, no se extiende. Una app estudiantil expuesta a internet no
puede quedar a una edición de security list de hosts de otro proyecto.

- **Ingress**: 22/tcp desde `181.47.21.233/32` (la IP residencial del operador,
  **nunca** `0.0.0.0/0`); 80/tcp y 443/tcp desde `0.0.0.0/0`. Nada más.
- La security list de esta subnet es la autoridad: la subnet tiene exactamente
  una instancia. `bootstrap-vm.sh` además refleja 22/80/443 en el firewall del
  host (ufw), porque las imágenes de OCI vienen con iptables restrictivo.
- **Exposición de puertos**: públicos 80, 443 (Caddy) y 22 (restringido por
  origen). Solo loopback: 3000 (Next), 3001 (Fastify), 5434 (Postgres). El
  navegador nunca llama a Fastify directo — todo el tráfico de API pasa por el
  código server-side de Next. La única excepción es el webhook de MercadoPago
  (Decisión 6).

## Decisión 4 — Aprovisionamiento y falla de capacidad

`infra/provision/launch-instance.sh` corre `oci compute instance launch` dentro
de un loop de reintento.

- **Reintenta** solo ante `Out of host capacity` — duerme 60 s ± 15 s de jitter,
  sin límite, logueando número de intento y código de error de OCI a
  `infra/provision/launch.log`.
- **Falla rápido, sin reintentar, ante cualquier 4xx**: shape mala, quota
  agotada, auth fallida, OCID de subnet malformado. Un loop que reintenta un
  error de configuración para siempre es peor que no tener loop.
- **Orden de creación**: IP reservada → block volume → VCN/subnet/IGW/SL → *luego*
  el loop de la instancia. Cada prerequisito es independiente de la instancia,
  así que N lanzamientos fallidos no cuestan nada y un éxito reengancha todo.
- **Palanca de capacidad**: si el loop nunca converge, relanzar con `--small`
  (1 OCPU / 6 GB). Consecuencia: `next build` se mueve fuera de la VM (Decisión
  10); se avisa al operador en vez de degradar en silencio.
- Shell imperativo, no Terraform: una VM, provisionada una vez, y un script
  legible de ~200 líneas es mejor artefacto de tesis que un archivo de estado
  que además hay que gestionar.

## Decisión 5 — Supervisión de procesos, orden de arranque, health

Tres units en `infra/systemd/`:

| Unit | ExecStart | Notas |
|---|---|---|
| `marketplace-api.service` | `/usr/bin/node /srv/marketplace/apps/api/dist/server.mjs` | `WorkingDirectory=/srv/marketplace/apps/api`, `EnvironmentFile=/etc/marketplace/api.env`, `Restart=always`, `RestartSec=5`, `After=network-online.target docker.service` |
| `marketplace-web.service` | `apps/web/node_modules/.bin/next start -p 3000` | `EnvironmentFile=/etc/marketplace/web.env`, `Restart=always`, `After=marketplace-api.service` |
| `marketplace-backup.timer` + `.service` | `infra/scripts/backup-db.sh` | `pg_dump` diario, ver Decisión 7 |

Postgres **no** es una unit de systemd: `docker-compose.prod.yml` declara
`restart: unless-stopped` y `docker.service` está habilitado, lo que da
persistencia al reboot con una pieza móvil menos.

Orden de arranque: `docker` → contenedor de Postgres → `marketplace-api` →
`marketplace-web`. Caddy es independiente y puede arrancar en cualquier momento
(devuelve 502 hasta que Next esté arriba, que es el comportamiento correcto).

**Límite de `/health`**, ahora que se usa como evidencia: `apps/api/src/app.ts`
expone `GET /health` que devuelve `{"status":"ok"}` **sin tocar Postgres**.
Prueba que el proceso está vivo y ruteando, no que la base funciona. Por eso el
smoke test del deploy (Decisión 9) lee de la base.

> **Limitación conocida**: `server.ts` hace `listen` en `0.0.0.0`, no en
> `127.0.0.1`. En la VM el puerto 3001 igual queda inalcanzable desde internet
> porque ni la security list ni ufw lo abren, pero la defensa es el firewall, no
> el bind. Endurecerlo (bindear loopback en `server.ts`) es un cambio de fuente
> fuera del alcance de infra y queda anotado.

## Decisión 6 — Reverse proxy y TLS

Caddy 2 del repo apt oficial, `infra/caddy/Caddyfile`:

- TLS automático por Let's Encrypt (HTTP-01, el puerto 80 ya está abierto para el
  redirect). Caddy renueva solo. Redirect HTTP → HTTPS por defecto.
- **TLS es obligatorio, no cosmético**: `apps/web/src/lib/session.ts` marca la
  cookie de sesión `Secure` bajo `NODE_ENV=production`, y el navegador la
  descarta en claro — el login fallaría sin error visible.
- **Sin `noindex` en Caddy**: el indexado se gobierna desde `apps/web` con la
  variable `SEARCH_INDEXING` (`apps/web/src/app/robots.ts`, `force-dynamic`).
  Cambiarla no requiere rebuild. Esto mueve la decisión 6 del diseño (que ponía
  un `X-Robots-Tag` en Caddy) al lugar donde la puso PR1.
- **Excepción localhost-only — el webhook de MercadoPago.** El path
  `/webhooks/mercadopago` se proxya **directo a Fastify** (`127.0.0.1:3001`); todo
  el resto va a Next. Es la única ruta pública que no pasa por Next, y es
  legítima: la llama MercadoPago (no una persona) y del cuerpo solo se toma el
  ID del pago, que después se consulta contra la pasarela con nuestras
  credenciales. Un aviso falsificado no puede dar por pagada una operación.
- **Sin basic auth, sin sala de espera** (decisión del usuario). El aviso de demo
  es UI, no configuración de proxy.

## Decisión 7 — Base de datos, migraciones, durabilidad

- `docker-compose.prod.yml` (nuevo, separado del de dev): `postgres:16`,
  `ports: ["127.0.0.1:5434:5432"]`, `volumes: ["/mnt/pgdata:/var/lib/postgresql/data"]`,
  `restart: unless-stopped`, password desde `/etc/marketplace/db.env`, base
  **`marketplace`**. `docker-compose.yml` se deja intacto: dos archivos, cada uno
  honesto con su fin, es mejor que uno que es un compromiso.
- **El nombre de la base es un peligro real de deploy.** Dev usa
  `marketplace_dev`; producción usa `marketplace`. Un desajuste aparece recién en
  la primera query como `P1003 database "..." does not exist` — pasa `/health`
  limpio. Por eso el smoke test lee de la base en vez de confiar en el health.
- **Migraciones**: `deploy.sh` corre `cd packages/db && pnpm exec prisma migrate
  deploy`. El cwd importa — `packages/db/prisma.config.ts` hace `import
  'dotenv/config'` y lee `env("DATABASE_URL")` relativo a ese directorio. **Nunca
  `prisma db push`** (destructivo, sin historial). 17 migraciones aplicadas.
- **Seed**: una vez, a mano, después del primer deploy exitoso. No es parte de
  `deploy.sh` — re-seedear en cada redeploy borraría lo que la comisión haya
  hecho en el sitio.
- **Durabilidad**: el directorio de datos vive en el block volume, así que
  terminar y recrear la instancia no pierde nada. `backup-db.sh` hace `pg_dump |
  gzip` diario a `/mnt/pgdata/backups/`, guarda 7. `restore-db.sh <dump>` es el
  inverso y **debe probarse una vez** antes de la defensa — un restore no probado
  no es un backup.

## Decisión 8 — Configuración y entrega de secretos

El repo es público y el tooling del asistente tiene bloqueado todo archivo
`.env`, así que **cada paso con secretos lo ejecuta el operador**, con comandos
verbatim en `infra/README.md`.

- El inventario de variables versionado vive como `env.example` (sin el punto
  inicial, porque el tooling bloquea `.env*`). No lo consume ningún proceso: es
  documentación. 15 variables, solo claves.
- Tres archivos en la VM, `chmod 600`, `root:root`:
  - `/etc/marketplace/api.env` → `EnvironmentFile` de `marketplace-api`
  - `/etc/marketplace/web.env` → `EnvironmentFile` de `marketplace-web`
  - `/srv/marketplace/packages/db/.env` → lo lee `prisma.config.ts` (dotenv desde
    ese cwd); ya está gitignoreado
- **Los dos `DATABASE_URL` (api.env y packages/db/.env) tienen que coincidir y
  nombrar `marketplace`, no `marketplace_dev`.** Es el error de copy-paste más
  probable y falla tarde, pasado `/health`.
- Ningún secreto entra a git. `JWT_SECRET` y el password de Postgres se generan
  frescos en la VM (`openssl rand -base64 48`), nunca se reusan de dev.
- **Google/YouTube deshabilitado**: `YOUTUBE_*` queda sin definir. Con esas
  variables vacías, las rutas de verificación devuelven **503 por diseño** (ver
  `apps/api/src/routes/listings.ts`), no 500. Habilitarlas después es completar
  cuatro valores en `api.env` y reiniciar.

## Decisión 9 — Deploy, redeploy, rollback

> **PR3 cambió este flujo.** Los pasos 5, 7 y 8 (typecheck y los dos builds) se
> movieron a GitHub Actions porque la micro de 1 GB no puede construir; en su
> lugar `deploy.sh` baja el artefacto prehecho con `fetch-release.sh`, y el
> `pnpm install` va filtrado a `@marketplace/api...` + `@marketplace/db...`. La
> verificación final ahora exige un `POST /auth/login` → 403, no solo `/health`.
> Lo que sigue es el diseño original de PR2; la versión vigente está en la
> **Decisión 11**.

`deploy.sh` (raíz del repo), corre en la VM, `set -euo pipefail`, aborta si
`pwd -P` != `/srv/marketplace`:

```
1-2  infra/scripts/sync-checkout.sh <ref>   # fetch + reset --hard origin/<ref>
3    pnpm install --frozen-lockfile          # SIN --prod (ver abajo)
4    pnpm --filter @marketplace/db db:generate
5    pnpm --filter @marketplace/api typecheck   # hard gate
6    (cd packages/db && pnpm exec prisma migrate deploy)
7    pnpm --filter @marketplace/api build       # bundle ESM tsup
8    pnpm --filter web build                    # next build
8b   smoke: PORT=3099 node dist/server.mjs ; /health ; una lectura de Postgres ; kill
9    sudo systemctl restart marketplace-api marketplace-web
10   poll /health + / hasta 60s ; sale != 0 si hay silencio
11   git rev-parse HEAD > /var/lib/marketplace/last-good-sha
```

- **`pnpm install` SIN `--prod`.** `dotenv` es `devDependency` de `apps/api` y se
  importa en runtime (`apps/api/src/server.ts`). Con `--prod` el servicio no
  arrancaría. Hay un comentario en el script diciéndolo, para que nadie lo
  "optimice".
- **El paso 8b reusa `apps/api/scripts/smoke.sh`** (el de PR1), no inventa un
  tercer camino de smoke. Le pasa el `DATABASE_URL` de producción, que sale de
  `packages/db/.env`.
- **Garantía de abort-before-swap**: los pasos 5, 7, 8 y 8b corren **antes** del
  restart. Un error de tipos, un build roto o un artefacto muerto dejan los
  procesos anteriores corriendo y el sitio arriba.
- **`git reset --hard` en vez de `git pull`**: en el décimo deploy el working
  tree puede haber sido tocado por SSH. El reset hace que el estado de la VM sea
  función pura del ref. Los archivos no versionados (`node_modules`,
  `packages/db/.env`) se conservan — nunca se hace `git clean`.
- **Regla de migraciones aditivas (expand/contract).** El paso 6 (migrar) va
  **antes** del 7/8 (build). Consecuencia aceptada y documentada: una migración
  puede aplicarse mientras el build siguiente falla, dejando el código *viejo*
  contra un esquema *nuevo*. Es seguro **solo mientras las migraciones sean
  aditivas** — las 17 actuales lo son. Para futuras: agregar columna/tabla en un
  release, empezar a usarla en el siguiente, borrar lo viejo en un tercero.
  Nunca una migración que borre o renombre algo que el código en producción
  todavía usa.
- **`next build` no es atómico.** `next build` reemplaza `.next` in place, así que
  una falla a mitad de build puede dejar `.next` inconsistente mientras el
  `next start` que sigue corriendo sirve de sus archivos ya cargados. El sitio
  sobrevive hasta el próximo restart; `rollback.sh` es la salida. Es el único
  paso genuinamente no atómico y se nombra en vez de fingir lo contrario.
- **Estado conocido tras cualquier falla**: todo paso es idempotente y
  re-ejecutable, y la única mutación antes del gate es la migración. Re-correr
  `deploy.sh` desde cero siempre es seguro.

`rollback.sh <sha|last-good>`: hace checkout del SHA y repite los pasos 3–10
**salteando el 6** (nunca se auto-revierte una migración). Las caches de pnpm y
Turbo lo dejan en ~1 minuto.

### Recuperación de migración fallida

1. `infra/scripts/restore-db.sh <último dump>` — recrea `marketplace` desde el
   `pg_dump` de la noche anterior.
2. `./rollback.sh last-good` — vuelve el código al último SHA que sirvió.
3. El sitio queda en el par (código, esquema) anterior, consistente. No se deja a
   medio actualizar.

### Recuperación de lockout SSH

La IP residencial del operador rota y SSH deja de entrar. `infra/scripts/allow-my-ip.sh
--security-list-id <ocid>` se corre **desde cualquier máquina con la API key de
OCI** (no necesita SSH): detecta la IP pública actual y **reescribe** las reglas
de ingreso de la security list al conjunto canónico (22 desde la IP nueva, 80 y
443 desde `0.0.0.0/0`). El OCID de la security list está en
`infra/provision/launch.log`.

## Decisión 10 — ¿`next build` corre en la VM?

**En A1 sí; en la micro NO** (ver Decisión 11 — este es el cambio de PR3).

Con A1 (12 GB / 2 OCPU): sí. Un build de Next 16 / Turbopack pica en 1–2 GB, más
el swapfile de seguro. Construir en la VM además **garantiza** que `prisma
generate` y `prisma migrate deploy` reciban un engine ARM nativo
(`linux-arm64-openssl-3.0.x`). Ese beneficio es para el **CLI durante las
migraciones**, no para el servicio, que usa el driver adapter y no carga engine
(Decisión 1).

Con la micro (1 OCPU / 1 GB): imposible. `next build` solo pica más RAM que la
que hay. Los builds se mueven a **GitHub Actions** (Decisión 11). El engine de
Prisma para el CLI ahora es `linux-x64` — lo baja `pnpm install` en la VM (que
es x86_64), igual que antes lo bajaba para ARM.

## Decisión 11 — Reorientación a `VM.Standard.E2.1.Micro` x86 (PR3)

### La evidencia: no es quota, es capacidad de host

44 intentos de `oci compute instance launch` en dos corridas (primero 2 OCPU /
12 GB, después `--small` 1 OCPU / 6 GB), durante ~2 h, todos con la misma
respuesta:

    {"code": "InternalError", "message": "Out of host capacity.", "status": 500}

en `sa-saopaulo-1`, que es el único AD de la tenancy. La quota de A1 estuvo
libre todo el tiempo (2 OCPU disponibles, 0 en uso): lo que falta es capacidad
física de host, no permiso. Un `InternalError` 500 no es reintentable de forma
útil más allá de lo que ya se probó.

### El objetivo nuevo

`VM.Standard.E2.1.Micro`, specs verificadas: **1 OCPU, 1.0 GB RAM, AMD EPYC 7551
— x86_64, NO ARM.** Se liberó un slot terminando la instancia muerta `agency`;
la quota de micro ahora muestra 1 disponible, 1 en uso.

El camino Ampere **no se borra**. `launch-instance.sh` sin flags sigue apuntando
a A1; `--micro` es la shape nueva. La IP reservada `144.22.175.14` y el block
volume `marketplace-traspaso-pgdata` (50 GB, con los datos de Postgres) están
justamente para que, si se libera capacidad Ampere, se pueda "subir" el host sin
rehacer nada: relanzar en A1, reasociar la IP, readjuntar el volumen.

`E2.1.Micro` es una **shape fija**: pasarle `--shape-config` es un error 400. El
script arma un array `SHAPE_CONFIG_ARGS` que queda vacío para la micro y lleva
`--shape-config {ocpus,memoryInGBs}` para la A1.Flex. La imagen se resuelve con
el mismo `oci compute image list --shape <shape>` de siempre: OCI solo devuelve
imágenes compatibles con la shape, así que para la micro salen x86_64 sin
filtrar por arquitectura a mano.

### Postgres se queda en la caja, con swap

Se evaluó mover Postgres a un managed externo (el argumento: 1 GB es apretado).
**Decisión del usuario: Postgres en la caja.** Para que entre:

- **Swap de 2 GB** (`bootstrap-vm.sh`) con `vm.swappiness=10` persistido en
  `/etc/sysctl.d/99-marketplace-swap.conf`. Es un colchón de emergencia, no
  paginación de rutina: con swappiness 10 el kernel solo toca el swap bajo
  presión real. Idempotente: si ya hay un `/swapfile` activo no se crea otro.
- **Postgres 16 afinado** en `docker-compose.prod.yml` vía `command:`:

  | Parámetro | Valor | Por qué |
  |---|---|---|
  | `shared_buffers` | `96MB` | ~10 % de 1 GB; el default 128 MB es demasiado para compartir la caja. Se reserva de entrada. |
  | `effective_cache_size` | `256MB` | Solo una pista al planner — no reserva memoria. Refleja lo que el page cache del SO puede llegar a tener. |
  | `work_mem` | `2MB` | Por operación de sort/hash. Con `max_connections=20` y pocas queries concurrentes, subirlo no rinde y multiplica el riesgo. |
  | `maintenance_work_mem` | `32MB` | `VACUUM` y `CREATE INDEX` (las migraciones). |
  | `max_connections` | `20` | El pool de la API (~10) + una migración + un `psql` de emergencia. El default 100 reserva estructuras para conexiones que nunca existen. |
  | `wal_buffers` | `4MB` | Proporcional a `shared_buffers`. |
  | `max_wal_size` / `min_wal_size` | `512MB` / `128MB` | Checkpoints más chicos y frecuentes: menos pico de I/O, menos disco. |

### El build se va de la caja

1 GB no corre `next build` (pico 1–2 GB de heap) ni `tsup`. **El anterior
ocupante de esta misma shape murió de presión de memoria** — y era justamente
por construir en la caja. Así que:

- **`.github/workflows/release.yml`**: en cada push a `fase-5-frontend-y-avisos`
  (o a mano) un runner `ubuntu-latest` —**linux-x64, la misma arquitectura que
  la micro**— corre `pnpm install`, `db:generate`, `typecheck` (hard gate),
  `tsup` y `next build` (con `output: 'standalone'`). Ensambla
  `apps/api/dist` + `apps/web/.next/standalone` (con `static/` y `public/`
  copiados adentro, que Next no hace por diseño) + un `RELEASE_SHA`, lo empaqueta
  como `marketplace-release.tar.gz` y publica un **GitHub Release** con tag
  `release-<sha12>` y el asset + su `.sha256`.
- Se descartó `scp` desde el runner: el ingress SSH está cerrado a
  `181.47.21.233/32` y los runners de GitHub tienen IP dinámica. El modelo es
  **pull**: la VM baja el asset. El repo es público, así que sin credenciales.
- Se descartó construir en la Mac: es `darwin-arm64` y el target es `linux-x64`.
  Cualquier binario nativo (el `sharp` del standalone, el engine de Prisma)
  saldría para la arquitectura equivocada. El runner de GitHub coincide.

**`infra/scripts/fetch-release.sh`** baja el tarball + el `.sha256`, verifica el
hash (un tarball manipulado o a medio bajar aborta), extrae a staging y comprueba
que `RELEASE_SHA` sea el commit pedido antes de mover nada al destino.

**`deploy.sh` ya no construye.** Pasos nuevos: `sync-checkout` → `pnpm install`
**filtrado a `@marketplace/api...` + `@marketplace/db...`** (deja afuera `next`,
`tailwind`, `turbo`; `install` tolera el swap porque es I/O, no mantiene heaps
grandes) → `db:generate` → `prisma migrate deploy` → **`fetch-release.sh`** →
smoke del bundle contra Postgres → `systemctl restart` → verificación. Sigue
siendo idempotente: re-correrlo baja el mismo tarball, re-extrae, la migración es
no-op, y todo lo falible pasa **antes** del restart. `rollback.sh` hace lo mismo
para el SHA destino, salteando la migración.

La verificación final ya **no confía en `/health`** (responde 200 sin tocar la
base): hace un `POST /auth/login` de un usuario inexistente y exige el **403
`{"code":"FORBIDDEN"}`** del dominio, que solo se da si la cadena bundle → Prisma
→ `pg` → Postgres → caso de uso funciona de punta a punta.

### `next start` → server.js del standalone

`apps/web/next.config.ts` gana `output: 'standalone'` y —**gotcha de monorepo**—
`outputFileTracingRoot` apuntando a la raíz del workspace. Sin eso, el trazado
toma `apps/web` como raíz y **omite en silencio** las dependencias hoisteadas en
el store `.pnpm` de la raíz (`next`, `react`, `sharp`…): el bundle compila y
explota en runtime con `MODULE_NOT_FOUND`. Con el trazado en la raíz, el layout
del standalone la replica y el entrypoint queda en
`.next/standalone/apps/web/server.js` — que es lo que arranca
`marketplace-web.service` (`ExecStart=node .../apps/web/.next/standalone/apps/web/server.js`,
`HOSTNAME=127.0.0.1` para que quede solo en loopback detrás de Caddy).

**Verificado en local** (darwin-arm64, solo para probar layout y arranque, no
para desplegar): tras `next build`, copiar `static/` y `public/` adentro del
standalone y `node server.js` — `GET /`, `/robots.txt` y `/sistema` devuelven
200 sin ningún `node_modules` instalado aparte del que trae el propio standalone.

### Presupuesto de memoria — 1024 MB

Estimación de RSS en régimen (sitio ocioso o carga liviana). **Ningún número
está medido sobre la micro real** (no hay acceso a la VM); son estimaciones de
valores típicos + los números de esta doc. Se marcan como tales.

| Componente | RSS estimado | Base de la estimación |
|---|---|---|
| SO + systemd + sshd + journald | 90–140 MB | Ubuntu 22.04 mínimo, típico |
| `dockerd` + `containerd` | 70–110 MB | típico de un daemon Docker con 1 contenedor |
| Postgres 16 afinado | 140–200 MB | `shared_buffers` 96 MB + ~5 backends × ~12 MB; derivado de la Decisión 11 |
| Next standalone (ocioso) | 80–120 MB | medido ~85 MB en darwin-arm64 al arrancar; linux-x64 similar |
| Bundle API Fastify + pool `pg` | 70–100 MB | medido ~75 MB en el smoke local |
| Caddy | 15–30 MB | típico, 1 sitio, sin plugins |
| **Total en régimen** | **~465–700 MB** | |
| **Headroom sobre 1024 MB** | **~324–559 MB** | para picos de request, page cache y `pnpm install`/`migrate` durante un deploy |

**Conclusión: entra, con margen.** El fallo que se está evitando —el ocupante
anterior murió de presión de memoria— era por correr `next build` (1–2 GB de
heap) en la caja. Sacando el build, el pico transitorio más grande que queda es
`pnpm install` filtrado + `prisma migrate deploy` durante un deploy, y para eso
está el swap de 2 GB. En régimen no debería tocar el swap nunca.

Números **medidos** (darwin-arm64, no la micro): arranque del standalone ~85 MB,
smoke del bundle API ~75 MB. Números **estimados**: todo lo demás de la tabla.
La forma de cerrar esto de verdad es un `systemctl status` / `ps_mem` sobre la
micro después del primer deploy — está en la lista de "sin verificar".

## Teardown

Si hay que desmontar todo: terminar la instancia, desadjuntar y borrar el block
volume, borrar la VCN, quitar el registro DNS. **Impacto cero sobre el proyecto
`agency`**, porque nada fuera de la VCN nueva se modifica nunca. Los OCID de todo
lo creado están en `infra/provision/launch.log`.

## Qué queda sin verificar hasta correr en la VM

Estos scripts y archivos se probaron localmente hasta donde se puede
(`shellcheck`, `bash -n`, `caddy validate`, `docker compose config`,
`tests/deploy/*.sh`, `next build` + arranque del standalone en darwin-arm64),
pero varias cosas solo se prueban sobre la VM real:

- **El presupuesto de memoria sobre la micro real.** Los RSS de la tabla de la
  Decisión 11 son estimaciones (salvo standalone ~85 MB y bundle API ~75 MB,
  medidos en darwin-arm64). Cerrar con `systemctl status` / `ps_mem` tras el
  primer deploy.
- **El workflow `release.yml` en un runner real**: que `next build` con
  `output: 'standalone'` produzca `apps/web/.next/standalone/apps/web/server.js`
  en linux-x64 (el `test -f` del workflow lo aborta si el layout cambió), y que
  el tarball ensamblado arranque en la micro.
- `launch-instance.sh --micro` contra OCI: que `E2.1.Micro` lance sin
  `--shape-config` y que `image list --shape VM.Standard.E2.1.Micro` devuelva
  una imagen x86_64 de Ubuntu 22.04.
- `pnpm install --frozen-lockfile --filter "@marketplace/api..." --filter
  "@marketplace/db..."` sobre 1 GB + swap: tiempo y pico de RAM reales.
- `prisma migrate deploy` con el engine `linux-x64` que baja `pnpm install` en
  la micro (antes era ARM).
- El loop de capacidad de `launch-instance.sh` contra el error real de OCI (el
  camino A1, que se conserva).
- El formato exacto que espera `oci network security-list update` para
  `--ingress-security-rules` (se usa camelCase; el CLI a veces devuelve kebab).
- `systemd-analyze verify` de las units (no hay systemd en la máquina de
  desarrollo).
- El link estable del block volume (`/dev/oracleoci/oraclevdb`) y el mount.
- El primer `deploy.sh` completo end-to-end, incluido el smoke contra el Postgres
  de producción y el `systemctl restart`.
