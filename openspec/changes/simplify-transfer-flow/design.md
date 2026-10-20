# Diseño: la ventana de transferencia registra lo que hizo el vendedor

## Enfoque técnico

Cinco piezas, en el orden en que se apoyan:

1. **La constancia.** `TransferInitiation` vive en `Operation.ts` al lado de `CustodyVerification`, y
   `initiateTransfer(data)` la exige con una cadena de guardas calcada de `confirmAssetCustody`.
2. **El congelado de la cuenta.** El identificador sale del `platformAccess` del listing, así que
   `InitiateTransferUseCase` suma `IListingRepository`. La entidad no consulta nada: recibe el hecho
   ya resuelto.
3. **La persistencia.** Una columna `operations.transferInitiation` Json nullable, con su par
   `parseCesion` / `serializeCesion` en `OperationMapper`.
4. **El aviso.** `contractSigned()` deja de mandar un tipo a las dos partes y manda uno por parte.
   `cesion_pendiente` entra por migración aditiva de enum.
5. **La pantalla.** El botón pelado se vuelve un formulario con la instrucción posterior a la firma,
   que viaja en el DTO de la operación; el tablero separa a quién se espera; los textos se corrigen.

La regla que ordena todo, heredada de `asset-custody-identity`: **las entidades reciben hechos, no
puertos.** `Operation` no sabe buscar un `Listing`, y el `custodyAccountId` que congela se lo dan.

---

## Decisiones de arquitectura

### 1. `TransferInitiation`: espejo de `CustodyVerification`, con una asimetría deliberada

```ts
/**
 * Constancia de que el vendedor cedió el control del activo.
 *
 * Es la única transición del escrow que la plataforma no puede ejecutar ni
 * verificar en el momento: la hace el vendedor en la plataforma del activo.
 * Por eso lo que queda registrado es su declaración —quién, cuándo, a qué
 * cuenta— y no una comprobación nuestra. La comprobación viene después, y es
 * de otro: `confirmAssetCustody()`.
 */
export interface TransferInitiation {
    declaredBy: UniqueEntityID;
    declaredAt: Date;
    /** El vendedor afirma haber cedido el control del activo. */
    controlCeded: boolean;
    /**
     * Copia congelada de la cuenta de custodia vigente al declarar. Opcional
     * porque una constancia de acceso anterior a `asset-custody-identity` no
     * nombra ninguna cuenta, y afirmar una que nadie registró sería inventarla.
     */
    custodyAccountId?: UniqueEntityID;
    notes?: string;
}

export type TransferInitiationInput = Omit<TransferInitiation, 'declaredAt'>;
```

| | |
|---|---|
| **Elegido** | Interfaz en `Operation.ts`, prop `transferInitiation?` en `OperationProps`, getter `transferInitiation`. `custodyAccountId` **viaja en el input**. |
| **Rechazado** | Que la entidad lo copie sola, como `complete()` copia `deliveredToIdentifier` de `props.recipientIdentity`. |
| **Motivo** | La asimetría no es un descuido: `recipientIdentity` es un dato *de la operación* y la entidad lo tiene a mano; el `custodyAccountId` vive en otro agregado. Que la entidad lo copiara exigiría que `Operation` leyera un `Listing`, y eso rompe la regla que ordena los tres cambios. Lo resuelve el use case, que es quien cruza agregados. |

Dos cosas que **no** se copian de `CustodyVerification`: no hay `metrics` —el vendedor no está
sacando una foto del activo, está declarando un acto— y `controlCeded` reemplaza a `isPrimaryOwner`
porque un dominio no tiene propietario principal (§3 de la propuesta).

### 2. La cadena de guardas de `initiateTransfer(data)`

Orden exacto y error por falla. `InvalidStateError` → 409 y `ValidationError` → 400 vía
`apps/api/src/http/errorHandler.ts:16-22`.

| # | Guarda | Falla | Por qué ese error |
|---|---|---|---|
| 1 | `assertIsSeller(data.declaredBy.toString())` | `ForbiddenError` (403) | La constancia tiene que ser atribuible al vendedor **de esta operación**. Precedente exacto: `declareRecipientIdentity` abre con `assertIsBuyer(by)`. |
| 2 | `status === 'contract_signed'` | `InvalidStateError` (409) | Sin cambios respecto de hoy. |
| 3 | `data.declaredBy` presente | `ValidationError` (400) | Calcado de `!data.verifiedBy` en `confirmAssetCustody:484`. Un payload al que le falta un campo obligatorio es un 400. |
| 4 | `data.controlCeded === true` | `InvalidStateError` (409) | *"Para iniciar la transferencia tenés que declarar que ya cediste el control del activo."* Espejo de `!isPrimaryOwner` (`:488`): el payload está bien formado, lo que no está listo es el mundo. Una declaración negativa no es una transición, es un vendedor que todavía no terminó. |

La guarda 1 va antes que la del estado a propósito: un tercero no debería poder deducir en qué etapa
está una operación ajena por el error que recibe.

`custodyAccountId` **no se valida nunca**: ausente es legítimo, y rechazar dejaría trabadas en
`contract_signed`, sin salida, a las operaciones cuyo único defecto es una constancia de acceso vieja.

Recién con las cuatro pasadas: `this.props.transferInitiation = { ...data, declaredAt: new Date() }`
y después el estado, en ese orden — igual que `confirmAssetCustody:500-501`.

### 3. El congelado de la cuenta y la dependencia nueva del use case

`InitiateTransferUseCase` pasa de `(operationRepo, avisos?)` a `(operationRepo, listingRepo, avisos?)`.
El opcional queda último porque TypeScript no admite otra cosa; toca `apps/api/src/container.ts:265`
y cinco llamadas en `packages/domain/tests/use-cases/operation/OperationUseCases.test.ts`.

Qué hace el código, sin suponer nada:

```ts
const listing = await this.listingRepo.findById(operation.listingId.toString());
if (!listing) throw new NotFoundError('Activo no encontrado');

operation.initiateTransfer({
    declaredBy: new UniqueEntityID(actor.id),
    controlCeded: input.controlCeded,
    custodyAccountId: listing.platformAccess?.custodyAccountId,
    notes: input.notes,
});
```

| Situación | Qué hace | Por qué |
|---|---|---|
| El listing no existe | `NotFoundError` (404) | Inalcanzable: `operations.listingId` es FK (`schema.prisma:211`). Se falla cerrado igual porque escribir una constancia sobre un activo que no está es peor que no escribirla. |
| `platformAccess` ausente | Sigue, con `custodyAccountId` en `undefined` | Inalcanzable en `contract_signed`: `SignContractUseCase` → `assertCanBeTransferred()` lo exige para firmar. **No se agrega una guarda** por algo que el flujo ya garantiza; y si la premisa fuera falsa, trabar al vendedor sería peor que registrar la cuenta como no nombrada. |
| `platformAccess` presente sin `custodyAccountId` | Sigue, con `undefined` | Alcanzable de verdad: constancias escritas antes de `asset-custody-identity` (`Listing.ts:58-63` documenta el mismo tratamiento). Se muestra *"cuenta sin registrar"*. |

Las tres colapsan en una sola línea —`listing.platformAccess?.custodyAccountId`— y el use case no
las distingue. Se dicen acá para que la spec no le atribuya al código una discriminación que no hace.

`operation.assertIsSeller(actor.id)` se queda donde está (`:22`). La repetición con la guarda 1 es
deliberada y responde preguntas distintas: la del use case es *"¿puede avanzar este pedido?"*, la de
la entidad es *"¿esta constancia es atribuible al vendedor de esta operación?"*. Como el use case
pasa `declaredBy = actor.id`, no pueden discrepar.

### 4. El aviso: un tipo por parte, y una migración que tiene que ir primero

`contractSigned()` deja de usar `toBothParties` y arma las dos notificaciones a mano: comprador →
`contrato_firmado`, vendedor → `cesion_pendiente`. `toBothParties` sobrevive: lo sigue usando
`operationCompleted()`.

El valor entra en cuatro declaraciones y una migración:

| Dónde | Qué |
|---|---|
| `packages/domain/src/entities/Notification.ts:11-31` | Variante en `NotificationType`. |
| `packages/db/prisma/schema.prisma:45` | Variante en `enum NotificationType`. |
| `packages/api-contract/src/index.ts:793-809` | Variante en `NotificationTypeDto`. |
| `apps/web/src/lib/notifications.ts:10` | Entrada en `TEXTOS` (el `Record` es total: sin ella no compila). |
| `packages/db/prisma/migrations/<ts>_add_cesion_pendiente_notification/` | `ALTER TYPE "NotificationType" ADD VALUE 'cesion_pendiente';` |

**Sobre la restricción de PostgreSQL.** Prisma corre cada archivo de migración dentro de una
transacción. Desde PG 12 `ALTER TYPE ... ADD VALUE` es legal ahí dentro; lo que sigue prohibido es
**usar** el valor recién agregado en esa misma transacción. Esta migración solo agrega el valor: no
tiene DML, ni `DEFAULT`, ni `CHECK` que lo nombre, así que no toca la restricción. Es exactamente la
forma del precedente `20260901120000_repair_platform_notification_types`, que agrega cuatro valores
sin usarlos y hoy corre limpio en `make db-reset`. El compose local declara `postgres:16`.

**Por qué el orden importa más de lo que parece.** `NegotiationNotifier.enviar()` se traga cualquier
error (`:162-169`, deliberadamente: un aviso no puede tumbar una venta). Si el código emisor llegara
a un entorno sin el valor de enum, Prisma tiraría `Invalid value for argument 'type'` —el incidente
de `denuncia_recibida`— y el `catch` lo haría **silencioso**: el vendedor no se enteraría de que le
toca, que es justo el defecto que este cambio existe para cerrar, y nadie vería un error. Por eso la
migración y las cuatro declaraciones van en el mismo commit, antes del commit que cambia
`contractSigned()`.

### 5. El tablero: una lista nueva, no un reparto distinto

```ts
/**
 * Las etapas donde el próximo movimiento es del vendedor y no nuestro.
 *
 * `contract_signed` espera que ceda el control del activo y lo declare. La
 * plataforma no puede destrabarlo: solo avisar.
 */
const ESPERAN_AL_VENDEDOR: OperationStatus[] = ['contract_signed'];

const EN_CURSO: OperationStatus[] = [
    'contract_pending',
    ...ESPERAN_AL_VENDEDOR,
    ...ESPERAN_A_LA_PLATAFORMA,
];
```

`EN_CURSO` conserva exactamente los mismos cinco estados que hoy (`:83-87`); solo deja de nombrar
`contract_signed` a mano. `operationsInProgress` no cambia.

| | |
|---|---|
| **Elegido** | Campo nuevo `waitingOnSeller: PendingOperation[]` en `PlatformDashboard`, alimentado por un sexto `findByStatuses(ESPERAN_AL_VENDEDOR)` dentro del `Promise.all` que ya existe (`:110-119`) y descrito por el mismo `describir()`. |
| **Rechazado A** | Meter esas operaciones dentro de `pending`. Su comentario dice *"cuyo próximo paso lo da un admin"* (`:55-56`); contaminarla repetiría la mentira de la opción A de la propuesta. |
| **Rechazado B** | Un `waitingOn: 'platform' \| 'seller'` dentro de `PendingOperationDto`. Más chico, pero deja que la pantalla decida qué es una espera nuestra: la política vuelve a la vista, que es de donde este cambio la está sacando. |

`PlatformDashboardDto` suma `waitingOnSeller: PendingOperationDto[]`. El panel
(`apps/web/src/app/admin/page.tsx`) lo dibuja como una segunda lista, subordinada, y `PROXIMO_PASO`
—que es `Partial<Record<...>>`, así que no obliga a nada más— suma
`contract_signed: 'Esperando que el vendedor ceda el control y lo declare'`.

### 6. El formulario del vendedor y de dónde saca la instrucción

`GetOperationDetailsUseCase` **ya carga el `Listing`** (`:114-118`), así que la instrucción no
necesita un viaje nuevo. Suma dos cosas:

- `custodyRepo?: ICustodyAccountRepository` como último parámetro opcional del constructor — misma
  forma y mismo motivo que `GetListingDetailsUseCase:58-63`.
- `handoverSteps?: HandoverStep[]` en `OperationDetailView`, calculado como
  `listing.handoverSteps(ctx).filter((p) => p.afterPlatformStarts)`.

**El filtrado va en el use case, no en la pantalla.** En `activos/[id]/page.tsx:90-91` filtra la
pantalla porque necesita las dos mitades; acá solo la posterior a la firma significa algo.

**La resolución del contexto no es la misma que la de `GetListingDetailsUseCase`, y por eso se
escribe aparte en vez de extraerse:**

```
cuenta a nombrar = transferInitiation.custodyAccountId   (la que ya quedó congelada)
                   ─ si no hay ─
                   platformAccess.custodyAccountId       (la vigente del listing)
                   ─ si no hay ─
                   la primera cuenta activa para el AssetType
```

El primer escalón no existe en el catálogo: una vez declarada la cesión, la operación tiene que
nombrar la cuenta a la que el vendedor efectivamente cedió, no la que hoy esté asignada. Son dos
políticas distintas sobre la misma forma, no una duplicación.

**El formulario.** `apps/web/src/components/TransferInitiationForm.tsx`, modelado sobre
`CustodyVerificationForm.tsx`: `useActionState`, `Alert`, una casilla que habilita el submit y un
`notes` opcional. Reemplaza el `OperationAction` de `operaciones/[id]/page.tsx:502-508` bajo la misma
condición (`op.status === 'contract_signed' && op.miParte === 'seller'`).

**El caso web, que es un requisito de corrección y no un borde.** `WebStrategy` no tiene ningún paso
con `requiredActor: 'platform'`, así que `entramosNosotros === -1` en `Listing.ts:290` y ningún paso
sale con `afterPlatformStarts: true`: la lista llega **vacía**. El componente recibe
`steps: HandoverStepDto[]`, dibuja el `<ol>` solo si `steps.length > 0`, y la frase genérica —más la
casilla y el submit— se dibuja siempre, fuera de ese condicional. No hay rama alternativa que probar:
el camino vacío es el camino normal con una lista de cero elementos.

### 7. El transporte: `transfer` deja de ser un paso sin cuerpo

Hoy `transfer` vive en la tabla `pasos` de `apps/api/src/routes/operations.ts:175-192`, que existe
para los pasos *sin parámetros*. Con cuerpo ya no pertenece ahí.

| Capa | Cambio |
|---|---|
| `apps/api/src/routes/operations.ts` | Sacar `['transfer', ...]` de `pasos`; ruta propia `POST /operations/:id/transfer` con `schema.body` (`required: ['controlCeded']`), calcada de `/complete` (`:152-173`). |
| `packages/api-contract` | `InitiateTransferRequest { controlCeded: boolean; notes?: string }` y `TransferInitiationDto { declaredAt, controlCeded, custodyAccountId?, notes? }`. `OperationDetailDto` suma `transferInitiation?` y `handoverSteps?`. |
| `packages/api-client` | `initiateTransfer(operationId, body)`. |
| `apps/web/.../operaciones/actions.ts` | `'transfer'` sale de `Step` y de `EJECUTAR`; nace `initiateTransfer(operationId, _estado, form)` con la forma de `declareRecipientIdentity` (`:64-80`). |

`declaredBy` **no viaja al DTO**, siguiendo a `CustodyVerificationDto` (`api-contract:781-786`), que
tampoco expone `verifiedBy`.

### 8. Textos

| Dónde | Hoy | Propuesto |
|---|---|---|
| `ui.tsx:58` | `TRANSFIRIENDO` | `VERIFICANDO` |
| `Timeline.tsx:21` | *Transferencia* / *"La plataforma completa el cambio de titularidad sobre el activo cedido."* | *Verificación* / *"El vendedor declaró haber cedido el control. La plataforma verifica y toma la custodia."* |
| `queEsperar()` `contract_signed` · seller | *"…no necesitamos nada más de vos por ahora."* | *"El contrato está firmado. Queda un último paso tuyo: cedernos el control del activo. Cuando lo hagas, declaralo acá y lo verificamos."* |
| `queEsperar()` `contract_signed` · platform | *"Falta completar el cambio de titularidad…"* | *"El contrato está firmado. Esperamos que el vendedor nos ceda el control y lo declare."* |
| `notifications.ts:35-38` `contrato_firmado` | *"Las tres partes firmaron. Sigue la transferencia del activo."* | Pasa a ser texto solo para el comprador; se redacta en segunda persona hacia él. |
| `notifications.ts` `cesion_pendiente` | — | *"Te toca ceder el control del activo"* / *"El contrato quedó firmado. Cedenos el control del activo y declaralo desde la operación: recién ahí lo verificamos y lo tomamos en custodia."* |
| `activos/[id]/page.tsx:466-480` | El bloque `despues` vive dentro de la tercera rama del panel *ACCESO DE LA PLATAFORMA* (`:384`, la de "todavía sin acceso") | Se saca del ternario y se dibuja en las tres ramas. |

`queEsperar()` en `transfer_in_progress` no se toca: después de este cambio *"estamos completando el
cambio de titularidad sobre el activo que cediste"* pasa a ser cierto.

`/sistema` cataloga `TransferInitiationForm`.

Todos estos strings quedan sujetos a la **decisión 2 pendiente del usuario** en la propuesta. El
diseño fija el mecanismo; las palabras son propuestas.

---

## Flujo de datos

```
  Vendedor                                    Plataforma (admin)
     │                                                │
  POST /operations/:id/transfer                       │
  { controlCeded, notes }                             │
     │                                                │
     ▼                                                │
  InitiateTransferUseCase                             │
     ├─► operationRepo.findById                       │
     ├─► listingRepo.findById ──► platformAccess.custodyAccountId
     │                                    │           │
     ▼                                    ▼           │
  operation.initiateTransfer({ declaredBy, controlCeded, custodyAccountId })
     │  guardas: vendedor → estado → declaredBy → controlCeded
     ▼                                                │
  props.transferInitiation ─► status = transfer_in_progress
     │                                                │
     ├─► OperationMapper ─► operations.transferInitiation (Json)
     └─► PlatformNotifier.custodyNeeded() ────────────┤ custodia_pendiente
                                                      ▼
                                          confirmAssetCustody(data)
                                          (la comprobación independiente)

  SignContractUseCase ─► NegotiationNotifier.contractSigned()
                              ├─► comprador : contrato_firmado
                              └─► vendedor  : cesion_pendiente
```

---

## Cambios de archivo

| Archivo | Acción | Qué |
|---|---|---|
| `packages/domain/src/entities/Operation.ts` | Modificar | `TransferInitiation`, `TransferInitiationInput`, prop, getter, `initiateTransfer(data)` con sus cuatro guardas. |
| `packages/domain/src/entities/Notification.ts` | Modificar | `cesion_pendiente` en `NotificationType`. |
| `packages/domain/src/services/NegotiationNotifier.ts` | Modificar | `contractSigned()` manda un tipo por parte. |
| `packages/domain/src/use-cases/operation/InitiateTransferUseCase.ts` | Modificar | `IListingRepository`; input `{ controlCeded, notes? }`; congela la cuenta. |
| `packages/domain/src/use-cases/operation/GetOperationDetailsUseCase.ts` | Modificar | `custodyRepo?`; `handoverSteps` posteriores a la firma en la vista. |
| `packages/domain/src/use-cases/admin/GetPlatformDashboardUseCase.ts` | Modificar | `ESPERAN_AL_VENDEDOR`, `EN_CURSO` derivado, `waitingOnSeller`. |
| `packages/domain/src/machines/OperationMachine.ts` | Modificar | Solo comentario: la máquina documenta, la entidad hace cumplir. |
| `packages/db/prisma/schema.prisma` | Modificar | `operations.transferInitiation Json?`; `cesion_pendiente` en el enum. |
| `packages/db/prisma/migrations/<ts>_add_transfer_initiation/` | Nuevo | `ALTER TABLE "operations" ADD COLUMN "transferInitiation" JSONB;` |
| `packages/db/prisma/migrations/<ts>_add_cesion_pendiente_notification/` | Nuevo | `ALTER TYPE "NotificationType" ADD VALUE 'cesion_pendiente';` |
| `packages/db/src/mappers/OperationMapper.ts` | Modificar | `parseCesion` / `serializeCesion`, espejo de `parseCustodia` (`:59-84`, `:165-176`), con `undefined` y no `Prisma.DbNull`. |
| `packages/api-contract/src/index.ts` | Modificar | `InitiateTransferRequest`, `TransferInitiationDto`, `NotificationTypeDto`, `OperationDetailDto`, `PlatformDashboardDto`. |
| `packages/api-client/src/MarketplaceClient.ts` | Modificar | `initiateTransfer(id, body)`. |
| `apps/api/src/routes/operations.ts` | Modificar | Ruta propia con body schema; `transfer` sale de `pasos`. |
| `apps/api/src/routes/me.ts` | Modificar | `transferInitiation` y `handoverSteps` en el DTO de detalle; `waitingOnSeller` en el del tablero. |
| `apps/api/src/container.ts` | Modificar | `listingRepo` en `InitiateTransferUseCase`; `custodyRepo` en `GetOperationDetailsUseCase`. |
| `apps/web/src/components/TransferInitiationForm.tsx` | Nuevo | Casilla, instrucciones, `notes`, submit. |
| `apps/web/src/app/operaciones/[id]/page.tsx` | Modificar | El formulario en lugar del botón; `queEsperar()` en `contract_signed`. |
| `apps/web/src/app/operaciones/actions.ts` | Modificar | Server action con cuerpo; `transfer` sale de `Step`. |
| `apps/web/src/app/activos/[id]/page.tsx` | Modificar | El bloque `despues` sale del ternario. |
| `apps/web/src/app/admin/page.tsx` | Modificar | Lista de espera al vendedor; entrada en `PROXIMO_PASO`. |
| `apps/web/src/components/ui.tsx`, `Timeline.tsx`, `lib/notifications.ts`, `app/sistema/page.tsx` | Modificar | Textos y catálogo. |
| `packages/domain/tests/**`, `packages/db/tests/integration.test.ts`, `apps/api/tests/http.test.ts` | Modificar + nuevo | 11 llamadas en 8 archivos suman un argumento; guardas, aviso y tablero nuevos. |
| `CLAUDE.md` | Modificar | Borrar la frase obsoleta de `payment_pending` (línea 80). |

---

## Plan de migración

Dos migraciones, independientes entre sí, las dos aditivas:

```sql
-- <ts>_add_transfer_initiation
ALTER TABLE "operations" ADD COLUMN "transferInitiation" JSONB;

-- <ts>_add_cesion_pendiente_notification
ALTER TYPE "NotificationType" ADD VALUE 'cesion_pendiente';
```

Ninguna reescribe una fila ni invalida ninguna. No se elimina ningún valor de enum, así que el
riesgo de aborto que descarta las opciones A y C de la propuesta no existe. `make fresh` (`db:push`)
no lo nota; `make db-reset` las aplica sin intervención.

**Las operaciones que ya estén en `transfer_in_progress` quedan con `transferInitiation` en nulo** y
se muestran como *"declaración sin registrar"*. Sin relleno: fabricar una constancia que nadie firmó
es el defecto, no el arreglo.

**Reversión.** `git revert` más una migración inversa que borra la columna. El valor de enum no se
puede quitar con `ALTER TYPE`: se queda sin emisor, que es inocuo y es lo que el repositorio ya hace.

---

## Orden de trabajo

Para que nada quede a medias, sobre todo la migración frente al código que emite el valor nuevo:

1. **Enum de avisos, completo y de una vez**: las cuatro declaraciones (`Notification.ts`,
   `schema.prisma`, `NotificationTypeDto`, `TEXTOS`) **más** su migración, en el mismo commit.
   Todavía nadie lo emite.
2. **`contractSigned()` parte el aviso.** Recién acá el valor se usa, con el enum ya migrado.
3. **La constancia en la entidad**, con sus tests en rojo primero: las cuatro guardas.
4. **Persistencia**: columna, migración y mapper, con el ida y vuelta en integración.
5. **Use case y cableado**: `listingRepo`, container, y los recorredores de estados de los tests.
6. **Contrato y transporte**: DTOs, ruta con body, cliente, server action.
7. **`handoverSteps` en el DTO de la operación**, antes que el formulario que los dibuja.
8. **Pantallas**: formulario, `queEsperar()`, `activos/[id]`, textos, `/sistema`.
9. **Tablero**: `ESPERAN_AL_VENDEDOR`, DTO, panel.
10. **`CLAUDE.md`**, trivial y último.

Los pasos 1–2 son el único orden que no admite intercambio.

---

## Estrategia de pruebas

| Capa | Qué prueba | Cómo |
|---|---|---|
| Dominio — entidad | Las cuatro guardas de `initiateTransfer`, una por una: tercero → `ForbiddenError`; estado equivocado → `InvalidStateError`; sin `declaredBy` → `ValidationError`; `controlCeded: false` → `InvalidStateError` **y estado sin cambiar**. Con todo bien: `declaredAt` fechado, `custodyAccountId` congelado, estado en `transfer_in_progress`. | Vitest puro, ampliando `packages/domain/tests/Operation.test.ts`. |
| Dominio — entidad | Que `custodyAccountId` ausente **no** bloquea la transición. | Ídem. |
| Dominio — use case | Congela la cuenta del `platformAccess` del listing; sin `platformAccess` avanza igual; sin listing lanza `NotFoundError`; `custodia_pendiente` sale exactamente una vez, después de la declaración. | Puertos mockeados, en `tests/use-cases/operation/OperationUseCases.test.ts`. |
| Dominio — servicio | `contractSigned()` emite dos avisos, `contrato_firmado` al comprador y `cesion_pendiente` al vendedor, y ninguno de los dos al otro. | Doble de `INotifier`, inspeccionando las notificaciones emitidas. |
| Dominio — use case | El tablero devuelve `contract_signed` en `waitingOnSeller` y **no** en `pending`; `operationsInProgress` no cambia. | Ampliar los tests del panel. |
| Dominio — vista | Para un listing de YouTube, `handoverSteps` de la operación trae el paso de promoción; para uno web, trae **cero** pasos y la vista no falla. | `GetOperationDetailsUseCase` con estrategias reales, sin dobles. |
| DB — integración | Ida y vuelta de `transferInitiation`; una operación en `transfer_in_progress` con la columna en nulo se rehidrata sin romper; una notificación `cesion_pendiente` se guarda. | `packages/db/tests/integration.test.ts` contra base real, cada test con sus propios datos y value objects tipados. |
| API | `POST /operations/:id/transfer` sin `controlCeded` → 400 por schema; con `controlCeded: false` → 409; desde el comprador → 403. | `apps/api/tests/http.test.ts`, al estilo de las rutas ya cubiertas. |

TDD: primero el test en rojo por cada guarda. La que da nombre al cambio es la 4 —`controlCeded`
falso rechazado— y es la que no puede quedar sin cubrir.

Las 11 llamadas a `op.initiateTransfer()` repartidas en 8 archivos de test (`CustodyVerification.test.ts:30`,
`PaymentRecord.test.ts:25`, `AssetDelivery.test.ts:45`, `PaymentUseCases.test.ts:36`,
`OperationUseCases.test.ts:72`, `Operation.test.ts:174/232/242/294`, `integration.test.ts:659`,
`http.test.ts:993`) suman el argumento. Es mecánico, y que rompa la compilación es lo que garantiza
que ninguno quede sin revisar.

---

## Matriz de amenazas

N/A — no hay ruteo dinámico, ni comandos de shell, ni subprocesos, ni automatización de VCS/PR, ni
clasificación de archivos ejecutables, ni integración de procesos. La única ruta HTTP nueva es
declarativa, pasa por el mismo `authenticate` que las demás y valida su cuerpo con un schema de
Fastify; la autorización vive en el use case y en la entidad.

---

## Preguntas abiertas

- [ ] **`CustodyVerification.custodyAccountId` no lo escribe nadie.** El campo está declarado
      (`Operation.ts:70`) y el mapper lo lee y lo serializa (`OperationMapper.ts:80-81`, `:173`), pero
      `ConfirmCustodyUseCase.ts:45-51` no lo pasa y no hay ninguna asignación en todo
      `packages/domain/src`. Entonces el beneficio del §2 de la propuesta —comparar
      `TransferInitiation.custodyAccountId` contra `CustodyVerification.custodyAccountId` y detectar
      que el acceso se volvió a registrar en el medio— **hoy no es realizable**: un lado siempre está
      vacío. Cablearlo es una línea en `ConfirmCustodyUseCase` más su dependencia del listing, pero
      es alcance de `asset-custody-identity`, no de este cambio. La spec no debería enunciar la
      comparación como una capacidad existente. Decisión del usuario: cablearlo acá o dejarlo dicho.
- [ ] **El legajo de evidencia no lleva la declaración.** `api-contract:780-787` arma el legajo con
      `platformAccess` y `custody`. La constancia nueva es exactamente el material que la plataforma
      le entrega a la parte perjudicada en una disputa, y quedaría afuera. La propuesta no lo pone en
      alcance; se levanta acá en vez de resolverlo por cuenta propia.
- [ ] **Los textos** dependen de la decisión 2 de la propuesta, todavía sin resolver. Las tablas de
      §8 son propuestas, no acuerdos.
- [ ] **Dónde aterrizan las reescrituras de los escenarios hermanos** depende de qué cambio se
      archive primero (**Dependencias** de la propuesta). Conviene resolverlo antes de la fase de
      spec.
