# Fase 2.1 — Tests de Integración + toJSON para Strategies

> **Estado**: ✅ Completa  
> **Fecha**: Abril 2026  
> **Commit**: `feat: implemente ToJSON methods for Prisma + Integration tests [fase 2.1 test]`

Esta sub-fase completó la verificación end-to-end de la persistencia: serialización de strategies a JSON, tests de integración contra PostgreSQL real, y validación de round-trip (Domain → DB → Domain).

---

## 🎯 Objetivos cumplidos

- Implementar `toJSON()` en todas las strategies para serialización a Prisma (columna JSON).
- Configurar Vitest para el paquete `@marketplace/db`.
- Escribir tests de integración que validen el round-trip completo de cada repositorio.
- Verificar que la hidratación con `reconstitute()` preserva el comportamiento de las entidades.

---

## 🛠 Cambios realizados

### 1. `toJSON()` en las Asset Strategies

Cada strategy ahora puede serializarse para persistir en una columna `Json` de Prisma:

```typescript
// Ejemplo: YouTubeStrategy.toJSON()
{
  assetType: "youtube",
  assetData: {
    subscribers: 10000,
    monthlyRevenueUsdCents: 50000,
    currency: "USD",
    growthFactor: 1.2,
    isMonetized: true,
    hasNoFaceContent: false,
    audienceTopCountry: "US"
  }
}
```

Archivos afectados:
- `packages/domain/src/strategies/YouTubeStrategy.ts`
- `packages/domain/src/strategies/WebStrategy.ts`
- `packages/domain/src/strategies/SocialStrategy.ts`
- `packages/domain/src/strategies/IAssetStrategy.ts` — se agregó `toJSON()` a la interfaz

> ⚠️ **Money en JSON**: Los montos dentro del `assetData` se guardan como centavos (`Int`), no como floats. Esto es consistente con el resto del sistema.

### 2. Ajustes al Mapper de Listing

`PrismaListingRepository` se actualizó para usar `toJSON()` al guardar y reconstruir la strategy correcta al leer (basándose en `assetType`).

### 3. Exportación del cliente Prisma

Se creó `packages/db/src/client.ts` para exportar la instancia singleton de Prisma, usada tanto en repos como en tests.

### 4. Tests de integración

Archivo: `packages/db/tests/integration.test.ts`

Se escribieron **8 tests** organizados en 3 bloques `describe`:

| Bloque | Tests | Qué valida |
|--------|-------|------------|
| `PrismaUserRepository` | 3 | Persistir/recuperar User, upsert (update KYC), null si no existe |
| `PrismaListingRepository` | 2 | Round-trip con Strategy JSON hidratada, null si no existe |
| `PrismaContractRepository` | 3 | Round-trip de Contract + firmas, update de firmas (Tell Don't Ask), null si no existe |

> Los tests de `PrismaOperationRepository` se agregaron en la **Fase 2.2**.

**Características de los tests**:
- Cada test es **independiente** — limpia la DB en `beforeEach` respetando el orden de FKs.
- Se usan **helpers** (`createPersistedUser`, `createPersistedListing`) para evitar duplicar setup.
- Se valida que `reconstitute()` preserva el estado: IDs, campos, strategy con cálculos funcionando, firmas con IPs.

---

## 🚀 Comandos

```bash
# Requiere Docker corriendo (PostgreSQL en puerto 5433)
make up

# Ejecutar solo tests de integración
make test-db
# equivalente a: pnpm --filter @marketplace/db test

# Ejecutar TODOS los tests (dominio + integración)
make test
```

> ⚠️ **Docker obligatorio**: Los tests de integración se conectan a PostgreSQL real. Si Docker no está corriendo, van a fallar con error de conexión.

---

## Siguiente paso

→ **Fase 2.2**: Tests de negociación + contraofertas con persistencia.
