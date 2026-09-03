# Fase 12 — Despliegue

> **Estado**: 🚧 En curso
> **Fecha**: Septiembre 2026
> **Objetivo**: Que la aplicación sea desplegable de forma continua y accesible por HTTPS desde una VM ARM de Oracle Cloud, sin tocar los proyectos vecinos.

Este documento se completa por partes, siguiendo el orden de los PRs del cambio
`deploy-vps-oracle`. Esta primera entrega cubre solo el **artefacto de producción
de la API**; la configuración de infraestructura, el aprovisionamiento y los
scripts de deploy/rollback llegan en entregas posteriores.

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
