# dinero-en-bigint — Columnas de dinero a BigInt

Rama: `worktree-fix-money-bigint` (desde `feat/usuarios-demo-y-seo`, d8ad0e2).
TDD: activado (fuente: `CLAUDE.md`, "TDD is expected"). Runners: `pnpm --filter @marketplace/domain exec vitest run`, `pnpm --filter @marketplace/db exec vitest run` (necesita `make up`).

## Problema
Un precio de $45.555.554,97 ARS (4555555497 centavos) devuelve 500: `askingPrice` es `Int` de 32 bits (tope 2.147.483.647 centavos). Lo vio un amigo en producción (16/10/2026, `POST /listings`); el filtro `maxPrice` falla igual.

## Decisión
B) pasar a `BigInt` las columnas de dinero (usuario, 16/10/2026). El dominio sigue en `number` (seguro hasta 9e15); la conversión `bigint <-> number` vive en los mappers/repos de `packages/db`. Tope explícito en dominio/API para evitar basura.

## Tareas
- [x] T1 Migración: `Listing.askingPrice`, `Operation.offerPrice/finalPrice/buyerCommission/sellerCommission/buyerPays/sellerReceives/platformEarns`, `Notification.amountCents` a `BigInt`.
- [x] T2 Mappers y repositorios de `packages/db` (conversión, filtros `minPrice/maxPrice`, orden), seed y scripts.
- [ ] T3 Dominio/API: tope en `Money`, esquemas JSON de la API con `maximum`, 400 claro en vez de 500.
- [ ] T4 Tests: regresión con 4555555497 y filtro `maxPrice=12312312300`; suites domain + db + api en verde.

## Ruta
Delegada (escritor único): toca más de 2 archivos no triviales.
