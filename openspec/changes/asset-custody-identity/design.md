# Diseño: identidad de custodia y constancia de entrega

## Enfoque técnico

Tres piezas que se apoyan una en la otra, en el orden en que el escrow las necesita:

1. **`CustodyAccount`** es un agregado nuevo con tabla propia. El `Listing` lo referencia por una FK real desnormalizada fuera del Json de la constancia de acceso; el `Listing` nunca carga la cuenta, solo su id.
2. **La `Operation`** gana la identidad receptora declarada por el comprador y `DeliveryVerification`, simétrica a `CustodyVerification` y exigida por `complete()`.
3. **`getTransferSteps(context?)`** recibe los identificadores ya resueltos. La estrategia escribe la frase, el use case aporta el dato; ninguna entidad consulta un repositorio.

La regla que ordena todo el diseño: **las entidades reciben hechos, no puertos**. `Listing` no sabe buscar una `CustodyAccount` y `Operation` tampoco. Quien cruza agregados es el use case, que ya es el patrón de `AcceptOfferUseCase` con su cascada.

---

## Decisiones de arquitectura

### 1. `CustodyAccount`: entidad y tabla propias

| | |
|---|---|
| **Elegido** | Agregado propio: `packages/domain/src/entities/CustodyAccount.ts` + tabla `custody_accounts`. |
| **Rechazado** | Value object dentro del Json `platformAccess` (sin migración). |
| **Motivo** | Ya resuelto en la propuesta: una cuenta sostiene varios activos a la vez, hay que poder consultar cuáles, y la cuenta tiene ciclo de vida propio. |

```ts
export interface CustodyAccountProps {
    /** Cómo la nombra la operación por dentro: "Custodia YouTube 01". */
    label: string;
    /**
     * La dirección que el vendedor invita, o el usuario del registrador.
     * Es lo único que se guarda de la cuenta: nunca su contraseña, su segundo
     * factor ni su correo de recuperación. Un identificador filtrado no
     * entrega el acceso; una credencial guardada sí.
     */
    identifier: string;
    /**
     * Contra qué tipo de activo puede recibir custodia. Se tipa por
     * `AssetType` y no por el `ownershipSource` del descriptor: para un sitio
     * web la titularidad se comprueba contra AdSense pero la custodia vive en
     * una cuenta de registrador. Son dos ejes distintos.
     */
    assetType: AssetType;
    isActive: boolean;
    notes?: string;
}
```

- `create({ label, identifier, assetType })` → fija `isActive: true`, recorta y exige `label` e `identifier` no vacíos.
- `reconstitute(props, id, createdAt)` → sin defaults, como el resto del proyecto.
- Métodos: `rename(label)`, `updateNotes(notes)`, `activate()`, `deactivate(heldAssetCount)`, `canHold(assetType)`, `assertCanHold(assetType)`, `assertIsActive()`.
- La unicidad de `identifier` la sostiene el `@unique` de la base: una entidad no puede ver las otras filas.

**`deactivate(heldAssetCount: number)` recibe el número en vez de consultarlo.** No se puede dar de baja una cuenta que sostiene activos —quedarían sin quién los sostenga—, pero contarlos exige cruzar a `Listing`. Se pasa el hecho ya resuelto, igual que `assertCanBeTransferred(ahora)` recibe la fecha en vez de leer el reloj. La regla queda en la entidad; la consulta, en el use case.

**Rechazado:** dejar esa validación en el use case. Habría sido la primera regla de negocio de este cambio viviendo fuera de una entidad, y la que más caro sale olvidar.

### 2. El vínculo `Listing → CustodyAccount`: columna FK, no id dentro del Json

| | |
|---|---|
| **Elegido** | Columna `listings.custodyAccountId` (FK nullable, indexada). El dominio la ve como `PlatformAccessRecord.custodyAccountId`; el mapper la proyecta a la columna. **Una sola copia guardada: la columna. El Json no lo repite.** |
| **Rechazado A** | El id adentro del Json `platformAccess`: sin migración, pero sin integridad referencial y sin poder responder "qué activos sostiene la cuenta X ahora mismo" — que es un criterio de éxito. |
| **Rechazado B** | Guardarlo en los dos lados (Json y columna). Dos copias del mismo dato divergen; la que se lea primero gana y nadie sabe cuál es. |

`custodyAccountId` vive **dentro** de `PlatformAccessRecord` en el dominio porque es parte de lo que se atestiguó: la constancia dice a qué cuenta se cedió el activo. Que la persistencia lo guarde en una columna aparte es un detalle del mapper.

```ts
export interface PlatformAccessRecord {
    verifiedBy: UniqueEntityID;
    verifiedAt: Date;
    accessSince: Date;
    /**
     * A qué cuenta se le cedió el activo. Obligatorio desde este cambio: una
     * constancia que no dice a qué cuenta se cedió deja al vendedor sin saber
     * a quién invitar, que es exactamente el hueco que este cambio cierra.
     */
    custodyAccountId: UniqueEntityID;
    notes?: string;
}
```

- `ListingMapper.parseAcceso(raw.platformAccess, raw.custodyAccountId)` — si hay constancia sin columna, es una fila anterior a este cambio (ver Migración).
- `serializeAcceso` devuelve el par `{ platformAccess, custodyAccountId }`; `revokePlatformAccess()` deja los dos en nulo, porque una constancia revocada que conserva la FK seguiría contando la cuenta como sosteniendo el activo.

**La consulta inversa va en `IListingRepository`, no en `ICustodyAccountRepository`:**

```ts
/**
 * Los activos que esta cuenta sostiene AHORA. Excluye los vendidos: la
 * constancia se conserva como evidencia de la operación cerrada, pero la
 * plataforma ya no los tiene. El radio de daño de perder una cuenta es lo que
 * sostiene en este momento, no lo que pasó alguna vez por ella.
 */
findHeldBy(custodyAccountId: string): Promise<Listing[]>;
```

Los listings son listings; poner esa consulta en el repositorio de cuentas la habría hecho devolver otro agregado. Es el mismo criterio con el que `IUserRepository.findByRole` se sumó a su propio puerto.

### 3. La identidad receptora vive en `Operation`

```ts
/**
 * Dónde quiere recibir el activo el comprador.
 *
 * Va en la operación y no en el usuario porque un comprador puede querer dos
 * activos en dos cuentas distintas: la identidad solo significa algo respecto
 * de una entrega concreta.
 */
export interface RecipientIdentity {
    identifier: string;
    declaredAt: Date;
    notes?: string;
}
```

Método: `declareRecipientIdentity(identifier: string, by: string): void`

| Guarda | Regla |
|---|---|
| Quién | Solo el comprador — `assertIsBuyer(actorId)`, espejo del `assertIsSeller` que ya existe. |
| Cuándo | Legal desde `contract_pending`; ilegal en `offer_sent`, `negotiating`, `completed` y `cancelled`. |
| Qué | `identifier` recortado y no vacío. Sin validar formato: para un canal es un correo de Google y para un registrador es un usuario. |
| Rehacer | Re-declarable mientras la operación siga abierta — corrige un tipeo. Después de `completed` no, por Decisión 4. |

**Rechazado:** exigirla al firmar el contrato o al entrar en custodia. El usuario eligió tarea pendiente: disponible desde `contract_pending`, exigible recién en `complete()`. Forzar un momento único bloquea a una parte por un dato que puede dar más tarde.

### 4. `DeliveryVerification`: `complete()` la exige, no hay segunda puerta

| | |
|---|---|
| **Elegido** | `complete(data: DeliveryVerificationInput)` — un solo método que registra la constancia **y** transiciona a `completed`. |
| **Rechazado** | Un `confirmBuyerDelivery()` aparte que transicione, dejando `complete()` sin argumentos. |
| **Motivo** | Un `complete()` sin argumentos que sobreviva es una segunda puerta al estado terminal que se saltea la constancia: exactamente el hueco que este cambio cierra. El precedente manda: `confirmAssetCustody(data)` registra y transiciona en un solo acto, y no existe ningún `takeCustody()` suelto. Además, cambiar la firma rompe la compilación en cada llamador, que es la forma barata de que ninguno quede sin revisar. |

```ts
export interface DeliveryVerification {
    deliveredBy: UniqueEntityID;
    deliveredAt: Date;
    /**
     * Copia congelada del identificador declarado. La identidad receptora
     * puede cambiar después; la constancia dice a dónde se entregó de verdad.
     */
    recipientIdentifier: string;
    /**
     * Si el comprador quedó como propietario principal. Es también lo que
     * atestigua que su espera de 7 días se cumplió: no hace falta un
     * temporizador nuevo, porque sin esos días Google no permite el cambio.
     */
    isPrimaryOwner: boolean;
    /** Si los accesos (correos de recuperación, segundo factor) se cedieron. */
    accessTransferred: boolean;
    notes?: string;
}

export type DeliveryVerificationInput = Omit<DeliveryVerification, 'deliveredAt' | 'recipientIdentifier'>;
```

`recipientIdentifier` no viaja en el input: lo copia la entidad de `props.recipientIdentity`. Que lo aportara quien llama permitiría entregar a un destino que el comprador nunca declaró.

Cadena de guardas de `complete()`, calcada de `confirmAssetCustody`:

1. Estado `payment_received`, si no `InvalidStateError`.
2. `deliveredBy` presente.
3. `recipientIdentity` declarada — si falta: *"El comprador todavía no declaró dónde quiere recibir el activo."*
4. `isPrimaryOwner` verdadero — si no, la entrega no es efectiva.
5. `accessTransferred` verdadero.

Persistencia: columna `operations.deliveryCheck` (Json nullable), espejo de `custodyCheck`, con su `parseEntrega`/`serializeEntrega` en `OperationMapper` y el mismo `undefined` en vez de `Prisma.DbNull` — la constancia se registra una vez y nunca se borra.

`CustodyVerification` suma `custodyAccountId?: UniqueEntityID`: congela desde qué cuenta salió el activo aunque el listing revoque y vuelva a registrar el acceso más tarde. Opcional porque los blobs `custodyCheck` ya guardados no lo tienen.

### 5. `TransferContext`: la estrategia nombra la cuenta sin conocerla

```ts
/**
 * Los identificadores concretos que los pasos de traspaso pueden nombrar.
 *
 * Ninguna cuenta queda escrita en una estrategia: la estrategia sabe CÓMO se
 * dice el paso en su plataforma, y quien la llama sabe QUIÉN es. Todo es
 * opcional porque el catálogo muestra los pasos antes de que exista ninguna
 * operación, y ahí la variante genérica es la correcta.
 */
export interface TransferContext {
    custodyAccountIdentifier?: string;
    recipientIdentifier?: string;
}
```

Firma en `IAssetStrategy`: `getTransferSteps(context?: TransferContext): TransferStep[]`

`TransferStep` no cambia de forma: `description` (tercera persona, la lee la plataforma al atestiguar) e `instruction` (segunda persona, la lee quien lo hace) se redactan las dos con el identificador incrustado.

**`YouTubeStrategy`** — pasa de 9 a 10 pasos:

| # | Paso | Con contexto |
|---|---|---|
| 1 | Convertir a Cuenta de Marca | sin cambio |
| **2** | **Nuevo: salir de los permisos de canal en YouTube Studio, antes de invitar** | sin cambio |
| 3 | Invitar a la plataforma como propietaria | `description`: "El vendedor invita a **{identifier}** como propietaria del canal" · `instruction`: "Invitá a **{identifier}** como propietaria del canal" |
| 4–5 | Verificación y custodia de la plataforma | sin cambio |
| 6 | Pago del comprador | sin cambio |
| 7 | La plataforma invita al comprador | nombra `recipientIdentifier` cuando está |
| 8–10 | Espera del comprador, propietario principal, cierre | sin cambio |

El paso nuevo va **antes** de la invitación: es el que rompe el traspaso con un error incomprensible —la invitación parece funcionar y el cambio de propietario principal falla sin explicar por qué—. Los `id` son posicionales y se renumeran; no se persisten en ningún lado (solo viajan al DTO como clave de render).

**`WebStrategy`** — implementa la nueva firma y nombra `recipientIdentifier` en el paso 2 ("el comprador inicia la transferencia en su registrador"). **No suma ningún paso de custodia**: eso es el defecto preexistente que la propuesta manda a `web-escrow-transfer-steps`. Ignorar `custodyAccountIdentifier` acá no es un olvido, es la ausencia que ese cambio va a llenar; queda un comentario que lo dice.

**Rechazado:** que la estrategia reciba la entidad `CustodyAccount`. Acoplaría el catálogo de tipos de activo a un agregado de persistencia y obligaría a `AssetStrategyFactory` a conocerlo. Un string es todo lo que el texto necesita.

### 6. Cómo el identificador llega a las pantallas

`Listing.handoverSteps(context?: TransferContext)` — pasamanos hacia la estrategia, sin lógica nueva.

Quién resuelve el contexto y con qué regla:

```
cuenta a nombrar = la cuenta ya asignada al listing (platformAccess.custodyAccountId)
                   ─ si no hay ─
                   la cuenta activa para el AssetType del listing
```

La segunda mitad es la que importa y es la que obliga al ABM. El vendedor tiene que saber **a quién invitar antes** de que exista ninguna constancia de acceso: la constancia se registra después de que él invitó. Sin cuenta activa dada de alta, el paso vuelve a la frase genérica y el flujo queda trabado — que es justo lo que la Decisión 1 evita.

| Use case | Cambio |
|---|---|
| `GetListingDetailsUseCase` | Suma `ICustodyAccountRepository`. Resuelve la cuenta y llama `listing.handoverSteps(ctx)`. |
| `GetMyListingsUseCase` | Hoy devuelve `Listing[]` y la ruta llama `listing.handoverSteps()`. Pasa a devolver `SellerListingView { listing, handoverSteps }`: la ruta no puede resolver la cuenta sin meter persistencia en el transporte. Carga las cuentas activas **una sola vez** y arma un `Map<AssetType, string>` — sin N+1. |
| `aMyListingDto` en `me.ts` | Lee `view.handoverSteps` en vez de llamar a la entidad. |

**Rechazado:** que la ruta consulte el repositorio de cuentas. Pone una lectura de persistencia en la capa de transporte, que es la única capa del proyecto que hoy no la tiene.

### 7. ABM de cuentas de custodia

| Capa | Qué se agrega |
|---|---|
| Puerto | `ICustodyAccountRepository`: `findById`, `findAll`, `findActive(assetType?)`, `save`. |
| Use cases | `packages/domain/src/use-cases/admin/CustodyAccountUseCases.ts` — `Create`, `Update`, `Activate`, `Deactivate`, `ListCustodyAccounts`. Un archivo por flujo, como `ReportUseCases` y `PaymentUseCases`. Todos abren con `assertIsAdmin(actor)`. |
| Rutas (`me.ts`, prefijo `/admin` ya existente) | `GET /admin/custody-accounts` · `POST /admin/custody-accounts` · `PATCH /admin/custody-accounts/:id` · `POST /admin/custody-accounts/:id/baja` · `POST /admin/custody-accounts/:id/alta` |
| DTOs (`api-contract`) | `CustodyAccountDto` (con `heldAssets: number`), `CreateCustodyAccountRequest`, `UpdateCustodyAccountRequest`. |
| Pantalla | `apps/web/src/app/admin/cuentas/page.tsx` + `actions.ts` + `CustodyAccountForm`. Lista con etiqueta, identificador, tipo, estado y cuántos activos sostiene. |
| Además | `PlatformAccessForm` suma el selector de cuenta (registrar acceso ahora la exige) y `/sistema` refleja los componentes nuevos. |

`ListCustodyAccountsUseCase` es el que llama `listingRepo.findHeldBy()` por cuenta: la baja necesita el número y la pantalla necesita mostrarlo, así que sale del mismo lugar.

**Rechazado:** dejar el alta solo en la semilla. Un entorno sin sembrar se quedaba sin ninguna cuenta y, como registrar el acceso pasa a exigirla, el flujo entero quedaba trabado.

`RegisterPlatformAccessUseCase` cambia así: recibe `custodyAccountId` en el input, carga la cuenta (`NotFoundError` si no existe), llama `account.assertCanHold(assetType del listing)` y `account.assertIsActive()`, y recién ahí `listing.registerPlatformAccess({...})`. Las reglas siguen en la entidad `CustodyAccount`; el use case solo trae el agregado.

---

## Flujo de datos

```
  Vendedor                    Admin                      Comprador
     │                          │                            │
GetMyListings /        RegisterPlatformAccess       DeclareRecipientIdentity
GetListingDetails              │                            │
     │                         ▼                            ▼
     ├──► ICustodyAccountRepository.findActive(assetType)    │
     │                         │                            │
     │              account.assertCanHold() / assertIsActive()
     │                         │                            │
     │                         ▼                            │
     │        Listing.registerPlatformAccess({ custodyAccountId })
     │                         │                            │
     │                         ▼                            │
     │            listings.custodyAccountId (FK) ◄── findHeldBy()
     ▼                                                      │
Listing.handoverSteps({ custodyAccountIdentifier })          │
     │                                                      │
     ▼                    ConfirmCustody ──► CustodyVerification.custodyAccountId
Strategy.getTransferSteps(ctx)                              │
     │                                                      ▼
     ▼                                          complete(DeliveryVerificationInput)
"Invitá a custodia-yt-01@traspaso.com                        │
 como propietaria del canal"                    congela recipientIdentity.identifier
```

---

## Cambios de archivo

| Archivo | Acción | Qué |
|---|---|---|
| `packages/domain/src/entities/CustodyAccount.ts` | Nuevo | Entidad, factories, invariantes, ciclo de vida. |
| `packages/domain/src/entities/Listing.ts` | Modificar | `PlatformAccessRecord.custodyAccountId`; `registerPlatformAccess` lo exige; `handoverSteps(context?)`. |
| `packages/domain/src/entities/Operation.ts` | Modificar | `RecipientIdentity`, `declareRecipientIdentity`, `assertIsBuyer`, `DeliveryVerification`, `complete(data)`, `CustodyVerification.custodyAccountId`. |
| `packages/domain/src/strategies/IAssetStrategy.ts` | Modificar | `TransferContext`; firma de `getTransferSteps`. |
| `packages/domain/src/strategies/YouTubeStrategy.ts` | Modificar | Paso de opt-out + pasos nombrados. |
| `packages/domain/src/strategies/WebStrategy.ts` | Modificar | Nueva firma; nombra al destinatario. |
| `packages/domain/src/ports/Repositories.ts` | Modificar | `ICustodyAccountRepository`; `IListingRepository.findHeldBy`. |
| `packages/domain/src/use-cases/admin/CustodyAccountUseCases.ts` | Nuevo | ABM. |
| `packages/domain/src/use-cases/operation/DeclareRecipientIdentityUseCase.ts` | Nuevo | El comprador declara su cuenta receptora. |
| `.../listing/RegisterPlatformAccessUseCase.ts` | Modificar | Exige y valida la cuenta. |
| `.../operation/CompleteOperationUseCase.ts` | Modificar | Recibe y pasa la constancia de entrega. |
| `.../listing/GetListingDetailsUseCase.ts`, `GetMyListingsUseCase.ts` | Modificar | Resuelven el contexto. |
| `.../operation/GetOperationDetailsUseCase.ts` | Modificar | Expone `recipientIdentity` y `deliveryCheck`. |
| `packages/db/prisma/schema.prisma` | Modificar | Modelo `CustodyAccount` + 3 columnas. |
| `packages/db/prisma/migrations/<ts>_add_custody_accounts/` | Nuevo | Migración aditiva. |
| `packages/db/src/mappers/CustodyAccountMapper.ts` | Nuevo | |
| `packages/db/src/mappers/ListingMapper.ts` | Modificar | Proyecta la FK; `parseAcceso` la recibe. |
| `packages/db/src/mappers/OperationMapper.ts` | Modificar | `recipientIdentity`, `deliveryCheck`, `custodyAccountId` en custodia. |
| `packages/db/src/repositories/PrismaCustodyAccountRepository.ts` | Nuevo | |
| `packages/db/src/repositories/PrismaListingRepository.ts` | Modificar | `findHeldBy` + FK en `save`. |
| `packages/db/src/index.ts`, `prisma/seed.ts` | Modificar | Export; una cuenta de custodia de YouTube activa. |
| `packages/api-contract/src/index.ts` | Modificar | DTOs de cuenta, identidad receptora y entrega. |
| `apps/api/src/routes/me.ts`, `container.ts` | Modificar | Rutas del ABM, declaración del destino, entrega; cableado. |
| `apps/web/src/app/admin/cuentas/` | Nuevo | Pantalla del ABM. |
| `apps/web/src/components/PlatformAccessForm.tsx`, `app/operaciones/[id]/page.tsx`, `app/sistema/page.tsx` | Modificar | Selector de cuenta, tarea pendiente del comprador, formulario de entrega, sistema de diseño. |

---

## Plan de migración

Una migración, `add_custody_accounts`. Todo aditivo y nullable: ninguna fila existente se reescribe ni queda inválida.

```sql
CREATE TABLE "custody_accounts" (
  "id" TEXT PRIMARY KEY, "label" TEXT NOT NULL,
  "identifier" TEXT NOT NULL UNIQUE, "assetType" "AssetType" NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true, "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ON "custody_accounts" ("assetType", "isActive");

ALTER TABLE "listings"   ADD COLUMN "custodyAccountId" TEXT
  REFERENCES "custody_accounts"("id");
CREATE INDEX ON "listings" ("custodyAccountId");

ALTER TABLE "operations" ADD COLUMN "recipientIdentity" JSONB,
                         ADD COLUMN "deliveryCheck"     JSONB;
```

**Qué pasa con los `platformAccess` ya registrados: nada, y a propósito.** Quedan con `custodyAccountId` nulo. No se los apunta a la fila sembrada porque eso inventaría una constancia: diría que el activo se cedió a una cuenta que en ese momento no existía, y una constancia que miente es peor que ninguna —el mismo argumento con el que `revokePlatformAccess()` existe—.

Consecuencias, todas acotadas:
- `parseAcceso` acepta la constancia sin cuenta y la marca como **"cuenta sin asignar"**; el listing sigue siendo transferible, porque el plazo depende de `accessSince` y no de la cuenta.
- La pantalla de admin la muestra como pendiente. Se corrige volviendo a registrar el acceso con la cuenta elegida.
- **`registerPlatformAccess` exige la cuenta hacia adelante** (Decisión 3): el hueco no se agranda.

`make fresh` (`db:push` + seed) no lo nota. `make db-reset` aplica la migración y siembra una `CustodyAccount` de YouTube activa, más la asignación de esa cuenta en los listings sembrados que ya traen `platformAccess` — ahí sí es legítimo, porque la semilla escribe las dos cosas a la vez.

**Reversión:** `git revert` del código más una migración inversa que borra tres columnas y una tabla. Ninguna fila existente se modificó, así que no hay datos que restaurar.

---

## Estrategia de pruebas

| Capa | Qué prueba | Cómo |
|---|---|---|
| Dominio — entidad | `CustodyAccount`: `create` fija `isActive`, `reconstitute` no; `identifier` vacío rechazado; `deactivate(n>0)` rechazado; `assertCanHold` con el tipo equivocado. | Vitest puro, sin dobles. `tests/use-cases/custody/` nuevo. |
| Dominio — entidad | `Operation`: `declareRecipientIdentity` rechaza al vendedor, rechaza antes de `contract_pending` y después de `completed`; `complete()` rechaza sin destino declarado, sin `isPrimaryOwner` y sin `accessTransferred`; la constancia congela el identificador declarado. | Ampliar `tests/use-cases/operation/`. |
| Dominio — entidad | `Listing.registerPlatformAccess` sin `custodyAccountId` es ilegal. | Ampliar `tests/PlatformHandover.test.ts`. |
| Dominio — estrategias | Sin contexto, el texto genérico de hoy; con contexto, el identificador aparece **en `description` y en `instruction`**; el paso de opt-out va antes de la invitación. | Test por estrategia, sin dobles. |
| Dominio — use case | El ABM exige admin; `RegisterPlatformAccess` rechaza cuenta inexistente, inactiva o de otro tipo; `GetMyListings` resuelve la cuenta activa una sola vez para N listings. | Puertos mockeados, como todo el resto del dominio. |
| DB — integración | Ida y vuelta de `CustodyAccount`; la FK sobrevive al `save` del listing; `revokePlatformAccess` deja Json **y** columna en nulo; `findHeldBy` excluye los vendidos; `identifier` duplicado falla. | `packages/db/tests/integration.test.ts` contra base real, cada test creando sus propios datos con value objects tipados. |
| API | Las cinco rutas del ABM responden 403 a un no-admin. | Al estilo de las rutas ya cubiertas. |

TDD: primero el test en rojo por cada guarda nueva. La guarda que más importa es `complete()` sin constancia — es el criterio de éxito que da nombre al cambio.

---

## Matriz de amenazas

N/A — no hay ruteo dinámico, ni comandos de shell, ni subprocesos, ni automatización de VCS/PR, ni clasificación de archivos ejecutables, ni integración de procesos. Las rutas HTTP nuevas son declarativas y pasan por el mismo `assertIsAdmin` que las demás.

---

## Preguntas abiertas

- [ ] **Contradicción en la propuesta**: el *Enfoque §2* dice que el destino se declara "a partir de `contract_signed`" y la *Decisión 2* dice "declarable desde `contract_pending`". Este diseño toma `contract_pending`, porque las Decisiones son la ronda posterior y explícita del usuario. Queda anotado para que la spec no herede la frase vieja.
- [ ] **Tensión menor**: el *Alcance* pide "una fila de cuenta de custodia en la semilla" y la *Decisión 1* dice que el alta "no se deja en la semilla". Se leen como compatibles —la semilla siembra, el ABM da de alta en cualquier entorno— y el diseño hace las dos. Si el usuario quiso decir "sin fila sembrada", hay que sacarla.
- [ ] El `identifier` de la cuenta real de Google todavía no existe: la semilla necesita ese dato para ser verdadera. El código se puede escribir antes.
