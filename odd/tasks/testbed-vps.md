# testbed-vps — Datos de prueba en la VPS con un comando

Rama: `feat/testbed-vps` (desde `origin/fase-5-frontend-y-avisos`).
TDD: activado (fuente: instrucciones del proyecto). Runner del script: `node --test` (sin dependencias).

## Objetivo

Generar rápido, contra la VPS, activos y operaciones de prueba en estados concretos
(publicado, oferta, contrato firmado, en custodia listo para pagar) usando los usuarios
que ya existen, y borrar todo lo de prueba con un solo comando.

## Alcance autorizado

- Targets `testbed-*` en el `Makefile` y un script `scripts/testbed/` que opera sobre la VPS
  (`ubuntu@144.22.175.14`, ya autorizada por el usuario para SSH, despliegue y lectura de `api.env`).
- Escribe en la base de producción **solo filas marcadas** con el prefijo `[TEST]` en el nombre del activo.
- Nunca crea ni borra usuarios, nunca toca `seller_payment_accounts`, nunca corre el seed.
- Fuera de alcance: simular el pago de Mercado Pago (se hace en el navegador con el comprador de prueba).

## Decisiones

- Se usan usuarios existentes (`TESTBED_SELLER_EMAIL`, `TESTBED_BUYER_EMAIL`, `TESTBED_ADMIN_EMAIL`).
- Autenticación: un token JWT de vida corta firmado **en la VPS** con `JWT_SECRET` de `api.env`;
  el secreto no sale de la VPS.
- Las acciones pasan por la API real (túnel SSH a `127.0.0.1:3001`), no por SQL, así que se
  respetan las reglas del dominio. SQL solo para resolver ids de usuario y para el borrado.
- Marca: `assetData.name` empieza con `[TEST] `. El borrado se limita a esos activos y sus dependientes.

## Tareas

- [x] T1 Núcleo puro con tests: plan de estados, cuerpos de las peticiones, SQL de borrado acotado al marcador. Commit `1fcbaa6`.
- [x] T2 Cliente de la VPS (ssh, túnel, token, psql en el contenedor) y comando `up <estado>`. Commit `1d5385c`.
- [x] T3 Comando `clean` y `status` (cuenta lo marcado) con confirmación de conteos. Commit `7991709`.
- [x] T4 Targets en el `Makefile`, documentación en `docs/` y nota en `CLAUDE.md`. Commit `d78309e`.
- [ ] T5 Recorrido real contra la VPS: crear hasta custodia, verificar estado por la API, borrar, verificar cero filas.

## Ruta por tarea

- T1–T4: delegated direct (un solo escritor; toca 2+ archivos no triviales).
- T5: inline (requiere el entorno real y la decisión del usuario sobre usuarios).

## Progreso

T1–T4 hechas por un escritor delegado (una sola ruta). Nada se ejecutó contra la VPS.

Evidencia (runner: `node --test scripts/testbed/*.test.mjs`; el directorio como argumento no funciona en Node 24):

- RED T1: `ERR_MODULE_NOT_FOUND` de `lib.mjs`. GREEN T1: 22 de 22.
- RED T2: `SyntaxError ... does not provide an export named 'PSQL_REMOTE_COMMAND'`. GREEN T2: 41 de 41.
- RED T3: `does not provide an export named 'parseCounts'`. GREEN T3: 48 de 48.
- `make -n testbed-custody TYPE=web PRICE=250000 CURRENCY=ARS` y `make help` muestran los targets.
- `node scripts/testbed/cli.mjs up --state in_custody --dry-run` imprime el plan de 12 pasos sin llamadas remotas.

Rutas y cuerpos confirmados leyendo `apps/api/src/routes/*.ts` y los use cases. El token se firma con `@fastify/jwt` por defecto (HS256, payload `{id, role}`, sin issuer ni audience).

## Siguiente paso

T5: recorrido real contra la VPS (`make testbed-users`, `make testbed-custody`, verificar por la API, `make testbed-clean`, verificar cero filas).
