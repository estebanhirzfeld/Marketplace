# Fase 2.2 — Tests de Negociación con Persistencia

> **Estado**: ✅ Completa  
> **Fecha**: Abril 2026  
> **Commit**: `feat: implement negotiation with count offers + tests [fase 2.2 test]`

Esta sub-fase extendió la entidad `Operation` con negociación bidireccional (contraofertas) y validó el round-trip completo del historial de negociaciones a través de Prisma.

---

## 🎯 Objetivos cumplidos

- Implementar contraofertas bidireccionales en la entidad `Operation`.
- Agregar campo `negotiations` (JSON) al schema de Prisma.
- Actualizar el `OperationMapper` para serializar/deserializar el historial.
- Escribir tests de integración para el repositorio de `Operation`.
- Refactorear y ampliar los tests unitarios de `Operation`.

---

## 🛠 Cambios realizados

### 1. Negociación bidireccional en `Operation`

La entidad `Operation` pasó de un modelo simple (oferta → aceptar/rechazar) a un modelo de **contraoferta bidireccional**:

```typescript
// Flujo típico
operation = Operation.create({ ..., offerPrice: Money.fromCents(100000) }); // buyer ofrece $1000
operation.counterOffer(Money.fromCents(200000, "USD"), "seller");          // seller contraoferta $2000
operation.counterOffer(Money.fromCents(150000, "USD"), "buyer");           // buyer contraoferta $1500
operation.acceptCurrentOffer("seller");                                    // seller acepta $1500
```

**Reglas de negocio implementadas**:
- Solo puede responder quien **NO** hizo la última oferta (turnos alternados).
- Contraofertas solo en estado `offer_sent` o `negotiating`.
- `acceptCurrentOffer(by)` acepta el precio actual sobre la mesa → `contract_pending`.
- No hay `rejectOffer` — o contra-ofertás, o cancelás.

**Estructura de `Negotiation`**:
```typescript
interface Negotiation {
    amount: number;              // centavos
    currency: string;
    proposedBy: NegotiatingParty; // 'buyer' | 'seller'
    proposedAt: Date;
}
```

> Se usa `number` (centavos) en vez de `Money` dentro de `Negotiation` para que la serialización a JSON sea limpia (Prisma guarda esto como columna `Json`).

### 2. Schema de Prisma

Se agregó la columna `negotiations` al modelo `Operation`:

```prisma
model Operation {
  // ... campos existentes
  negotiations Json   // Array de Negotiation[]
}
```

### 3. `OperationMapper` actualizado

El mapper ahora serializa/deserializa las negociaciones, preservando las fechas como `Date` en el dominio (Prisma las guarda como strings ISO en JSON).

### 4. Tests de integración (3 tests nuevos)

Se agregaron al archivo `packages/db/tests/integration.test.ts`:

| Test | Qué valida |
|------|------------|
| Persistir Operation con oferta inicial | Crea con `Operation.create()`, persiste, recupera. Valida status `offer_sent`, `currentOfferPrice`, `pendingResponseFrom`, `negotiations.length === 1` |
| Persistir contraofertas (UPDATE round-trip) | 3 negociaciones + `acceptCurrentOffer`. Valida `finalPrice`, historial completo, fechas como `Date` |
| Null si no existe | `findById` con UUID inexistente → `null` |

### 5. Tests unitarios ampliados

El archivo `packages/domain/tests/Operation.test.ts` pasó de una cobertura básica a **23 tests** cubriendo:

- Creación y estado inicial
- Comisión split 5%/5% (cálculos matemáticos)
- Contraofertas (turnos, estados válidos)
- Aceptación (precio final, comisiones)
- Transiciones del ciclo de vida completo
- Transiciones inválidas (lanza error)
- Cancelación (estados permitidos vs bloqueados)

---

## 🚀 Comandos

```bash
# Tests unitarios de Operation (sin Docker)
make test-domain

# Tests de integración (requiere Docker)
make up
make test-db

# Todos los tests
make test
```

---

## Siguiente paso

→ **Fase 3**: Use cases (Application Services) — orquestación de los flujos de negocio.
