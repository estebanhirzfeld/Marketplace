# Tasks: identidad de custodia y constancia de entrega

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 1050–1550 (autoría; goldens/migración aparte) |
| 400-line budget risk | High |
| Chained PRs recommended | No |
| Suggested split | Single PR (excepción aceptada); fallback documentado A/B/C |
| Delivery strategy | single-pr |
| Chain strategy | size-exception |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

El usuario vio el pronóstico y eligió un solo PR aceptando exceder el presupuesto de 800.
`sdd-apply` requiere `size:exception` del maintainer antes de empezar.

### Suggested Work Units (fallback, no es el plan)

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| A | CustodyAccount: entidad, puerto, persistencia, ABM, migración, semilla, pantalla admin | PR 1 | `pnpm --filter @marketplace/domain exec vitest run tests/use-cases/custody` | `make db-reset && make test-db` | drop tabla `custody_accounts` + `listings.custodyAccountId`; borrar entidad/mapper/repo/pantalla |
| B | Operation: identidad receptora, DeliveryVerification, `complete()`, use cases, columnas, pantallas comprador | PR 2 | `pnpm --filter @marketplace/domain exec vitest run tests/use-cases/operation` | walkthrough manual de una operación hasta `completed` | drop `operations.recipientIdentity`/`deliveryCheck`; revert `Operation.ts` |
| C | TransferContext, estrategias, handoverSteps, GetMyListings/GetListingDetails, `me.ts`, vista vendedor, `/sistema` | PR 3 | `pnpm --filter @marketplace/domain exec vitest run tests/strategies tests/PlatformHandover.test.ts` | `pnpm --filter web build` | revert firmas de estrategia y tipo de retorno de los use cases |

---

## Contradicciones spec ↔ design (resolver antes de Fase 4)

- **OPEN-1 — nombres de `DeliveryVerification`.** `specs/asset-delivery` pide `verifiedBy`, `verifiedAt`, `deliveredToIdentifier`, `accessSecured`; `design` §4 usa `deliveredBy`, `deliveredAt`, `recipientIdentifier`, `accessTransferred`. Elegir un juego de nombres antes de 4.1.
- **OPEN-2 — modelo de registro.** `specs/asset-delivery` modela registrar la `DeliveryVerification` como acción ADMIN separada en `payment_received` (con sus escenarios de ForbiddenError y estado incorrecto) y `complete()` como transición aparte que verifica su existencia. `design` §4 **rechaza** un método aparte y funde el registro dentro de `complete(data)`. Las tareas 4.x y 6.7/6.8 asumen el modelo de la spec (acción separada + `complete()` verifica); ajustar si el usuario resuelve a favor del design.
- **Gap menor.** `specs/custody-account` "Edición" exige poder cambiar `identifier` y bloquear el cambio de `assetType` si la cuenta sostiene activos; `design` §1 no lista un método para eso. Se agrega `changeAssetType(heldAssetCount)` a la entidad en 1.2.

---

## Fase 1: Dominio — entidad `CustodyAccount`

- [ ] 1.1 **[TEST]** `tests/use-cases/custody/CustodyAccount.test.ts`: `create` fija `isActive=true` y recorta; `reconstitute` sin defaults; `label`/`identifier` vacío → validación; `assetType` fuera de `AssetType` → validación; `deactivate(n>0)` → error de estado; `changeAssetType` con activos → error de estado; `canHold`/`assertCanHold` con tipo distinto; `assertIsActive` en cuenta inactiva. — deps: ninguna
- [ ] 1.2 `packages/domain/src/entities/CustodyAccount.ts`: `CustodyAccountProps`, `create`, `reconstitute`, `rename`, `updateNotes`, `changeAssetType(heldAssetCount)`, `activate`, `deactivate(heldAssetCount)`, `canHold`, `assertCanHold`, `assertIsActive`. — deps: 1.1
- [ ] 1.3 `make test-domain` en verde. — deps: 1.2

## Fase 2: Dominio — `Listing`

- [ ] 2.1 **[TEST]** ampliar `tests/PlatformHandover.test.ts`: `registerPlatformAccess` sin `custodyAccountId` → validación; `revokePlatformAccess` deja `custodyAccountId` nulo; `handoverSteps(context?)` reenvía el contexto a la estrategia. — deps: ninguna
- [ ] 2.2 `entities/Listing.ts`: `PlatformAccessRecord.custodyAccountId` (obligatorio); `registerPlatformAccess` lo exige; `revokePlatformAccess` lo limpia; `handoverSteps(context?: TransferContext)`. — deps: 2.1

## Fase 3: Dominio — estrategias / pasos de traspaso

- [ ] 3.1 **[TEST]** `tests/strategies/`: YouTube sin contexto → genérico sin identificador; con `custodyAccountIdentifier` → aparece en `description` **y** `instruction` del paso de invitación; con `recipientIdentifier` → aparece en el paso de invitación al comprador; paso opt-out de permisos de canal con `requiredActor=seller` **antes** de la invitación; Web acepta contexto sin romperse y sin ningún paso de permisos de canal. — deps: ninguna
- [ ] 3.2 `strategies/IAssetStrategy.ts`: `TransferContext`; nueva firma `getTransferSteps(context?)`. — deps: 3.1
- [ ] 3.3 `strategies/YouTubeStrategy.ts`: paso opt-out antes de invitar, pasos nombrados, renumerar `id` posicionales. — deps: 3.2
- [ ] 3.4 `strategies/WebStrategy.ts`: nueva firma; nombra `recipientIdentifier` en el paso del registrador; comentario sobre la custodia ausente (cambio aparte). — deps: 3.2
- [ ] 3.5 `strategies/SocialStrategy.ts`: adoptar la nueva firma (variante genérica). — deps: 3.2

## Fase 4: Dominio — `Operation` (identidad receptora + entrega)

- [ ] 4.1 **[TEST]** ampliar `tests/use-cases/operation/OperationUseCases.test.ts` (o archivo nuevo `tests/use-cases/operation/AssetDelivery.test.ts`): `declareRecipientIdentity` → ForbiddenError para vendedor/admin; rechaza en `offer_sent`/`negotiating` y en `completed`/`cancelled`; permite `contract_pending` y `asset_in_custody`; re-declarable sin `DeliveryVerification`; registrar entrega → ForbiddenError para no-admin y error de estado fuera de `payment_received`; `deliveredToIdentifier` se congela de la identidad vigente y no cambia si la declarada cambia; `complete()` rechaza sin identidad, sin constancia, sin `isPrimaryOwner`, sin `accessSecured`; camino feliz pasa a `completed` y fija `completedAt`. — deps: ninguna (OPEN-1/OPEN-2 resueltas)
- [ ] 4.2 **[TEST]** ampliar `tests/CustodyVerification.test.ts`: `CustodyVerification` congela `custodyAccountId` del `platformAccess` vigente y no cambia si el listing re-registra con otra cuenta. — deps: ninguna
- [ ] 4.3 `entities/Operation.ts`: `RecipientIdentity`, `declareRecipientIdentity(identifier, by)`, `assertIsBuyer`; `DeliveryVerification` + `recordDeliveryVerification(data, by)` (acción ADMIN, solo `payment_received`, congela `deliveredToIdentifier`); `complete()` con cadena de guardas; `CustodyVerification.custodyAccountId`; expone `recipientIdentity`/`deliveryCheck` para lectura. — deps: 4.1, 4.2

## Fase 5: Dominio — puertos

- [ ] 5.1 `ports/Repositories.ts`: `ICustodyAccountRepository` (`findById`, `findAll`, `findActive(assetType?)`, `save`); `IListingRepository.findHeldBy(custodyAccountId): Promise<Listing[]>` (excluye vendidos). — deps: 1.2, 2.2

## Fase 6: Dominio — use cases (mocks de puertos)

- [ ] 6.1 **[TEST]** `tests/use-cases/custody/CustodyAccountUseCases.test.ts`: cada flujo exige `assertIsAdmin` → ForbiddenError para BUYER/SELLER; `Deactivate`/`Update` consultan `findHeldBy` y bloquean baja/cambio de `assetType` con activos; `ListCustodyAccounts` arma `heldAssets` por cuenta. — deps: ninguna
- [ ] 6.2 `use-cases/admin/CustodyAccountUseCases.ts`: `Create`, `Update`, `Activate`, `Deactivate`, `ListCustodyAccounts`. — deps: 5.1, 6.1
- [ ] 6.3 **[TEST]** `tests/use-cases/operation/` — `DeclareRecipientIdentityUseCase`: carga la operación, delega en la entidad, guarda. — deps: ninguna
- [ ] 6.4 `use-cases/operation/DeclareRecipientIdentityUseCase.ts`. — deps: 4.3, 6.3
- [ ] 6.5 **[TEST]** ampliar cobertura de `RegisterPlatformAccessUseCase`: rechaza cuenta inexistente (`NotFoundError`), inactiva, `assetType` incompatible; camino feliz guarda `custodyAccountId`. — deps: ninguna
- [ ] 6.6 `use-cases/listing/RegisterPlatformAccessUseCase.ts`: recibe `custodyAccountId`, carga la cuenta, `assertCanHold` + `assertIsActive`, luego `listing.registerPlatformAccess({...})`. — deps: 5.1, 2.2, 6.5
- [ ] 6.7 **[TEST]** `RecordDeliveryVerificationUseCase` + `CompleteOperationUseCase`: registrar entrega exige admin y estado; `complete()` rechaza cierre incompleto y cierra con todo satisfecho. — deps: ninguna
- [ ] 6.8 `use-cases/operation/RecordDeliveryVerificationUseCase.ts` (nuevo) y `CompleteOperationUseCase.ts` (ajustar a la nueva regla de `complete()`). — deps: 4.3, 6.7
- [ ] 6.9 **[TEST]** `GetListingDetailsUseCase` y `GetMyListingsUseCase`: resuelven la cuenta (asignada → activa por `AssetType` → genérico); `GetMyListings` carga las cuentas activas **una sola vez** (sin N+1) y devuelve `SellerListingView`; consulta de pasos restringida a vendedor o admin (`assertOwnedBy`). — deps: ninguna
- [ ] 6.10 `use-cases/listing/GetListingDetailsUseCase.ts`: suma `ICustodyAccountRepository`, resuelve el contexto, llama `listing.handoverSteps(ctx)`. — deps: 5.1, 2.2, 3.2, 6.9
- [ ] 6.11 **[CAMBIO NO ADITIVO]** `use-cases/listing/GetMyListingsUseCase.ts`: cambia el tipo de retorno a `SellerListingView { listing, handoverSteps }`, arma `Map<AssetType,string>` de cuentas activas. **Hacer 6.11 y 11.3 en el mismo commit** para no dejar `apps/api` roto entre medio. — deps: 5.1, 2.2, 3.2, 6.9
- [ ] 6.12 `use-cases/operation/GetOperationDetailsUseCase.ts`: expone `recipientIdentity` y `deliveryCheck`. — deps: 4.3

## Fase 7: Persistencia — esquema, migración, mappers, repos

- [ ] 7.1 `packages/db/prisma/schema.prisma`: modelo `CustodyAccount` (`identifier` `@unique`, índice `assetType,isActive`); `listings.custodyAccountId` FK nullable + índice; `operations.recipientIdentity` `Json?`; `operations.deliveryCheck` `Json?`. — deps: ninguna
- [ ] 7.2 Generar migración: `pnpm --filter @marketplace/db exec prisma migrate dev --name add_custody_accounts`; verificar que el SQL es 100% aditivo/nullable; regenerar cliente (`pnpm --filter @marketplace/db db:generate`). La aplica `make db-reset`; `make fresh`/`db:push` no la necesita. Las filas `platformAccess` previas quedan con `custodyAccountId` NULL a propósito — sin backfill. — deps: 7.1
- [ ] 7.3 `packages/db/src/mappers/CustodyAccountMapper.ts` (nuevo): `toDomain`/`toPersistence`. — deps: 1.2
- [ ] 7.4 `mappers/ListingMapper.ts`: `parseAcceso(raw.platformAccess, raw.custodyAccountId)`; `serializeAcceso` devuelve `{ platformAccess, custodyAccountId }`; acceso previo sin columna → "cuenta sin asignar". — deps: 2.2
- [ ] 7.5 `mappers/OperationMapper.ts`: `parseEntrega`/`serializeEntrega` para `deliveryCheck`, `recipientIdentity`, `custodyAccountId` dentro de `custodyCheck`; `undefined` en vez de `Prisma.DbNull`. — deps: 4.3
- [ ] 7.6 `packages/db/src/repositories/PrismaCustodyAccountRepository.ts` (nuevo). — deps: 5.1, 7.3
- [ ] 7.7 `repositories/PrismaListingRepository.ts`: `findHeldBy` (excluye vendidos) y proyección de la FK en `save`. — deps: 5.1, 7.4
- [ ] 7.8 `packages/db/src/index.ts`: exportar repo y mapper nuevos. — deps: 7.6

## Fase 8: Persistencia — tests de integración (base real, :5434)

- [ ] 8.1 **[TEST]** `packages/db/tests/integration.test.ts`: ida y vuelta de `CustodyAccount`; la FK sobrevive al `save` del listing; `revokePlatformAccess` deja Json **y** columna en nulo; `findHeldBy` excluye vendidos; `identifier` duplicado falla; `platformAccess` con `custodyAccountId` NULL sigue válido. Cada test crea sus datos con value objects tipados. — deps: 7.7

## Fase 9: Semilla

- [ ] 9.1 `packages/db/prisma/seed.ts`: una `CustodyAccount` de YouTube activa + asignar esa cuenta a los listings sembrados que ya traen `platformAccess`. Comentario: el `identifier` real de Google **todavía no existe** — el valor sembrado es un placeholder que el usuario debe reemplazar. — deps: 7.6

## Fase 10: `api-contract`

- [ ] 10.1 `packages/api-contract/src/index.ts`: `CustodyAccountDto` (`heldAssets: number`), `CreateCustodyAccountRequest`, `UpdateCustodyAccountRequest`, `RecipientIdentityDto`, `DeliveryVerificationDto` + request, forma `SellerListingView` para `me.ts`. — deps: ninguna

## Fase 11: API — rutas y cableado

- [ ] 11.1 `apps/api/src/container.ts`: instanciar `PrismaCustodyAccountRepository` y cablearlo en los use cases nuevos y modificados. — deps: 7.8, 6.2, 6.4, 6.6, 6.8, 6.10, 6.12
- [ ] 11.2 `apps/api/src/routes/me.ts`: rutas ABM bajo `/admin` (`GET`/`POST /admin/custody-accounts`, `PATCH /admin/custody-accounts/:id`, `POST /admin/custody-accounts/:id/baja`, `.../alta`); ruta declarar identidad receptora; ruta registrar constancia de entrega; `RegisterPlatformAccess` recibe `custodyAccountId`. — deps: 11.1, 10.1
- [ ] 11.3 `apps/api/src/routes/me.ts` — `aMyListingDto` lee `view.handoverSteps` en vez de llamar a la entidad (**ripple de 6.11; mismo commit**). — deps: 6.11
- [ ] 11.4 **[TEST]** API: las cinco rutas del ABM responden 403 a un actor no-admin. — deps: 11.2

## Fase 12: Web

- [ ] 12.1 `apps/web/src/app/admin/cuentas/page.tsx` + `actions.ts` + `CustodyAccountForm`: lista (label, identifier, tipo, estado, activos sostenidos), alta, edición, baja/alta. — deps: 11.2
- [ ] 12.2 `apps/web/src/components/PlatformAccessForm.tsx`: selector de cuenta de custodia (ahora obligatorio). — deps: 11.2
- [ ] 12.3 `apps/web/src/app/operaciones/[id]/page.tsx`: tarea pendiente del comprador "declarar identidad receptora" en *Qué podés hacer* (urgente desde `asset_in_custody`); formulario de constancia de entrega para el admin. — deps: 11.2
- [ ] 12.4 Vista de pasos del vendedor: mostrar el identificador concreto de la cuenta a invitar cuando existe. — deps: 11.3
- [ ] 12.5 `apps/web/src/app/sistema/page.tsx`: reflejar `CustodyAccountForm`, el selector de cuenta, el formulario de entrega y la tarjeta de tarea pendiente (regla del proyecto). — deps: 12.1, 12.2, 12.3

## Fase 13: Verificación

- [ ] 13.1 `make test` (suite completa) en verde. — deps: todas
- [ ] 13.2 Typecheck en `domain`, `db`, `api-contract`, `api`, `web`. — deps: todas
- [ ] 13.3 `make db-reset` aplica la migración sin intervención; `make fresh` sigue funcionando. — deps: 7.2, 9.1
- [ ] 13.4 `pnpm --filter @marketplace/web build`. — deps: Fase 12
- [ ] 13.5 Walkthrough manual: (a) `/admin/cuentas` — alta de una cuenta; (b) `PlatformAccessForm` — registrar acceso eligiendo la cuenta; (c) pasos del vendedor en el detalle del listing — muestran el identificador concreto y el paso de opt-out antes de la invitación; (d) `/operaciones/[id]` como comprador — tarea pendiente de identidad receptora, urgente en custodia; (e) `/operaciones/[id]` como admin — formulario de entrega; la operación no cierra sin la constancia. — deps: 13.4
