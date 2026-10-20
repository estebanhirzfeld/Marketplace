# Fase 0 — Scaffold del Monorepo

> **Estado**: ✅ Completa  
> **Fecha**: Abril 2026  
> **Commit**: `chore: init monorepo scaffold`

Inicialización del proyecto como **monorepo con Turborepo + pnpm workspaces**. Se definió la estructura de paquetes, la configuración base de TypeScript y la infraestructura Docker para PostgreSQL.

---

## Estructura creada

```
Marketplace/
├── apps/
│   ├── api/          ← Backend Fastify (placeholder)
│   └── web/          ← Frontend Next.js (placeholder)
├── packages/
│   ├── domain/       ← Capa de dominio pura (DDD)
│   ├── shared-types/ ← Enums y tipos compartidos entre paquetes
│   └── db/           ← (creado en Fase 2 — Prisma + repositorios)
├── docker-compose.yml
├── turbo.json
├── tsconfig.base.json
├── pnpm-workspace.yaml
└── package.json
```

---

## Decisiones técnicas

### 1. Turborepo como orquestador

Turborepo maneja el `build`, `dev`, `lint` y `test` de todos los paquetes. Cada paquete tiene su propio `package.json` y `tsconfig.json` que extiende de `tsconfig.base.json`.

```json
// turbo.json — tareas relevantes
{
  "tasks": {
    "build": { "dependsOn": ["^build", "^db:generate"] },
    "dev":   { "cache": false, "persistent": true, "dependsOn": ["^db:generate"] },
    "test":  {}
  }
}
```

> `^db:generate` como dependencia garantiza que el cliente Prisma esté generado antes de buildear o correr dev.

### 2. pnpm workspaces

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "packages/*"
```

Cada paquete se referencia con `workspace:*` en sus dependencias. Ejemplo: `"@marketplace/domain": "workspace:*"`.

### 3. TypeScript base compartido

```json
// tsconfig.base.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true
  }
}
```

Cada paquete extiende de este config con su propio `tsconfig.json`.

### 4. Docker Compose (PostgreSQL)

```yaml
services:
  db:
    image: postgres:16
    ports:
      - "5433:5432"    # ← 5433 para evitar conflicto con Postgres nativo
    environment:
      POSTGRES_USER: marketplace
      POSTGRES_PASSWORD: marketplace
      POSTGRES_DB: marketplace_dev
```

> ⚠️ **Puerto 5433**: Si tenés Postgres nativo corriendo en 5432 (común en macOS), Docker mapea a 5433 para evitar colisiones.

### 5. Shared Types

Paquete liviano con enums que se comparten entre dominio, API y frontend:

```typescript
// packages/shared-types/src/index.ts
export enum AssetType {
    YOUTUBE = "youtube",
    WEB = "web",
    INSTAGRAM = "instagram",
    TIKTOK = "tiktok",
}

export enum UserRole {
    BUYER = "buyer",
    SELLER = "seller",
    ADMIN = "admin",
}
```

---

## Paquetes inicializados

| Paquete | Nombre npm | Rol |
|---------|-----------|-----|
| `apps/api` | `@marketplace/api` | Backend Fastify — placeholder |
| `apps/web` | `@marketplace/web` | Frontend Next.js — placeholder |
| `packages/domain` | `@marketplace/domain` | Capa de dominio DDD (sin deps de infra) |
| `packages/shared-types` | `@marketplace/shared-types` | Enums y DTOs compartidos |

---

## Comandos

```bash
# Instalar dependencias
pnpm install

# Levantar Docker (PostgreSQL)
docker compose up -d

# Dev (levanta todos los apps)
pnpm dev
# o
turbo dev
```

---

## Siguiente paso

→ **Fase 1**: Implementación de la capa de dominio (entidades, value objects, estrategias).
