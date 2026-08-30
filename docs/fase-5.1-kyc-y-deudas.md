# Fase 5.1 — Verificación de identidad y deudas del dominio

> **Estado**: ✅ Completa
> **Fecha**: Agosto 2026
> **Objetivo**: Cerrar el callejón sin salida del KYC y saldar las tres deudas abiertas del dominio.

---

## 🐞 El producto no cerraba para ningún usuario nuevo

`User.verifyKyc()` **solo se llamaba en los tests y en el seed**. No había use case, ni ruta, ni pantalla. Y el KYC bloquea tres acciones:

| Acción | Gate |
|---|---|
| Publicar un activo | `SubmitListingForReview` → `assertCanSign()` |
| Firmar el NDA de un listing confidencial | `SignNda` → `assertCanSign()` |
| Firmar el contrato de venta | `SignContract` → `assertCanSign()` |

Una persona se registraba, cargaba su canal, apretaba "Enviar a revisión" y recibía *"Debés verificar tu identidad"*. **No existía ningún lugar donde hacerlo.** Podía navegar y ofertar, nada más.

Había además un segundo impedimento: al registrarse solo se piden email, nombre y contraseña, así que `verifyKyc()` habría fallado igual por falta de DNI aunque algo lo hubiera llamado.

### Por qué 218 tests en verde no lo detectaron

El seed llama `verifyKyc()` a mano y **todos los helpers de test crean usuarios ya verificados**. Ninguna suite pasaba nunca por el camino de un usuario real.

Es una variante del mismo patrón que veníamos encontrando: mocks que tapaban un flujo, un cast que tapaba un tipo, un `include` que tapaba un archivo. Acá fueron **los fixtures tapando la ausencia de un camino**. Un fixture que construye un estado al que el producto no puede llegar oculta que no hay forma de llegar.

### La solución

`User.verificarIdentidad({ dni, phone, country })` valida la forma del documento —entre 7 y 11 dígitos, acepta puntos y guiones, guarda normalizado—, rechaza una segunda verificación con `InvalidStateError`, y recién entonces corre la invariante `verifyKyc()` que ya existía.

Se agregaron `VerifyIdentityUseCase`, `GetMyProfileUseCase`, `GET /me`, `POST /me/kyc`, la pantalla `/verificar` y un aviso en el layout.

**El aviso importa tanto como la pantalla**: sin él, alguien carga un activo entero y recién al enviarlo descubre que le falta verificarse.

`isKycVerified` se lee del repositorio **en cada request**, nunca de la cookie: cambia sin que cambie el token, así que una copia cacheada le seguiría mostrando el aviso a quien acaba de verificarse.

La verificación es manual: se comprueba la forma del documento, no su existencia real. Integrar un proveedor (Renaper, Didit) es trabajo de infraestructura detrás de un puerto.

---

## Deuda 1 — `payment_pending` era un estado fantasma

Figuraba en la union del dominio, en el enum de Prisma y en el contrato. **Ninguna transición lo producía.** Un lector del enum lo iba a interpretar como una etapa real del escrow.

`asset_in_custody` ya significa "esperando el pago"; no hacía falta un estado más. Se eliminó de los tres lugares con la migración `remove_payment_pending`.

Postgres no permite quitar un valor de un enum, así que la migración **recrea el tipo**. El `USING ("status"::text::"OperationStatus")` hace que, si alguna fila tuviera el valor eliminado, la migración **falle** en vez de corromper el dato en silencio.

---

## Deuda 2 — `findPublished(filters?: any)` no era solo un `any` feo

Al tiparlo apareció por qué importaba. El repositorio hacía esto:

```typescript
where: { status: "published", ...filters }
```

**Spread del objeto recibido directo dentro del `where` de Prisma.** Cualquier clave que llegara del cliente terminaba en la consulta. Como la ruta no exponía filtros nadie lo explotaba, pero el agujero estaba abierto esperando que alguien conectara el query string.

Ahora `ListingFilters` tiene forma declarada, el repositorio **traduce criterio por criterio** en vez de reenviar el objeto, y el schema de Fastify descarta lo que no esté en el contrato. Un test fija que `?sellerId=cualquiera` se ignore en lugar de filtrar.

De paso el mercado ganó filtros reales por tipo de activo y rango de precio, como enlaces con URL propia: se comparten, se indexan y funcionan sin JavaScript.

### Y un bug encontrado antes de cometerlo

`GET /listings` leía `listingRepo.findPublished()` **directo desde la ruta**, salteándose el filtrado blind que vivía dentro de `GetListingDetailsUseCase`. Era inofensivo solo porque el DTO no llevaba datos del activo — que es justo lo que la grilla necesitaba.

**El fix no fue parchear la ruta.** Una regla de visibilidad que vive dentro de un use case no está garantizada por el sistema: cualquier otro llamador se la saltea en silencio. Se movió a la entidad:

```typescript
listing.datosDelActivo(revelarConfidenciales)
  → { assetType, assetData, hiddenFields }
```

`GetListingDetailsUseCase` delega ahí y el nuevo `GetPublishedListingsUseCase` sirve la ruta. Dos tests HTTP fijan que ningún nombre de `hiddenFields` aparezca en `assetData`.

**Decisión de producto**: en la grilla los confidenciales no se revelan nunca, ni siquiera a quien firmó el NDA. Chequearlo por fila sería una consulta por listing, y explorar no es donde el comprador se compromete — el desbloqueo pertenece al detalle.

---

## Deuda 3 — La contraoferta: el `TODO` estaba mal planteado

La nota decía `CounterOffer >= current offer`. **Esa regla no es simétrica**:

```
Comprador ofrece   10.000
Vendedor contra    18.000   ✓ es >= 10.000
Comprador contra   12.000   ✗ NO es >= 18.000
```

El vendedor contraoferta **bajando** hacia el comprador y el comprador **subiendo** hacia el vendedor. Una sola comparación contra el precio sobre la mesa no puede servir a los dos. Implementarla tal cual habría bloqueado al vendedor por completo.

La regla correcta es **monótona por parte**: se compara contra la última propuesta *de la misma parte*.

```
Comprador  10.000
Vendedor   18.000   ✓ primera suya, libre
Comprador  13.000   ✓ supera sus 10.000
Vendedor   16.000   ✓ menor que sus 18.000
Comprador  15.000   ✓ supera sus 13.000
```

Distancia inicial 8.000; final 1.000. El rango se cierra solo.

### El argumento decisivo fue la terminación, no la equidad

`TIMEOUT` aparece en `OperationMachine` pero **nadie lo implementa**. Sin monotonía, dos partes pueden oscilar indefinidamente y la operación queda viva bloqueando el listing.

### El caso del NDA ya tenía salida

La objeción real era: el comprador firma el NDA en medio de la negociación, ve los datos reales, descubre algo malo y queda atado a una oferta hecha a ciegas.

No hizo falta ningún mecanismo nuevo. `cancel()` funciona hasta `contract_pending`, `CreateOfferUseCase` no impide una segunda oferta del mismo comprador, y el listing sigue en `published` hasta que alguien acepta. **Cancelar y volver a ofertar** es mejor que permitir bajar dentro de la misma negociación: es un acto explícito y deja el historial anterior intacto para auditoría.

Repetir el mismo monto también se rechaza: no aporta nada y solo alarga el ida y vuelta.

---

## Tests agregados

| Archivo | Tests | Cubre |
|---|---|---|
| `VerificacionIdentidad.test.ts` | 9 | Forma del documento, doble verificación, desbloqueo de la firma |
| `use-cases/auth/IdentidadUseCases.test.ts` | 8 | Que el id salga del actor y no del input |
| `DatosDelActivo.test.ts` | 6 | Que nunca se revele un campo no declarado público |
| `use-cases/listing/FiltrosDelMercado.test.ts` | 5 | Criterios, rango invertido, filtrado que no afecta al ocultamiento |
| `ConvergenciaNegociacion.test.ts` | 11 | Monotonía por parte, repetición, moneda, cierre del rango |

---

## Deuda técnica conocida

| Item | Prioridad | Descripción |
|------|-----------|-------------|
| Verificación de identidad manual | Alta | Se comprueba la forma del documento, no su existencia. Requiere un proveedor real detrás de un puerto. |
| Sin `TIMEOUT` de negociación | Media | La monotonía garantiza que el rango se cierre, pero nada cancela una operación abandonada. |
| Sin paginación en la cola de admin | Baja | Aceptable mientras el volumen sea bajo. |

---

## Siguiente paso

→ **Fase 6**: Avisos — que las partes se enteren de lo que pasa sin tener que mirar la pantalla.
