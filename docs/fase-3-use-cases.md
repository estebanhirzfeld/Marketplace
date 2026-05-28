# Fase 3 — Application Services (Use Cases)

> **Estado**: ✅ Completa  
> **Fecha**: Mayo 2026  
> **Commit**: `feat: implement core domain use cases for listings, negotiations, contracts, and operations lifecycle management [fase 3]`

Se implementaron los **16 use cases** que orquestan los 4 flujos de negocio del marketplace. Cada use case coordina entidades y repositorios sin contener lógica de negocio propia — esa vive exclusivamente en las entidades (Tell, Don't Ask).

---

## 🎯 Objetivos cumplidos

- 16 use cases organizados en 4 módulos de negocio.
- 44 tests unitarios con repositorios mockeados.
- Validación de la cascada híbrida (cancelación multi-oferta).
- Auto-transición Operation al firmar contrato tripartito.
- Filtrado de datos confidenciales por NDA en listings blind.
- 2 transiciones nuevas en `Listing`: `markInOperation()` y `markSold()`.

---

## Estructura de carpetas

```
packages/domain/src/use-cases/
├── listing/
│   ├── CreateListingUseCase.ts
│   ├── SubmitListingForReviewUseCase.ts
│   ├── ApproveListingUseCase.ts
│   ├── RejectListingUseCase.ts
│   └── GetListingDetailsUseCase.ts
├── negotiation/
│   ├── CreateOfferUseCase.ts
│   ├── CounterOfferUseCase.ts
│   ├── AcceptOfferUseCase.ts
│   ├── CancelOperationUseCase.ts
│   └── GetSellerOffersUseCase.ts
├── contract/
│   ├── SignNdaUseCase.ts
│   └── SignContractUseCase.ts
└── operation/
    ├── InitiateTransferUseCase.ts
    ├── ConfirmCustodyUseCase.ts
    ├── ConfirmPaymentUseCase.ts
    └── CompleteOperationUseCase.ts
```

---

## Use cases por módulo

### Listing (5 use cases)

| Use Case | Descripción | Repositorios |
|----------|-------------|--------------|
| `CreateListingUseCase` | Crea un listing nuevo. Verifica que el seller existe. | `IListingRepository`, `IUserRepository` |
| `SubmitListingForReviewUseCase` | Envía un listing a revisión (draft/rejected → under_review). | `IListingRepository` |
| `ApproveListingUseCase` | Admin aprueba un listing (under_review → published). | `IListingRepository` |
| `RejectListingUseCase` | Admin rechaza un listing con motivo obligatorio. | `IListingRepository` |
| `GetListingDetailsUseCase` | Devuelve datos del listing. **Si es blind**, filtra campos confidenciales salvo que el buyer tenga NDA firmado. | `IListingRepository`, `IContractRepository` |

**`GetListingDetailsUseCase`** es el más complejo:
```typescript
// Si el listing es blind y el buyer NO firmó NDA:
// → Solo muestra campos públicos (definidos por la strategy)
// → Devuelve hiddenFields[] para que el frontend sepa qué blurrear

// Si firmó NDA → muestra todo
```

### Negotiation (5 use cases)

| Use Case | Descripción | Repositorios |
|----------|-------------|--------------|
| `CreateOfferUseCase` | Buyer crea una oferta. Valida que el listing esté publicado y que no sea su propio listing. | `IOperationRepository`, `IListingRepository` |
| `CounterOfferUseCase` | Contraoferta. La entidad valida turnos y estado. | `IOperationRepository` |
| `AcceptOfferUseCase` | Acepta la oferta actual. **Implementa cascada híbrida**. | `IOperationRepository`, `IListingRepository` |
| `CancelOperationUseCase` | Cancela una operación (solo antes de firmar contrato). | `IOperationRepository` |
| `GetSellerOffersUseCase` | Devuelve todas las operaciones activas de un listing (no canceladas, no completadas). | `IOperationRepository` |

**Cascada híbrida en `AcceptOfferUseCase`**:
```
1. Aceptar la oferta actual → Operation pasa a contract_pending
2. Buscar TODAS las operaciones del mismo Listing
3. Cancelar las que no sean la aceptada (y no estén ya canceladas)
4. Transicionar el Listing a in_operation
```

> Esto permite que múltiples buyers compitan con ofertas simultáneas, pero solo una llega a contrato.

### Contract (2 use cases)

| Use Case | Descripción | Repositorios |
|----------|-------------|--------------|
| `SignNdaUseCase` | Buyer firma NDA para acceder a datos confidenciales de un listing blind. Crea el contrato si no existe. | `IContractRepository`, `IListingRepository` |
| `SignContractUseCase` | Firma un contrato (cualquier rol). **Si es tripartito y queda fully signed → auto-transiciona la Operation a `contract_signed`**. | `IContractRepository`, `IOperationRepository` |

**Auto-transición en `SignContractUseCase`**:
```typescript
// Si el contrato es tripartito Y todas las partes firmaron:
if (contract.type === 'tripartite' && contract.isFullySigned()) {
    operation.signContract(); // → contract_signed
}
```

### Operation (4 use cases)

| Use Case | Descripción | Repositorios |
|----------|-------------|--------------|
| `InitiateTransferUseCase` | Seller inicia la transferencia del activo digital a la plataforma. | `IOperationRepository` |
| `ConfirmCustodyUseCase` | Plataforma confirma que tiene el activo en custodia. | `IOperationRepository` |
| `ConfirmPaymentUseCase` | Plataforma confirma que el buyer pagó. | `IOperationRepository` |
| `CompleteOperationUseCase` | Cierra la operación. **Marca el Listing como `sold`**. | `IOperationRepository`, `IListingRepository` |

**Flujo post-contrato completo**:
```
contract_signed → transfer_in_progress → asset_in_custody → payment_received → completed
                  (InitiateTransfer)     (ConfirmCustody)    (ConfirmPayment)   (Complete)
```

---

## Transiciones nuevas en `Listing`

Se agregaron 2 métodos a la entidad `Listing` para el ciclo post-negociación:

```typescript
listing.markInOperation();  // published → in_operation (cuando se acepta una oferta)
listing.markSold();         // in_operation → sold (cuando se completa la operación)
```

---

## Tests

```bash
# Solo tests de use cases (sin Docker)
make test-domain
# equivalente a: pnpm --filter @marketplace/domain test
```

### Archivos de test

| Archivo | Tests | Cubre |
|---------|-------|-------|
| `listing/ListingUseCases.test.ts` | 13 | Crear, submit, approve, reject, GetDetails con blind + NDA |
| `negotiation/NegotiationUseCases.test.ts` | 15 | Crear oferta, contraofertas, aceptar con cascada, cancelar, get offers |
| `contract/ContractUseCases.test.ts` | 7 | SignNDA (crear + firmar), SignContract con auto-transición |
| `operation/OperationUseCases.test.ts` | 9 | InitiateTransfer, ConfirmCustody, ConfirmPayment, Complete con markSold |

**Total: 44 tests unitarios** (repositorios mockeados con Vitest).

> Los tests validan tanto happy paths como errores: entidad no encontrada, estados inválidos, turnos incorrectos, etc.

---

## Patrón de los Use Cases

Todos siguen el mismo patrón simple:

```typescript
export class SomeUseCase {
    constructor(
        private readonly someRepo: ISomeRepository,
    ) {}

    async execute(input: SomeInput): Promise<void> {
        // 1. Buscar entidades
        // 2. Invocar métodos de dominio (Tell, Don't Ask)
        // 3. Persistir cambios
    }
}
```

> **Sin lógica de negocio en use cases**. Toda la validación de estado, turnos, y reglas vive en las entidades. El use case solo orquesta: buscar → decirle a la entidad qué hacer → guardar.

---

## Conteo total de tests del proyecto

| Paquete | Tests | Docker |
|---------|-------|--------|
| `@marketplace/domain` — unitarios entidad | 27 | ❌ |
| `@marketplace/domain` — unitarios use cases | 44 | ❌ |
| `@marketplace/db` — integración | 11 | ✅ |
| **Total** | **82** | |

---

## Deuda técnica conocida

| Item | Prioridad | Descripción |
|------|-----------|-------------|
| `findPublished(filters?: any)` | Media | Tipificar `ListingFilters` con criterios de búsqueda concretos |
| Error messages sin i18n | Baja | Los errores de dominio están hardcodeados en español |
| `GetListingDetailsUseCase` sin paginación | Baja | OK para la tesis, pero en producción los listings necesitan paginado |
| Falta `GetOperationDetailsUseCase` | Baja | Use case de lectura para que el buyer/seller vea el estado de su operación |

---

## Siguiente paso

→ **Fase 4**: API REST con Fastify — exponer los use cases como endpoints HTTP.
