# Fase 6 — Avisos

> **Estado**: ✅ Completa
> **Fecha**: Agosto 2026
> **Objetivo**: Que las partes se enteren de lo que pasa sin tener que estar mirando la pantalla.

---

## El problema

La negociación tiene turnos: después de una contraoferta, alguien tiene que responder. Pero **nada se lo decía**. `pendingResponseFrom` existía en el dominio y se mostraba en la interfaz, así que enterarse de que te tocaba dependía de entrar a mirar.

Un marketplace donde nadie se entera de nada está muerto aunque funcione.

---

## Decisión: puerto en lugar de bus de eventos

Existía `packages/domain/src/events/DomainEvents.ts` desde la Fase 1: un bus a medio construir con `markAggregateForDispatch` pero **sin `dispatch`, sin `register`**, un `handlersMap` que nunca se leía y **cero importaciones** en todo el repositorio.

La opción obvia era completarlo. Se descartó.

Con nueve puntos de aviso en todo el sistema, un dispatcher con registro de handlers y una clase por evento es más maquinaria que la que el problema pide. Un puerto `INotifier` llamado desde los use cases logra lo mismo, y el argumento de "después agrego email" se cumple igual: se escribe otro adaptador, sin tocar ningún use case.

Menos indirección es más fácil de defender, y el repositorio **dejó de tener andamiaje muerto** en vez de hacerlo crecer. El archivo se borró.

```typescript
export interface INotifier {
    notificar(notificaciones: Notification[]): Promise<void>;
}
```

---

## Quién se entera de qué

`AvisosDeNegociacion` concentra la política. Vive fuera de los use cases para que no repitan la misma decisión nueve veces, y fuera de las entidades porque **a quién avisar no es una invariante de la operación**: es una política, y las políticas cambian.

| Evento | Quién recibe el aviso |
|---|---|
| Oferta creada | El vendedor |
| Contraoferta | Quien quedó con el turno |
| Oferta aceptada | La otra parte |
| Cascada de canceladas | Cada comprador rival |
| Listing aprobado o rechazado | El vendedor |
| Contrato completamente firmado | Las dos partes |
| Activo en custodia | El comprador — le toca pagar |
| Pago confirmado | El vendedor |
| Operación cerrada | Las dos partes |

El aviso de la cascada no es un detalle: sin él, los compradores cuyas ofertas se cancelaron quedan esperando una respuesta que nunca va a llegar.

---

## Tres decisiones que hacen la diferencia

### Los avisos salen después de que la transacción confirma

En `AcceptOfferUseCase` la cascada corre dentro del Unit of Work de la Fase 4.1. Los avisos se envían **cuando `uow.run()` ya confirmó**, nunca adentro:

```typescript
const resultado = await this.uow.run(async (repos) => { /* … */ });

// Avisar dentro de la transacción sería avisar de una aceptación que
// todavía puede revertirse, y un aviso enviado no se retira.
await this.avisos?.ofertaAceptada(resultado.operation, resultado.by);
await this.avisos?.ofertasCanceladasPorCascada(resultado.canceladas);
```

Es un detalle que solo aparece porque la fase anterior introdujo la transacción.

### Un aviso que falla no tumba la venta

Todos los métodos de `AvisosDeNegociacion` se tragan los errores del notificador a propósito. Que un aviso no salga es molesto; que se caiga una venta porque el correo no anduvo es inaceptable.

### La notificación no guarda el texto

Solo el tipo y las referencias — operación, listing, monto. Redactar es responsabilidad de la vista.

Guardar la redacción obligaría a **migrar la base para cambiar una palabra**, y metería copy dentro del dominio. El texto se arma en `apps/web/src/lib/avisos.ts` a partir del tipo, lo que además deja la traducción resuelta sin duplicar datos.

---

## Persistencia

Tabla `notifications` con índice `(userId, createdAt)`, que es como se consulta siempre la bandeja.

`PrismaNotificationRepository` implementa **dos puertos**: `INotificationRepository` para leer y `INotifier` para escribir. Por ahora "avisar" es guardar en la bandeja de la aplicación; cuando haya email se escribe otro adaptador y se componen.

Un test de integración verifica que `readAt` vuelva de la base como `Date` y no como string — el mismo defecto que tenía `signedAt` en las firmas antes de la Fase 4.

---

## Seguridad

Los ids de aviso son adivinables, así que `MarkNotificationReadUseCase` chequea pertenencia antes de marcar. Sin eso, cualquiera podría marcar como leídos los avisos de otra persona. Un test HTTP fija el **403**.

---

## Interfaz

- **Campana en el navbar** con el contador de no leídos. Es la única señal de que pasó algo mientras la persona no estaba mirando.
- **`/avisos`** — la bandeja, con los no leídos destacados y los leídos atenuados. Cada aviso enlaza a su operación o listing.
- El contador vive en el layout, así que marcar leído invalida con `revalidatePath('/', 'layout')`.

---

## Tests

| Nivel | Archivo | Cubre |
|---|---|---|
| Dominio | `tests/Notificaciones.test.ts` | Quién recibe cada aviso; que el texto no se guarde; que un notificador roto no propague el error |
| Integración | `packages/db/tests/notificaciones.test.ts` | Round-trip real, bandejas separadas por usuario, `readAt` como `Date` |
| HTTP | `apps/api/tests/http.test.ts` | Que ofertar avise al vendedor y no al comprador; marcar leído; 403 sobre un aviso ajeno |

**Total del proyecto: 284 tests**, cero errores de tipos en los cinco paquetes.

---

## Un tropiezo que dejó lección

La foreign key de `notifications` hacia `users` rompió el `limpiar()` de los tests HTTP: borraba usuarios antes que sus avisos. El orden de limpieza tiene que respetar las FKs, igual que ya hacía `integration.test.ts` con contratos, operaciones y listings.

---

## Deuda técnica conocida

| Item | Prioridad | Descripción |
|------|-----------|-------------|
| Solo avisos en la aplicación | Alta | No hay email ni push. El puerto está listo; falta el adaptador y un proveedor. |
| Sin preferencias de aviso | Media | No se puede elegir de qué enterarse. Con volumen real hace falta. |
| Sin paginación en la bandeja | Baja | Se traen los últimos 50 y no hay "ver más". |
| Sin marcar todos como leídos | Baja | Hay que marcarlos de a uno. |

---

## Siguiente paso

→ **Fase 7**: Integraciones externas — proveedor de firma electrónica para llenar `externalSignatureId` y `fileUrl`, y YouTube Data API para que `captureMetricsSnapshot()` deje de lanzar excepción.
