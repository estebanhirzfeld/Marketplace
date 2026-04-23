# Marketplace — Monorepo

Arquitectura basada en Turborepo con pnpm workspaces.
- `apps/api`: Fastify + TypeScript (Backend)
- `apps/web`: Next.js App Router (Frontend)
- `packages/shared-types`: Tipos y DTOs comunes compartidos entre backend y frontend

## Prerrequisitos

- Node.js >= 20
- pnpm >= 9
- Docker Desktop (solo para PostgreSQL)

## Inicio Rápido Local

1. Levantar la base de datos:
   ```bash
   docker compose up -d
   ```

2. Instalar dependencias desde la raíz:
   ```bash
   pnpm install
   ```

3. Levantar todo el stack:
   ```bash
   pnpm dev
   ```
   - Frontend en http://localhost:3000
   - API en http://localhost:3001 (por configurar)

4. Para levantar proyectos de forma aislada:
   ```bash
   pnpm dev --filter web   # Sólo el front
   pnpm dev --filter api   # Sólo el back
   ```

## Reglas del Monorepo

- Las dependencias compartidas de entorno (ESLint, TS, Prettier) van en la raíz e idealmente heredadas.
- Los tipos compartidos van en `@marketplace/shared-types`.
- Las variables de entorno se declaran en cada app.
