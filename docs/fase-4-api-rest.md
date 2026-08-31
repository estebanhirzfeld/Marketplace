# Fase 4 — API REST + Composition Root + AuthN/AuthZ

> **Estado**: ✅ Completa
> **Fecha**: Agosto 2026
> **Objetivo**: Exponer los 16 use cases como endpoints HTTP con Fastify, introduciendo el composition root que hoy no existe y cerrando el agujero de autorización del dominio.

---

## Por qué esta fase no es "solo endpoints"

Los use cases de la Fase 3 fueron escritos asumiendo un **llamador confiable**. Hoy eso es cierto porque el único llamador son los tests. En el momento en que exista un endpoint HTTP, deja de serlo:

| Evidencia | Problema |
|-----------|----------|
| `ApproveListingUseCase.execute(listingId)` | Acción exclusiva de admin que ni siquiera recibe quién la ejecuta. |
| `SignContractUseCase.execute(contractId, role, ipAddress)` | El **llamador elige el rol de firma**. Cualquiera podría firmar como `platform`. |
| `CreateOfferUseCase.execute({ buyerId, ... })` | El `buyerId` viene del input. Nada verifica que el requester sea ese buyer. |
| `AcceptOfferUseCase.execute(operationId, by)` | El llamador declara si es `buyer` o `seller`. Nada lo verifica contra la operación. |
| `CancelOperationUseCase.execute(operationId)` | Cualquiera puede cancelar la operación de cualquiera. |

Además falta la infraestructura mínima para conectar todo: **no existe composition root**. Ningún archivo instancia los repositorios de Prisma y los inyecta en los use cases.

---

## Decisiones de arquitectura

### 1. La autorización vive en el dominio

Se adopta **actor explícito en el use case**.

- **Autenticación** (*quién sos*) → capa HTTP. Un `preHandler` de Fastify valida el JWT y adjunta el actor al request.
- **Autorización** (*podés hacer esto*) → dominio. "Solo el buyer de esta operación acepta la oferta" es una regla de negocio, no un detalle de transporte.

```typescript
// packages/domain/src/ports/Actor.ts
export interface Actor {
    id: string;
    role: UserRole;
}
```

Los use cases quedan seguros ante *cualquier* llamador — un seed, un cron, un test de integración, o una futura capa GraphQL. Poner guards en Fastify los habría dejado inseguros fuera del request HTTP.

### 2. `admin` es el único rol; buyer y seller son posiciones en una relación

El código **ya funciona así** y nadie lo había hecho explícito:

- Ninguna línea del dominio lee `User.role`.
- `CreateOfferUseCase.ts:26` valida "no podés ofertar sobre tu propio listing" comparando `sellerId` contra `buyerId`, sin mirar el rol.
- El esquema Prisma da a un mismo `User` las relaciones `operationsAsBuyer` **y** `operationsAsSeller` en simultáneo.

Entonces: creás un listing → sos su seller. Ofertás → sos su buyer. `role` solo separa admin de usuario común.

**Resultado**: 11 de 16 use cases se autorizan por **pertenencia**, 5 por rol admin. Sin migración de base de datos — el enum `UserRole` queda intacto, cambia qué se consulta.

#### El caso de las ofertas múltiples

Un listing recibe varias ofertas simultáneas, así que **sí, hay varios buyers a la vez sobre el mismo listing**. Lejos de romper el modelo, este es el caso que lo justifica.

"Buyer" no es un atributo del usuario: es su posición en **una operación concreta**. Un usuario no es *un buyer*, es *el buyer de la Operation #3*. La distinción no es semántica, tiene consecuencias de seguridad:

| Modelo | Qué autoriza `AcceptOffer` |
|---|---|
| Rol global (`actor.role === 'buyer'`) | **Cualquier** buyer del sistema sobre **cualquier** operación. Insuficiente: haría falta igual un chequeo de pertenencia. |
| Pertenencia (`operation.partyFor(actor.id)`) | Solo el buyer **de esa** operación. Suficiente por sí solo. |

Con cinco buyers compitiendo por un listing, `partyFor()` le devuelve `'buyer'` a cada uno **en su propia operación** y lanza `ForbiddenError` en las otras cuatro. Un chequeo de rol no podría distinguirlas: le daría permiso al buyer A para cancelar la oferta del buyer B.

El esquema ya soporta esta multiplicidad de forma explícita:

- `IOperationRepository.findByListing(listingId)` devuelve **N** operaciones por listing.
- `Contract` tiene `@@unique([listingId, signerId, type])` — cada buyer firma **su propio** `buyer_nda` sobre el mismo listing.
- `AcceptOfferUseCase` recorre todas las operaciones del listing para ejecutar la cascada de cancelación.

**Efecto secundario deseable**: `GetSellerOffers` se autoriza por dueño del listing, no por rol. Un buyer no puede listar las ofertas rivales, lo que preserva el carácter de **licitación a sobre cerrado** de la negociación. Con un chequeo de rol, cualquier buyer habría podido espiar las ofertas de los demás.

### 3. KYC custodia los actos con valor legal

`isKycVerified` deja de ser un campo huérfano y bloquea tres acciones: **publicar un listing** y **firmar cualquier contrato** (NDA incluido).

Navegar, crear un listing en `draft`, ofertar y negociar quedan abiertos. La regla es defendible en una sola frase: *el KYC custodia instrumentos legales, no la navegación.*

Consecuencia querida: para ver los datos confidenciales de un listing blind hace falta NDA, y el NDA exige KYC. El KYC llega temprano para el buyer serio — que es lo correcto, porque estás por mostrarle datos confidenciales de un tercero.

### 4. La plataforma firma automáticamente; la custodia sigue siendo un acto operativo

La firma de `platform` es automática en los tres tipos de contrato. **No es un gate de control: es un registro de auditoría** con timestamp de cuándo la plataforma se volvió parte.

El punto de control humano se mueve a `ConfirmCustody`, que es donde la plataforma efectivamente arriesga algo. La plataforma no compromete nada hasta que tiene el activo en la mano.

Queda deliberadamente abierto si el proceso de **cambiar el owner/holding de la cuenta** puede automatizarse o será manual. Es una incógnita operativa, no de diseño, y se resuelve en la Fase 6 junto con la integración de la YouTube Data API. `YouTubeStrategy.getTransferSteps()` ya marca los pasos 3 y 8 como `automated: true`, pero `captureMetricsSnapshot()` hoy lanza excepción — esa automatización es aspiracional hasta que exista el token OAuth.

---

## 🐞 Bug encontrado: los listings blind nunca se desbloquean

Detectado al analizar la decisión 4. **Es un bug de producción, no una decisión de diseño.**

| Paso | Evidencia |
|---|---|
| `Contract.createBuyerNda()` | Crea dos firmas: `buyer` y `platform`, ambas en `false`. |
| `SignNdaUseCase.ts:40` | Firma **solo** `'buyer'`. Nadie firma como `platform`. |
| `GetListingDetailsUseCase.ts:80` | Desbloquea los datos exigiendo `contract.isFullySigned()`, que requiere *todas* las firmas. |

El buyer firma el NDA y sigue viendo los datos filtrados. **Siempre.**

Los 44 tests de la Fase 3 no lo detectan porque mockean el `contractRepo` y devuelven un contrato ya firmado — el test nunca ejecuta el camino real de `SignNda` → `GetListingDetails`.

La decisión 4 lo arregla: `SignNdaUseCase` firma la parte del actor **y** llama a `signAsPlatform()`. Se agrega además un test de integración que recorre el flujo completo sin mocks.

---

## 🐞 Bug encontrado: `signedAt` volvía de la base como string, no como `Date`

Detectado al destrabar el typecheck de `packages/db`. **Un cast estaba ocultando un bug de runtime.**

`ContractMapper.toDomain` leía la columna Json con `raw.signatures as Signature[]`. Prisma serializa los `Date` a string ISO dentro de una columna Json, así que el cast declaraba `signedAt: Date` sobre lo que en realidad era un `string`. Cualquier llamada a un método de `Date` sobre esa propiedad explotaba en runtime, y el compilador no podía avisar porque el cast lo había silenciado.

`OperationMapper` tenía el mismo agujero (`raw.negotiations as any[]`), pero por casualidad revivía bien la fecha con `new Date(n.proposedAt)`.

**Fix**: ambos mappers pasaron a usar parsers que validan la forma, rechazan valores desconocidos de `PartyRole` y `NegotiatingParty`, y reviven las fechas explícitamente. Se agregaron serializadores para el camino de escritura, lo que además eliminó los `as any` que tapaban otro hecho: `InputJsonValue` de Prisma **no acepta `Date`**.

**Lección para la defensa**: una columna Json es una frontera de serialización y hay que tratarla como tal — parsear al leer, serializar al escribir, nunca afirmar con un cast. `packages/db/src` quedó con **cero `as any`**.

### Otros arreglos de tipos del mismo barrido

| Problema | Fix |
|---|---|
| `src/index.ts` y los 4 mappers importaban de `../generated/prisma`, que no tiene `index.ts` | Apuntan a `../generated/prisma/client`, el entry real de Prisma v7 |
| `IAssetStrategy.toJSON()` declaraba `assetType: string`, ensanchando un dato que la strategy conoce exacto | Devuelve `AssetType`. Sin cast: Prisma v7 genera los enums como unión de literales, no como enum nominal |
| Puerto de Postgres en conflicto con otro proyecto | Movido a **5434**. La colisión daba `28P01 password authentication failed` en vez de "connection refused", porque respondía *otro* Postgres |

---

## Bloqueantes previos descubiertos en el código

### 1. `User` no tiene credenciales

`UserProps` es `{ email, fullName, phone, country, dni, role, isKycVerified }`. **No hay password hash ni ningún mecanismo de credencial.** Sin esto no hay login posible.

### 2. Todos los errores de dominio son `Error` genérico

Cada `throw` del dominio es `new Error('mensaje en español')`. La API no puede distinguir un 404 de un 409 de un 403 sin parsear strings.

### 3. `Operation` no expone a sus partes

`Operation` tiene getters de `status`, `finalPrice`, comisiones y negociaciones, pero **ninguno de `buyerId` / `sellerId`**. Para resolver "¿este actor es parte de esta operación?" sin romper Tell-Don't-Ask, la entidad debe responder la pregunta ella misma con `partyFor(actorId)`.

---

## Alcance

### Dentro

- Taxonomía de errores de dominio + mapeo a códigos HTTP.
- Credenciales de usuario (hash) y endpoints de registro/login con JWT.
- `Actor` como puerto de dominio; migración de las 16 firmas de use case.
- Métodos de pertenencia en las entidades: `Listing.isOwnedBy()`, `Operation.partyFor()`, `User.assertCanSign()`, `Contract.signAsPlatform()`.
- Fix del bug de listings blind.
- Composition root en `apps/api`.
- Endpoints HTTP para los 4 flujos + validación de payloads.
- Tests de integración HTTP con `fastify.inject()`.

### Fuera

- Transaccionalidad de la cascada multi-oferta → **Fase 4.1**.
- Frontend → Fase 5.
- Firma electrónica real, YouTube Data API y automatización de la transferencia de owner → Fase 6.
- Refresh tokens, rate limiting, CORS de producción, observabilidad.

---

## Tareas (orden TDD estricto)

Cada bloque arranca por el test que falla.

### Bloque A — Errores tipados de dominio ✅

1. ✅ Test: cada error de dominio expone un `code` estable y es distinguible por tipo.
2. ✅ Crear `packages/domain/src/errors/DomainError.ts`: `DomainError` base + `NotFoundError`, `ForbiddenError`, `InvalidStateError`, `ValidationError`.
3. ✅ Reemplazar los `throw new Error(...)` de entidades y use cases, conservando los mensajes en español.
4. ✅ Fijar la clasificación con `tests/errors/ErrorClassification.test.ts`.

**Resultado**: 40 de 41 `throw` migrados en 21 archivos. Los mensajes se preservaron intactos, así que las 29 aserciones `toThrow('mensaje')` existentes siguen pasando sin tocarlas. Suite del dominio: **91 tests en verde** (71 previos + 20 nuevos).

Queda deliberadamente como `Error` crudo el único `throw` que no expresa una regla de negocio: `YouTubeStrategy.captureMetricsSnapshot()`, que es un placeholder de funcionalidad no implementada.

**Mapeo de la clasificación** — cada tipo determina un status HTTP, por eso `ErrorClassification.test.ts` la fija con casos reales:

| Tipo | HTTP | Criterio |
|---|---|---|
| `NotFoundError` | 404 | La entidad pedida no existe. |
| `ForbiddenError` | 403 | El actor no tiene lugar en esta relación — nunca podrá, sin importar el estado. |
| `InvalidStateError` | 409 | La acción es válida, pero no desde el estado actual. Incluye "no es tu turno". |
| `ValidationError` | 400 | Los datos recibidos violan una invariante. |

La distinción entre 403 y 409 en la negociación es deliberada: *no ser parte* de la operación es `Forbidden`; *ser parte pero fuera de turno* es `InvalidState`.

### Bloque B — Identidad y credenciales ✅

5. ✅ `Password` value object con la política de fortaleza.
6. ✅ `passwordHash` en `UserProps` y el puerto `IPasswordHasher`.
7. ✅ Migración Prisma `add_password_hash`. `UserMapper` y seed actualizados.
8. ✅ `BcryptPasswordHasher` en `apps/api` (adaptador — nunca en dominio).
9. ✅ `RegisterUserUseCase` y `LoginUseCase`. Devuelven el actor, no el JWT.
10. ✅ `ports/Actor.ts` y `User.assertCanSign()` — adelantados del Bloque C porque `LoginUseCase` ya necesita el Actor.

**Resultado**: **124 tests en verde** (108 dominio + 11 integración + 5 adaptador). Typecheck limpio en los tres paquetes.

#### Desvío del plan: la política vive en un VO, no en `User.setPassword()`

El plan original decía `User.setPassword()`. No se hizo así. Hashear es asíncrono e infraestructura, así que un `setPassword` en la entidad la obligaría a depender del puerto del hasher y a volver todos sus métodos `async`, rompiendo su pureza.

La solución sigue el precedente que ya existía con `Email`: un value object valida la cadena cruda.

| Pieza | Responsabilidad | Capa |
|---|---|---|
| `Password` (VO) | Política de fortaleza sobre el texto plano | Dominio puro |
| `IPasswordHasher` | Hashear y comparar | Puerto |
| `BcryptPasswordHasher` | bcrypt, 12 rondas | `apps/api` |
| `User.passwordHash` | Guardar el hash, nunca el texto plano | Dominio |

La garantía que da el VO: **una contraseña débil no puede llegar al hasher**, porque si tenés una instancia de `Password` ya cumple la política.

A diferencia de `Email`, `Password` **no** hace `trim()` ni `toLowerCase()`: en una contraseña cada carácter es significativo y normalizarla rompería el login contra el hash guardado.

#### Decisiones de seguridad tomadas

- **`LoginUseCase` devuelve el `Actor`, no un JWT.** Emitir y firmar el token es detalle de transporte.
- **Mismo mensaje para "email inexistente" y "contraseña incorrecta".** Distinguirlos permitiría enumerar qué emails están registrados probando el login. Hay un test que lo fija comparando ambos mensajes.
- **12 rondas de bcrypt.** Cada ronda adicional duplica el trabajo; es el equilibrio habitual entre resistencia a fuerza bruta y latencia de login.
- **`bcryptjs` en lugar de `bcrypt`**: JavaScript puro, sin compilación de binarios nativos en el monorepo. Es más lento, lo que en un hasher no es un defecto.
- La contraseña de cada usuario del seed es su propio correo, así que quien prueba la aplicación la lee en la misma pantalla de ingreso. El seed las hashea al sembrar con las mismas doce rondas que usa la API.

### Bloque C — Pertenencia y KYC en las entidades ✅

10. ✅ `Operation.partyFor(actorId)` devuelve `'buyer' | 'seller'` y lanza `ForbiddenError` si el actor no es parte.
11. ✅ `Listing.isOwnedBy()` y `assertOwnedBy()`.
12. ✅ `User.assertCanSign()` lanza si `isKycVerified` es `false`.
13. ✅ `Contract.signAsPlatform()` firma el rol `platform` con `'system'` como IP.
14. ✅ Implementados, más `Operation.assertIsSeller()` y `assertIsAdmin(actor)`.

### Bloque D — Actor y migración de firmas ✅

15. ✅ `ports/Actor.ts` (adelantado en el Bloque B).
16. ✅ Migradas las 16 firmas según la tabla de abajo, con un test de autorización negativo **antes** de cada cambio.
17. ✅ Eliminado el parámetro `role` de `SignContractUseCase`: se deriva del actor contra la operación.
18. ✅ Eliminado `buyerId` del input de `CreateOfferUseCase` y `SignNdaUseCase`: sale del actor.
19. ✅ Inyectado `IUserRepository` en los tres use cases con gate de KYC. El estado de KYC se lee del repositorio, **no del JWT** — un token emitido antes de la verificación quedaría desactualizado.

**Resultado**: **148 tests en verde** (132 dominio + 11 integración + 5 adaptador). Typecheck limpio en los tres paquetes.

#### Punto ciego de tooling encontrado

`packages/domain/tsconfig.json` incluía solo `src/**/*`, así que **los tests nunca se typecheckeaban**. Al migrar las firmas, `tsc` salía limpio mientras 32 tests fallaban en runtime. Es el mismo defecto que tenía `packages/db` con `prisma/seed.ts`. Ambos `include` ahora cubren `tests/**/*`.

Con los tests dentro del typecheck, los 58 errores de compilación funcionaron como lista de trabajo exacta para la migración — mucho más preciso que leer fallas de runtime.

#### Assertions que codificaban el bug

`ContractUseCases.test.ts` tenía `expect(nda.hasSignedBy('platform')).toBe(false)`. El test **documentaba el defecto como si fuera el comportamiento esperado**. Y `ListingUseCases.test.ts` firmaba `platform` a mano para que el NDA quedara completo, compensando en el test lo que el código de producción no hacía.

Lección para la defensa: un test verde no prueba que el comportamiento sea correcto, solo que coincide con lo que alguien escribió que esperaba.

### Bloque E — Fix del bug de listings blind ✅

20. ✅ Test de integración sin mocks: buyer con KYC firma NDA sobre un listing blind → `GetListingDetails` devuelve los campos confidenciales y `hiddenFields` vacío.
21. ✅ `SignNdaUseCase` firma la parte del actor y llama a `signAsPlatform()`.

### Bloque F — Composition root ✅

22. ✅ `apps/api/src/container.ts`: instancia repositorios Prisma y cablea los 16 use cases. Sin framework de DI — construcción explícita.
23. ✅ Plugin `authenticate` y `authenticateOptional`: verifica el JWT y adjunta `req.actor`.
24. ✅ Error handler global: `DomainError` → status HTTP.

### Bloque G — Endpoints ✅

25. ✅ Por cada ruta: test con `fastify.inject()` (200 feliz + 401 sin token + 403 actor equivocado) y después la ruta.
26. ✅ Schemas de validación de body/params en cada endpoint.

---

**Resultado final de la fase**: **169 tests en verde**, cero errores de tipos en los tres paquetes.

| Suite | Tests | Requiere DB |
|---|---|---|
| `@marketplace/domain` | 132 | ❌ |
| `@marketplace/db` — integración | 17 | ✅ |
| `@marketplace/api` — HTTP + adaptador | 20 | ✅ |
| **Total** | **169** | |

#### Interferencia entre suites de integración

Al agregar un segundo archivo de tests contra la misma base, fallaron tests que antes pasaban. Vitest corre los archivos **en paralelo** y cada uno trunca las tablas en su `beforeEach`, así que un archivo borraba los datos de otro a mitad de test. Las fallas parecían bugs de dominio (`Listing no encontrado`) pero eran interferencia. Se resolvió con `fileParallelism: false` en `packages/db` y `apps/api`.

#### Deuda saldada: `POST /listings`

El endpoint devolvía **501** porque crear un listing por HTTP requiere construir una `IAssetStrategy` desde JSON, y ese factory no existía en el dominio. Se resolvió con `createAssetStrategy()` en `packages/domain/src/strategies/AssetStrategyFactory.ts` — ver la sección siguiente.

---

## Factory de strategies: `createAssetStrategy`

El mapeo `assetType → IAssetStrategy` vivía **solo** dentro de `ListingMapper.hydrateStrategy`, en el paquete de persistencia y en un único sentido (base → dominio). Eso dejaba a la capa HTTP sin forma de crear un listing.

Saber qué tipos de activo existen y qué campos requiere cada uno es **regla de negocio**, no detalle de persistencia. El factory se movió al dominio y `ListingMapper` ahora delega en él, eliminando la duplicación.

### La simetría es el contrato

`createAssetStrategy()` es la contraparte exacta de `IAssetStrategy.toJSON()`. Los tests lo fijan como propiedad de round-trip, para las cuatro variantes de activo:

```typescript
const json = original.toJSON();
const reconstruida = createAssetStrategy(json.assetType, json.assetData);

expect(reconstruida.toJSON()).toEqual(json);
expect(reconstruida.calculateEstimatedPrice().getCents())
    .toBe(original.calculateEstimatedPrice().getCents());
```

Que el precio estimado coincida es más fuerte que comparar el JSON: prueba que la strategy quedó funcionalmente equivalente, no solo con los mismos campos.

### Validación de verdad, no confianza en la forma

El factory recibe datos de **dos orígenes con distinta confianza**: filas de la base propia y bodies de requests ajenos. Se decidió validar los dos con el mismo rigor en vez de tener dos caminos: cada campo se lee con un helper que verifica tipo y lanza `ValidationError` nombrando el campo que falla.

`CreateListingUseCase` pasó a recibir `{ assetType, assetData }` en lugar de una `IAssetStrategy` ya construida. Así la capa HTTP solo reenvía el body y toda la validación del activo queda del lado del dominio.

En el endpoint, el schema de Fastify valida `assetData` únicamente como `object`: su forma real depende del tipo de activo, y eso lo sabe el factory. Un `assetType` desconocido o un campo faltante salen como **400** con el nombre del campo en el mensaje.

---

## Migración de firmas y reglas de autorización

| Use case | Firma objetivo | Regla |
|---|---|---|
| `CreateListing` | `execute(input, actor)` | Autenticado. `sellerId` sale del actor |
| `SubmitListingForReview` | `execute(listingId, actor)` | Dueño del listing **+ KYC** |
| `ApproveListing` | `execute(listingId, actor)` | admin |
| `RejectListing` | `execute(listingId, reason, actor)` | admin |
| `GetListingDetails` | `execute(listingId, actor?)` | Pública; el actor opcional afecta el filtrado blind |
| `CreateOffer` | `execute({ listingId, offerPrice }, actor)` | Autenticado, no dueño del listing |
| `CounterOffer` | `execute(input, actor)` | `operation.partyFor(actor.id)` reemplaza el `by` declarado |
| `AcceptOffer` | `execute(operationId, actor)` | `operation.partyFor(actor.id)` deriva el `by` |
| `CancelOperation` | `execute(operationId, actor)` | `operation.partyFor(actor.id)` |
| `GetSellerOffers` | `execute(listingId, actor)` | Dueño del listing |
| `SignNda` | `execute(listingId, ip, actor)` | Autenticado **+ KYC**. El `signerId` sale del actor |
| `SignContract` | `execute(contractId, ip, actor)` | Parte del contrato **+ KYC**. El rol se **deriva**, no se recibe |
| `InitiateTransfer` | `execute(operationId, actor)` | Seller de la operación |
| `ConfirmCustody` | `execute(operationId, actor)` | admin — **punto de control humano del escrow** |
| `ConfirmPayment` | `execute(operationId, actor)` | admin |
| `CompleteOperation` | `execute(operationId, actor)` | admin |

---

## Endpoints

| Método | Ruta | Use case | Autorización |
|---|---|---|---|
| `POST` | `/auth/register` | `RegisterUser` | Pública |
| `POST` | `/auth/login` | `Login` | Pública |
| `GET` | `/listings` | `findPublished` | Pública |
| `GET` | `/listings/:id` | `GetListingDetails` | Opcional (afecta el filtrado blind) |
| `POST` | `/listings` | `CreateListing` | Autenticado |
| `POST` | `/listings/:id/submit` | `SubmitListingForReview` | Dueño + KYC |
| `POST` | `/listings/:id/approve` | `ApproveListing` | admin |
| `POST` | `/listings/:id/reject` | `RejectListing` | admin |
| `GET` | `/listings/:id/offers` | `GetSellerOffers` | Dueño |
| `POST` | `/listings/:id/nda` | `SignNda` | Autenticado + KYC |
| `POST` | `/listings/:id/offers` | `CreateOffer` | Autenticado, no dueño |
| `POST` | `/operations/:id/counter` | `CounterOffer` | Parte |
| `POST` | `/operations/:id/accept` | `AcceptOffer` | Parte |
| `POST` | `/operations/:id/cancel` | `CancelOperation` | Parte |
| `POST` | `/operations/:id/transfer` | `InitiateTransfer` | Seller |
| `POST` | `/operations/:id/custody` | `ConfirmCustody` | admin |
| `POST` | `/operations/:id/payment` | `ConfirmPayment` | admin |
| `POST` | `/operations/:id/complete` | `CompleteOperation` | admin |
| `POST` | `/contracts/:id/sign` | `SignContract` | Parte + KYC |

Mapeo de errores: `NotFoundError` → 404, `ForbiddenError` → 403, `InvalidStateError` → 409, `ValidationError` → 400, sin token → 401.

---

## Criterios de aceptación

- Ningún use case acepta una identidad declarada por el llamador; toda identidad se deriva del `Actor`.
- El parámetro `role` desaparece de `SignContractUseCase`.
- Los 82 tests existentes siguen pasando tras la migración de firmas.
- Un test de autorización negativo por cada use case (actor equivocado → `ForbiddenError`).
- Test de integración **sin mocks** que prueba el desbloqueo real de un listing blind.
- Tests de integración HTTP con `fastify.inject()` cubriendo 200 / 401 / 403 por endpoint.
- `apps/api` levanta y sirve el flujo completo end-to-end contra la DB de Docker.

---

## Siguiente paso

→ **Fase 4.1**: Unit of Work / `$transaction` — hacer atómica la cascada multi-oferta de `AcceptOfferUseCase`, que hoy hace N `save()` secuenciales sin transacción.
