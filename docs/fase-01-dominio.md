# Fase 1 — Capa de Dominio (`packages/domain`)

> **Estado**: ✅ Completa  
> **Fecha**: Abril 2026  
> **Paquete**: `@marketplace/domain`

Esta es la capa más importante de toda la arquitectura. Contiene la lógica de negocio **pura**: sin Fastify, sin PostgreSQL, sin ninguna dependencia de infraestructura. Si mañana cambiamos la base de datos o el framework web, esta capa no se toca.

---

## Estructura de carpetas

```
packages/domain/src/
├── entities/          ← Objetos con identidad e historia (User, Listing, etc.)
├── value-objects/     ← Objetos definidos por su valor, no por su ID
├── strategies/        ← Strategy Pattern: comportamiento variable por tipo de activo
├── machines/          ← Máquinas de estado XState (ciclos de vida)
├── ports/             ← Interfaces de repositorio (contratos que infra debe cumplir)
└── events/            ← Infraestructura de Domain Events (base)
```

---

## Conceptos clave que usamos (DDD)

### Entidad vs Value Object

- **Entidad**: se identifica por su ID. Si cambia su nombre, sigue siendo la misma entidad. Ejemplo: `User`.
- **Value Object**: se identifica por su valor. Dos `Money` de $100 USD son iguales sin importar cuál sea cuál. Inmutables, sin ID.

### Aggregate Roots y referencias por ID

Cada Aggregate (`User`, `Listing`, `Operation`) es independiente. **Entre sí se referencian solo por `UniqueEntityID`**, nunca por objeto completo. Esto evita grafos en memoria y acoplamientos de ciclo de vida.

```typescript
// ✅ Correcto — Operation guarda IDs, no entidades completas
interface OperationProps {
  buyerId: UniqueEntityID;
  listingId: UniqueEntityID;
}

// ❌ Incorrecto — nunca embeber una entidad dentro de otra entidad de otro aggregate
interface OperationProps {
  buyer: User;
  listing: Listing;
}
```

### `create()` vs `reconstitute()`

Todas las entidades tienen dos constructores estáticos:

```typescript
// Para entidades NUEVAS — aplica defaults seguros
User.create({ email, fullName, role })

// Para entidades que vienen de la DB — sin defaults, estado real
User.reconstitute(props, id, createdAt)
```

> ⚠️ **Importante para los repositorios en Fase 2**: siempre usar `reconstitute()` al hidratar desde la DB. Si usás `create()`, vas a pisar el estado real con defaults (ej: `isKycVerified: false`, `status: 'draft'`).

---

## Value Objects

### `UniqueEntityID`
Encapsula todos los IDs del sistema. Autogenera un UUID v4 (`globalThis.crypto.randomUUID()`) si no se provee uno. Garantiza comparación por valor con `.equals()`.

```typescript
const id = new UniqueEntityID();              // UUID autogenerado
const id = new UniqueEntityID('uuid-string'); // Reconstruyendo desde DB
```

### `Money`
**Nunca uses `number` para dinero**. Todos los montos se manejan con esta clase para evitar errores de punto flotante. Internamente guarda centavos (entero).

```typescript
const price = Money.fromFloat(1500.50);  // → 150050 centavos internamente
const price = Money.fromCents(150050);   // equivalente

price.getFloat();          // → 1500.50
price.getCents();          // → 150050
price.getPercentage(10);   // → Money de 150.05
price.addPercentage(10);   // → Money de 1650.55
price.add(otherMoney);     // → nuevo Money sumado
price.subtract(other);     // → nuevo Money restado (lanza si queda negativo)
```

### `Email`
Normaliza y valida el formato. Siempre en lowercase.

```typescript
const email = Email.create('Usuario@EJEMPLO.com');
email.getValue(); // → 'usuario@ejemplo.com'
```

---

## Entidades

### `Entity<T>` (base abstracta)

Todos los campos base de cualquier entidad. No se usa directamente.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | `UniqueEntityID` | Inmutable, autogenerado |
| `createdAt` | `Date` | Inmutable, autogenerado |
| `props` | `T` | Estado mutable de la entidad (acceso protegido) |

> `props` es `protected`, no `public`. Cada entidad expone getters explícitos para los campos que el mundo exterior necesita.

---

### `User`

| Campo | Tipo | Notas |
|-------|------|-------|
| `email` | `Email` | Value Object, normalizado |
| `fullName` | `string` | Requerido para KYC |
| `phone` | `string?` | Opcional |
| `country` | `string?` | Opcional |
| `dni` | `string?` | Requerido para verificación KYC |
| `role` | `UserRole` | Enum de `@marketplace/shared-types` |
| `isKycVerified` | `boolean` | Solo cambia via `verifyKyc()` |

Un usuario puede ser buyer y seller simultáneamente (el role lo decide `shared-types`).

```typescript
// Crear
const user = User.create({ email: Email.create('a@b.com'), fullName: 'Ana', role: UserRole.SELLER });

// Verificar KYC (requiere dni y fullName cargados)
user.verifyKyc(); // lanza si faltan campos
```

---

### `Listing`

Representa un activo digital publicado para venta.

| Campo | Tipo | Notas |
|-------|------|-------|
| `sellerId` | `UniqueEntityID` | Referencia al User vendedor |
| `assetStrategy` | `IAssetStrategy` | Estrategia del tipo de activo (ver abajo) |
| `status` | `ListingStatus` | Controlado por transiciones explícitas |
| `askingPrice` | `Money` | Precio pedido por el seller |
| `isBlind` | `boolean` | Si `true`, datos confidenciales requieren NDA |
| `publishedAt` | `Date?` | Se asigna al aprobar |
| `rejectionReason` | `string?` | Se asigna al rechazar |

**Ciclo de vida**:
```
draft → under_review → published → in_operation → sold
           ↓                ↑
        rejected    (si se cancela la operación)
           ↓
         draft (edita y reenvía)
```

```typescript
listing.submitForReview();     // draft/rejected → under_review
listing.approve();             // under_review → published
listing.reject('Motivo...');   // under_review → rejected
```

---

### `Operation`

Vincula a un buyer con un listing. Una operación comienza con una oferta y termina con la transferencia del activo y el pago. La plataforma actúa como **escrow del activo** (no del dinero): custodia el activo digital mientras se procesa el pago.

| Campo | Tipo | Notas |
|-------|------|-------|
| `listingId` | `UniqueEntityID` | Referencia al Listing |
| `buyerId` | `UniqueEntityID` | Referencia al User comprador |
| `sellerId` | `UniqueEntityID` | Referencia al User vendedor |
| `status` | `OperationStatus` | Controlado por transiciones |
| `offerPrice` | `Money` | Oferta inicial del buyer |
| `finalPrice` | `Money?` | Precio acordado al aceptar |
| `buyerCommission` | `Money?` | 5% del finalPrice — a cargo del buyer |
| `sellerCommission` | `Money?` | 5% del finalPrice — descontado al seller |
| `buyerPays` | `Money?` | Total que paga el buyer (finalPrice + 5%) |
| `sellerReceives` | `Money?` | Neto que recibe el seller (finalPrice - 5%) |
| `platformEarns` | `Money?` | Total comisión plataforma (5% + 5% = 10%) |
| `completedAt` | `Date?` | Timestamp de cierre |

**Modelo de comisión (split 5%/5%)**:
- El buyer paga `finalPrice + 5%` a la plataforma (transferencia bancaria)
- La plataforma retiene `5% buyer + 5% seller = 10%` total
- La plataforma paga al seller `finalPrice - 5%`

Ejemplo con `finalPrice = $2.000 USD`:
| Concepto | Monto |
|----------|-------|
| Buyer paga | $2.100 |
| Comisión buyer (5%) | $100 |
| Comisión seller (5%) | $100 |
| Seller recibe | $1.900 |
| Plataforma gana | $200 |

**Ciclo de vida**:
```
offer_sent → negotiating ↔ (contraofertas)
offer_sent / negotiating → contract_pending (seller acepta)
contract_pending → contract_signed (firman contrato tripartito)
contract_signed → transfer_in_progress (seller transfiere activo a plataforma)
transfer_in_progress → asset_in_custody (plataforma tiene el activo)
asset_in_custody → payment_received (buyer paga a plataforma)
payment_received → completed (plataforma paga seller + transfiere activo a buyer)
```

> Cancelación permitida hasta `contract_pending`. Después de firmar, ambas partes están comprometidas.

```typescript
operation.acceptOffer(Money.fromFloat(2000)); // → contract_pending, calcula comisión
operation.signContract();                     // → contract_signed
operation.initiateTransfer();                 // → transfer_in_progress
operation.confirmAssetCustody();              // → asset_in_custody
operation.confirmBuyerPayment();              // → payment_received
operation.complete();                         // → completed
operation.cancel();                           // → cancelled (solo antes de firmar)
```

> ⚠️ **Nota legal**: este modelo implica retención temporal de fondos de terceros. Para producción real, validar regulación PSP/BCRA. Para la tesis es aceptable como modelo teórico.


---

### `NDA`

Prerequisito obligatorio para que un buyer acceda a datos confidenciales de un listing con `isBlind: true`.

```typescript
const nda = NDA.create({ listingId, buyerId });
nda.sign('192.168.1.1');  // registra IP y timestamp
nda.isSigned;             // → true
```

---

### `Contract`

Contrato digital asociado a una operación. Puede ser `initial` (bilateral: seller + buyer) o `tripartite` (trilateral: + plataforma).

```typescript
const contract = Contract.create({ operationId, contractType: 'tripartite' });
contract.signProvider('seller');
contract.signProvider('buyer');
contract.signProvider('platform');
contract.isFullySigned(); // → true
```

---

## Strategy Pattern (tipos de activo)

El comportamiento de valuación, verificación y transferencia varía según el tipo de activo. En lugar de un `switch` gigante, cada tipo tiene su propia estrategia que implementa `IAssetStrategy`.

```typescript
interface IAssetStrategy {
  calculateEstimatedPrice(): Money;
  getVerifiableMetrics(): MetricKey[];
  getTransferSteps(): TransferStep[];
  getPublicFields(): string[];      // Visibles sin NDA
  getConfidentialFields(): string[]; // Solo con NDA firmado
}
```

### `YouTubeStrategy`
- **Valuación**: `revenueMensual × múltiplo (12-30)` ajustado por crecimiento, audiencia y si es "no-face content"
- **Verificación API**: suscriptores + revenue via YouTube Data API (OAuth)
- **Transferencia**: Brand Account → plataforma como propietario temporal → buyer

### `WebStrategy`
- **Valuación**: `revenueMensual × 30` + bonus +10% si DA ≥ 40
- **Verificación API**: sesiones + revenue via Google Search Console (OAuth)
- **Transferencia**: EPP del dominio, migración de hosting y cuentas afiliadas

### `SocialStrategy` (Instagram / TikTok)
- **Valuación**: `followers × CPF × ajuste por engagement`. IG CPF = $0.01, TikTok CPF = $0.005
- **Verificación API**: solo followers (engagement no es verificable por API de forma confiable)
- **Transferencia**: credenciales directas via correo neutro

---

## Máquinas de Estado (XState)

Las máquinas definen las transiciones **válidas** de forma matemáticamente garantizada. Son la fuente de verdad del ciclo de vida de cada entidad.

- `listingMachine` → estados y transiciones de un `Listing`
- `operationMachine` → estados y transiciones de una `Operation`

> Las entidades también tienen métodos de transición (ej: `listing.approve()`). Esos métodos tienen sus propias guardas de negocio (lanzan error si el estado no es válido). La máquina XState se usará para orquestar la UI y el flujo de la API en fases posteriores.

---

## Ports (Interfaces de Repositorio)

Definen **qué** necesita el dominio para persistir datos, sin saber **cómo** se implementa.

```typescript
interface IListingRepository {
  findById(id: string): Promise<Listing | null>;
  findPublished(filters?: any): Promise<Listing[]>;
  save(listing: Listing): Promise<void>;
}
```

La implementación real (con Drizzle/Prisma + PostgreSQL) va en `apps/api/src/infra/` en la **Fase 2**.

---

## Tests

```bash
pnpm --filter @marketplace/domain test
```

Archivos en `packages/domain/tests/`:

| Test | Cubre |
|------|-------|
| `Money.test.ts` | Aritmética, porcentajes, validaciones |
| `Operation.test.ts` | Comisión split 5%/5%, ciclo de vida completo, transiciones inválidas, cancelación |

---

## Deuda técnica conocida

| Item | Prioridad | Descripción |
|------|-----------|-------------|
| `captureMetricsSnapshot()` en `YouTubeStrategy` | Alta | Requiere token OAuth real de YouTube Data API |
| `SocialStrategy` sin ajuste geográfico | Baja | La audiencia geo afecta el CPF; pendiente datos de benchmark |
| `WebStrategy` sin tipo de monetización en valuación | Baja | SaaS vale más que AdSense; refinar con datos reales |
| `findPublished(filters?: any)` | Media | Tipificar `ListingFilters` antes de implementar el repositorio |
| Regulación PSP/BCRA para retención de fondos | Media | Validar requisitos legales para actuar como intermediario de pagos en producción |
