# Fase 4.1 — Unit of Work: atomicidad de la cascada multi-oferta

> **Estado**: ✅ Completa
> **Fecha**: Agosto 2026
> **Objetivo**: Hacer atómica la cascada híbrida de `AcceptOfferUseCase`, que hacía N escrituras sueltas sin transacción.

---

## El problema

`AcceptOfferUseCase` modifica varias filas en secuencia:

1. La operación aceptada pasa a `contract_pending` y se guarda.
2. Cada operación rival del mismo listing se cancela y se guarda, una por una.
3. El listing pasa a `in_operation` y se guarda.

Sin transacción, una falla en el paso 2 deja **una oferta aceptada conviviendo con ofertas rivales todavía vivas** — exactamente el estado que el modelo multi-oferta prohíbe. El vendedor quedaría comprometido con un comprador mientras los demás siguen creyendo que su oferta está en juego.

`grep transaction packages/db/src` no devolvía nada.

---

## La solución

### Puerto en el dominio

```typescript
// packages/domain/src/ports/IUnitOfWork.ts
export interface TransactionalRepositories {
    users: IUserRepository;
    listings: IListingRepository;
    operations: IOperationRepository;
    contracts: IContractRepository;
}

export interface IUnitOfWork {
    run<T>(work: (repos: TransactionalRepositories) => Promise<T>): Promise<T>;
}
```

Los repositorios transaccionales son **las mismas interfaces de siempre**: el dominio no distingue una escritura transaccional de una suelta, y no debería. Lo único que declara es la necesidad de que un bloque sea todo-o-nada.

### El use case ya no puede escribir por fuera

```typescript
export class AcceptOfferUseCase {
    constructor(private readonly uow: IUnitOfWork) {}
    // ...
}
```

Antes recibía `(operationRepo, listingRepo)`. Ahora recibe **solo** el Unit of Work, así que estructuralmente no tiene ningún repositorio suelto al que escribirle. La garantía no es un test: es el constructor.

### Adaptador Prisma

```typescript
export class PrismaUnitOfWork implements IUnitOfWork {
    async run<T>(work: (repos: TransactionalRepositories) => Promise<T>): Promise<T> {
        return prisma.$transaction(async (tx) => {
            return work({
                users: new PrismaUserRepository(tx),
                listings: new PrismaListingRepository(tx),
                operations: new PrismaOperationRepository(tx),
                contracts: new PrismaContractRepository(tx),
            });
        });
    }
}
```

Los cuatro repositorios pasaron a recibir el cliente por constructor, con el singleton como default:

```typescript
constructor(private readonly db: PrismaLike = prisma) {}
```

`PrismaLike` se define **estructuralmente**, no con el tipo nominal del cliente transaccional:

```typescript
export type PrismaLike = Pick<PrismaClient, "user" | "listing" | "operation" | "contract">;
```

Así el mismo repositorio acepta tanto el singleton como el cliente que entrega `$transaction`, sin casts ni uniones. Es lo mínimo que un repositorio necesita de Prisma, declarado explícitamente.

---

## Verificación: el test de rollback fue mutado

Un test de rollback que pasaría **también sin la transacción** no prueba nada. Antes de darlo por bueno se verificó por mutación: se corrió el mismo escenario con un Unit of Work que no usa `$transaction`.

| Implementación | Estado persistido de la oferta aceptada |
|---|---|
| **Sin** `$transaction` | `contract_pending` — quedó escrita, con la rival viva |
| **Con** `$transaction` | `offer_sent` — todo revertido |

El test depende del fix. Sin él falla.

---

## Tests

| Nivel | Archivo | Qué prueba |
|---|---|---|
| Dominio | `tests/use-cases/negotiation/AcceptOfferAtomicity.test.ts` | Que el use case pida **una** transacción y trabaje adentro. Un doble no puede probar rollback. |
| Integración | `packages/db/tests/unit-of-work.test.ts` | Rollback **real** contra Postgres, con inyección de fallas. |

El test de integración cubre tres casos: commit completo, rollback a mitad de la cascada, y que un rollback no deje comisiones calculadas a medias (`finalPrice` y `platformEarns` vuelven a `undefined`).

**Total del proyecto: 174 tests**, cero errores de tipos.

| Suite | Tests |
|---|---|
| `@marketplace/domain` | 134 |
| `@marketplace/db` — integración | 20 |
| `@marketplace/api` — HTTP + adaptador | 20 |

---

## Alcance deliberado

Solo `AcceptOfferUseCase` usa el Unit of Work. Los otros 17 use cases modifican **una sola entidad**, y envolverlos en una transacción agregaría ceremonia sin ganar nada: una escritura única ya es atómica en Postgres.

`SignContractUseCase` es el caso limítrofe — puede escribir el contrato y después la operación. Se dejó fuera a propósito: si falla la segunda escritura, el contrato queda firmado y la operación no avanza, que es un estado **recuperable** (reintentar la firma la completa). No es comparable a una oferta aceptada con rivales vivas, que es irrecuperable sin intervención manual.

---

## Siguiente paso

→ **Fase 5**: Frontend Next.js — flujos de buyer y seller sobre la API.

Antes conviene resolver la deuda declarada de la Fase 4: `POST /listings` devuelve 501 porque falta un factory `assetType → IAssetStrategy` en el dominio. Hoy el único mapeo en esa dirección es `ListingMapper.hydrateStrategy`, dentro del paquete de persistencia.
