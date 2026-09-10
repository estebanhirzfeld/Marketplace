# Tasks: que la ventana de transferencia registre lo que hizo el vendedor

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 685–900 (autoría; sin contar el agregado de alcance: 625–810) |
| 400-line budget risk | High |
| Chained PRs recommended | No |
| Suggested split | Single PR (excepción ya aceptada por el usuario); fallback documentado A/B abajo |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

El usuario ya vio el pronóstico 625–810 contra el presupuesto de sesión de 800 y aceptó
explícitamente `size:exception`. El agregado de alcance (cablear `CustodyVerification.custodyAccountId`,
Fase 1) suma **60–90 líneas** más (código + tests + integración), llevando el techo a ~900. Sigue
dentro del margen que no amerita reabrir la conversación — no se acerca a ~1000 —, así que se registra
acá y se sigue sin volver a preguntar.

| Bloque | Líneas |
|---|---|
| Custodia: cablear `custodyAccountId` en `ConfirmCustodyUseCase` (alcance agregado) + DTO + tests | 60–90 |
| Constancia: dominio, use case, persistencia, contrato | 170–220 |
| Web: formulario, textos, `/sistema`, pantalla del activo | 180–210 |
| Aviso al vendedor: tipos, notificador, migración, redacción, tests | 60–90 |
| Tablero: `ESPERAN_AL_VENDEDOR`, DTO, panel, tests | 115–140 |
| Mecánico: 11 call sites de `initiateTransfer()` en 8 archivos de test | 100–150 |

### Suggested Work Units (fallback, no es el plan)

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| A | Custodia congelada (alcance agregado) + `TransferInitiation` + verdad en pantalla | PR 1 | `pnpm --filter @marketplace/domain exec vitest run tests/Operation.test.ts tests/use-cases/operation` | `make test-db` (ida y vuelta de las dos columnas) | revert `Operation.ts` guardas, drop columna `transferInitiation`, revert `ConfirmCustodyUseCase` |
| B | Aviso `cesion_pendiente` (enum + migración + notifier) y tablero `ESPERAN_AL_VENDEDOR` | PR 2 | `pnpm --filter @marketplace/domain exec vitest run tests/use-cases/admin` | manual: firmar un contrato y observar el aviso al vendedor | el valor de enum no se puede quitar, queda sin emisor (inocuo); revert notifier y tablero |

---

## Notas (no son tareas)

- **Archivado diferido.** Los tres cambios (`asset-custody-identity`, `platform-access-role`,
  `simplify-transfer-flow`) se archivan juntos **después** de que este cambio se aplique. No hay
  ninguna tarea de archivado en esta lista.
- **Reescritura de specs hermanas SÍ es una tarea** (13.3, abajo): como `openspec/specs/` todavía no
  existe, la reescritura de los dos escenarios señalados en la propuesta aterriza directamente sobre
  los archivos de spec en vuelo de `asset-custody-identity`, no sobre specs archivadas.
- **Fuera de alcance, confirmado**: el defecto `web-escrow-transfer-steps` (`WebStrategy` sin paso de
  plataforma) y agregar la constancia nueva al legajo de evidencia (`api-contract:780-787`). Ninguno
  de los dos genera tareas acá.
- **Textos**: las tablas de copy de la propuesta (§4, §5, §7) y del diseño (§8) se implementan tal
  cual están redactadas. Quedan sujetas a revisión de estilo del usuario durante `sdd-apply`, como ya
  pasó en cambios anteriores — no bloquean el desarrollo.
- **Vitest no typechequea.** Cada fase que toca tipos exige una pasada de `tsc --noEmit` aparte
  (Fase 14.2); no alcanza con la suite en verde.

---

## Fase 1: Dominio — cablear `custodyAccountId` en `CustodyVerification` (alcance agregado)

`CustodyVerification.custodyAccountId` está declarado (`Operation.ts:70`) y el mapper lo lee y lo
serializa, pero nada lo escribe: `ConfirmCustodyUseCase.ts:45-51` no lo pasa. Sin esto, la comparación
de las dos copias congeladas que pide `asset-handover` (Requirement 3) es imposible — un lado siempre
está vacío. Independiente de las Fases 2–3 y 4; puede hacerse en paralelo.

- [x] 1.1 **[TEST]** `packages/domain/tests/use-cases/operation/OperationUseCases.test.ts`: `ConfirmCustodyUseCase` congela `custodyAccountId` desde el `platformAccess` vigente del listing; sin `platformAccess`/sin cuenta asignada persiste `undefined`; sin listing → `NotFoundError`. Arreglar de paso los tres call sites existentes (`:130`, `:139`, `:246`) que hoy construyen `new ConfirmCustodyUseCase(repo)` sin `listingRepo` — reusar `createMockListingRepo` (`:45-55`), ya usado por `CompleteOperationUseCase`. — deps: ninguna
- [x] 1.2 `packages/domain/src/use-cases/operation/ConfirmCustodyUseCase.ts`: sumar `listingRepo: IListingRepository` entre `operationRepo` y el `avisos?` opcional; cargar el listing y pasar `custodyAccountId: listing.platformAccess?.custodyAccountId` a `confirmAssetCustody`; `NotFoundError` si el listing no existe, igual que `InitiateTransferUseCase`. — deps: 1.1
- [x] 1.3 `apps/api/src/container.ts:266`: sumar `listingRepo` a la construcción de `confirmCustody`. — deps: 1.2
- [x] 1.4 **[TEST]** `packages/db/tests/integration.test.ts`: ida y vuelta real de `custodyVerification.custodyAccountId` contra la base — se persiste y se lee de vuelta. Cierra exactamente el defecto que motivó esta fase: el campo existía en el mapper y nunca se probó que se escribiera. — deps: 1.2
- [x] 1.5 `packages/api-contract/src/index.ts:672-679`: sumar `custodyAccountId?: string` a `CustodyVerificationDto`. — deps: ninguna
- [x] 1.6 `apps/api/src/routes/me.ts` — mapeo de `custody` en `GET /operations/:id` (`:465-469`): agregar `custodyAccountId: props.custodyVerification.custodyAccountId?.toString()`. Junto con 4.x/10.x deja las dos copias congeladas visibles una al lado de la otra en el mismo detalle, que es lo que vuelve la divergencia detectable sin construir un comparador — la propuesta pide que la comparación sea posible, no que exista una bandera de alerta automática. — deps: 1.5, 1.2

## Fase 2: Aviso al vendedor — el enum, completo y antes que nadie lo use

Orden con dientes: `NegotiationNotifier.enviar()` se traga cualquier error (`:162-169`). Si el código
emisor llega a un entorno sin el valor, Prisma tira `Invalid value for argument 'type'` y el `catch` lo
hace silencioso — el vendedor no se entera y nadie ve el fallo. Por eso la Fase 3 depende de que **toda**
esta fase esté cerrada, no solo de una parte.

- [x] 2.1 `packages/domain/src/entities/Notification.ts:11-31`: sumar `'cesion_pendiente'` a `NotificationType`. — deps: ninguna
- [x] 2.2 `packages/db/prisma/schema.prisma:45`: sumar `cesion_pendiente` al `enum NotificationType`. — deps: ninguna
- [x] 2.3 Migración `packages/db/prisma/migrations/<ts>_add_cesion_pendiente_notification/migration.sql`: `ALTER TYPE "NotificationType" ADD VALUE 'cesion_pendiente';`, generada con `pnpm --filter @marketplace/db exec prisma migrate dev --name add_cesion_pendiente_notification`; regenerar cliente (`db:generate`). Aditiva, no usa el valor en la misma transacción — mismo precedente que `20260901120000_repair_platform_notification_types`. — deps: 2.2
- [x] 2.4 `packages/api-contract/src/index.ts:793-809`: sumar `'cesion_pendiente'` a `NotificationTypeDto`. — deps: ninguna
- [x] 2.5 `apps/web/src/lib/notifications.ts:10-77`: entrada `cesion_pendiente` en `TEXTOS` (el `Record` es total: sin ella no compila) — *"Te toca ceder el control del activo"* / *"El contrato quedó firmado. Cedenos el control del activo y declaralo desde la operación: recién ahí lo verificamos y lo tomamos en custodia."* — deps: 2.4
- [x] 2.6 Checkpoint de la barrera: `pnpm --filter @marketplace/domain exec tsc --noEmit` y `pnpm --filter @marketplace/db exec tsc --noEmit` en verde con las cinco declaraciones (2.1–2.5) en su lugar y **nadie todavía emitiendo el valor**. No avanzar a la Fase 3 sin este checkpoint. — deps: 2.1, 2.2, 2.3, 2.4, 2.5

## Fase 3: `NegotiationNotifier.contractSigned()` — un tipo por parte

- [x] 3.1 **[TEST]** doble de `INotifier` en las pruebas de `NegotiationNotifier`/`SignContractUseCase`: `contractSigned()` emite `contrato_firmado` solo al comprador y `cesion_pendiente` solo al vendedor; ninguno recibe el aviso del otro; se emite igual para un listing web cuya estrategia no enumera pasos posteriores a la firma. — deps: 2.6
- [x] 3.2 `packages/domain/src/services/NegotiationNotifier.ts:103-105`: `contractSigned()` deja de usar `toBothParties` y arma las dos notificaciones a mano. `toBothParties` sigue viva para `operationCompleted()`. — deps: 3.1

## Fase 4: Dominio — `TransferInitiation` y las guardas de `initiateTransfer(data)`

- [x] 4.1 **[TEST]** `packages/domain/tests/Operation.test.ts`: las cuatro guardas, en el orden exacto del diseño — tercero → `ForbiddenError`; estado ≠ `contract_signed` → `InvalidStateError`; sin `declaredBy` → `ValidationError`; `controlCeded` ausente o `false` → `InvalidStateError` **y el estado no cambia**; camino feliz → `declaredAt` puesto por la entidad, `custodyAccountId` congelado cuando viene, estado en `transfer_in_progress`; `custodyAccountId` ausente **no** bloquea la transición. — deps: ninguna
- [x] 4.2 `packages/domain/src/entities/Operation.ts:464-469`: interfaces `TransferInitiation`/`TransferInitiationInput` (espejo de `CustodyVerification`, sin `metrics`, `controlCeded` en vez de `isPrimaryOwner`); prop `transferInitiation?` en `OperationProps`; getter; reescribir `initiateTransfer(data: TransferInitiationInput)` con las cuatro guardas; mensaje de error genérico y sin vocabulario de YouTube: *"Para iniciar la transferencia tenés que declarar que ya cediste el control del activo."* — deps: 4.1

## Fase 5: Mecánico — los 11 call sites de la firma vieja

- [x] 5.1 Actualizar las 10 llamadas de test + la interna del use case a `{ declaredBy, controlCeded: true }` en los 8 archivos que lista el diseño: `CustodyVerification.test.ts:30`, `PaymentRecord.test.ts:25`, `Operation.test.ts:174/232/242/294`, `AssetDelivery.test.ts:45`, `PaymentUseCases.test.ts:36`, `OperationUseCases.test.ts:72` (dentro de `createOperationInState`) más sus 5 constructores `new InitiateTransferUseCase(repo)` en `:100/108/116/229/238` que ahora también exigen `listingRepo`, `integration.test.ts:659`, `http.test.ts:993`. Criterio: `tsc --noEmit` no marca ningún call site roto. — deps: 4.2, 7.2

## Fase 6: Persistencia — columna y mapper de la constancia

- [x] 6.1 `packages/db/prisma/schema.prisma`: `operations.transferInitiation Json?`. — deps: 4.2
- [x] 6.2 Migración `packages/db/prisma/migrations/<ts>_add_transfer_initiation/migration.sql`: `ALTER TABLE "operations" ADD COLUMN "transferInitiation" JSONB;` vía `prisma migrate dev --name add_transfer_initiation`; regenerar cliente. — deps: 6.1
- [x] 6.3 `packages/db/src/mappers/OperationMapper.ts`: `parseCesion`/`serializeCesion`, espejo de `parseCustodia`/`serializeCustodia` (`:59-84`, `:165-176`) — `undefined`, nunca `Prisma.DbNull`. — deps: 6.2, 4.2
- [x] 6.4 **[TEST]** `packages/db/tests/integration.test.ts`: ida y vuelta de `transferInitiation`; una operación en `transfer_in_progress` con la columna en `null` se rehidrata sin romper ("declaración sin registrar"). — deps: 6.3

## Fase 7: Use case — congelar la cuenta y cablear `listingRepo`

- [x] 7.1 **[TEST]** `packages/domain/tests/use-cases/operation/OperationUseCases.test.ts`: congela `custodyAccountId` del `platformAccess` vigente; sin `platformAccess` avanza igual con `undefined`; sin listing → `NotFoundError`; `declaredBy` = `actor.id`; `custodia_pendiente` sale exactamente una vez, después de la declaración, nunca en `contract_signed`. — deps: 4.2
- [x] 7.2 `packages/domain/src/use-cases/operation/InitiateTransferUseCase.ts`: sumar `listingRepo: IListingRepository` (entre `operationRepo` y el `avisosDePlataforma?` opcional); input `{ controlCeded, notes? }`; construir el `TransferInitiationInput`. — deps: 7.1
- [x] 7.3 `apps/api/src/container.ts:265`: sumar `listingRepo` a `initiateTransfer`. — deps: 7.2

## Fase 8: `handoverSteps` en el detalle de la operación

- [x] 8.1 **[TEST]** `packages/domain/tests/use-cases/operation/OperationUseCases.test.ts` (o archivo nuevo): con `custodyRepo`, `handoverSteps` trae solo los pasos `afterPlatformStarts`; para YouTube incluye el paso de promoción con el identificador correcto según la cascada `transferInitiation → platformAccess → primera cuenta activa`; para web, lista vacía sin romper; sin `custodyRepo` (parámetro opcional ausente), `handoverSteps` queda `undefined`. — deps: 4.2
- [x] 8.2 `packages/domain/src/use-cases/operation/GetOperationDetailsUseCase.ts`: sumar `custodyRepo?: ICustodyAccountRepository` (último parámetro opcional, misma forma que `GetListingDetailsUseCase:58-63`); `handoverSteps?: HandoverStep[]` en `OperationDetailView`, filtrado a `afterPlatformStarts`, resuelto con la cascada propia del diseño §6 — **no reutiliza** `resolveContext` de `GetListingDetailsUseCase`, que resuelve una política distinta (la cuenta vigente, no la que efectivamente recibió la cesión). — deps: 8.1
- [x] 8.3 `apps/api/src/container.ts:252`: sumar `custodyRepo` a `detalleOperacion`. — deps: 8.2

## Fase 9: Tablero — `ESPERAN_AL_VENDEDOR`

- [x] 9.1 **[TEST]** ampliar tests de `GetPlatformDashboardUseCase`: `contract_signed` aparece en `waitingOnSeller` y no en `pending`; `operationsInProgress`/`EN_CURSO` no cambian (siguen siendo los mismos 5 estados); el sexto `findByStatuses` corre dentro del mismo `Promise.all` ya existente. — deps: ninguna
- [x] 9.2 `packages/domain/src/use-cases/admin/GetPlatformDashboardUseCase.ts`: `ESPERAN_AL_VENDEDOR: OperationStatus[] = ['contract_signed']`; `EN_CURSO` derivado por spread en vez de nombrar `contract_signed` a mano; campo `waitingOnSeller: PendingOperation[]` en `PlatformDashboard`, alimentado por `findByStatuses(ESPERAN_AL_VENDEDOR)` y descrito por `describir()`. — deps: 9.1

## Fase 10: Contrato y transporte

- [x] 10.1 `packages/api-contract/src/index.ts`: `TransferInitiationDto { declaredAt, controlCeded, custodyAccountId?, notes? }`; `InitiateTransferRequest { controlCeded: boolean; notes?: string }`; `OperationDetailDto` suma `transferInitiation?: TransferInitiationDto` y `handoverSteps?: HandoverStepDto[]`; `PlatformDashboardDto` suma `waitingOnSeller: PendingOperationDto[]`. `declaredBy` no viaja, igual que `CustodyVerificationDto` no expone `verifiedBy`... salvo que sí lo expone — mantener la asimetría documentada: `declaredBy` se omite a propósito. — deps: 4.2, 8.2, 9.2
- [x] 10.2 `apps/api/src/routes/operations.ts:175-192`: sacar `['transfer', ...]` de la tabla `pasos`; ruta propia `POST /operations/:id/transfer` con `schema.body.required: ['controlCeded']`, calcada de `/complete` (`:152-173`). — deps: 7.2, 10.1
- [x] 10.3 `apps/api/src/routes/me.ts`: en `GET /operations/:id` (`:422-485`) mapear `transferInitiation` (con `declaredAt`/`custodyAccountId` convertidos a string) y `handoverSteps`; en `GET /admin/dashboard` (`:258-286`) mapear `waitingOnSeller` con la misma forma que `pending`. — deps: 10.1, 8.2, 9.2
- [x] 10.4 **[TEST]** `apps/api/tests/http.test.ts`: `POST /operations/:id/transfer` sin `controlCeded` → 400 por schema; con `controlCeded: false` → 409; desde el comprador → 403; camino feliz → 204 y el detalle trae la constancia. — deps: 10.2
- [x] 10.5 `packages/api-client/src/MarketplaceClient.ts:276-278`: `initiateTransfer(operationId, body: InitiateTransferRequest)` deja de ser un `operationStep` sin cuerpo. — deps: 10.1

## Fase 11: Web — formulario y textos

- [x] 11.1 `apps/web/src/components/TransferInitiationForm.tsx` (nuevo): modelado sobre `CustodyVerificationForm.tsx` — `useActionState`, `Alert`, `<ol>` de `steps: HandoverStepDto[]` solo si `length > 0`, casilla `controlCeded` que habilita el submit, `notes` opcional, la frase genérica del error siempre visible. Sobrevive una lista vacía (caso web) sin filtrar vocabulario de YouTube. — deps: 10.1
- [x] 11.2 `apps/web/src/app/operaciones/actions.ts`: `'transfer'` sale de `Step`/`EJECUTAR` (`:21-27`); nueva acción `initiateTransfer(operationId, _estado, form)` con la forma de `declareRecipientIdentity` (`:64-84`). — deps: 10.5
- [x] 11.3 `apps/web/src/app/operaciones/[id]/page.tsx`: reemplazar el `OperationAction` de `:502-508` por `<TransferInitiationForm>` bajo la misma condición (`contract_signed && miParte === 'seller'`); `queEsperar()` corregido para `contract_signed` — vendedor: *"Queda un último paso tuyo: cedernos el control del activo..."*; plataforma: *"Esperamos que el vendedor nos ceda el control y lo declare."* — deps: 11.1, 11.2
- [x] 11.4 `apps/web/src/components/ui.tsx:58`: badge de `transfer_in_progress` de `TRANSFIRIENDO` a `VERIFICANDO`. — deps: ninguna
- [x] 11.5 `apps/web/src/components/Timeline.tsx:21`: título *Verificación* y texto *"El vendedor declaró haber cedido el control. La plataforma verifica y toma la custodia."* — deps: ninguna
- [x] 11.6 `apps/web/src/app/activos/[id]/page.tsx:357-488`: sacar el bloque `despues` (`:466-480`) del ternario de `ACCESO DE LA PLATAFORMA` para que se dibuje en las tres ramas, no solo en la de "todavía sin acceso". — deps: ninguna
- [x] 11.7 `apps/web/src/app/sistema/page.tsx` (+ `noop` en `actions.ts` si hace falta): catalogar `TransferInitiationForm`, junto a `CustodyVerificationForm`/`RecipientIdentityForm`. — deps: 11.1

## Fase 12: Web — tablero de admin

- [x] 12.1 `apps/web/src/app/admin/page.tsx`: `PROXIMO_PASO['contract_signed'] = 'Esperando que el vendedor ceda el control y lo declare'`; segundo `Panel` "ESPERANDO AL VENDEDOR" alimentado por `tablero.waitingOnSeller`, subordinado al de "ESPERANDO A LA PLATAFORMA" (`:125-168`), reusando el mismo renderizado de fila. — deps: 10.3

## Fase 13: Documentación y specs hermanas

- [x] 13.1 `CLAUDE.md:80`: borrar la línea *"Known gap: `payment_pending`..."* — corrección documental, ninguna conducta del sistema cambia. — deps: ninguna
- [x] 13.2 `docs/fase-N-transferencia-simplificada.md` (numerar según la última fase escrita): write-up de la fase, según convención del proyecto. — deps: todas las anteriores
- [x] 13.3 Editar en el momento `openspec/changes/asset-custody-identity/specs/asset-delivery/spec.md:47-51` y `openspec/changes/asset-custody-identity/specs/custody-account/spec.md:124-127`, reemplazando los dos escenarios señalados por el contenido ya redactado en `specs/asset-delivery/spec.md` y `specs/custody-account/spec.md` **de este cambio**. Ningún requirement queda invalidado; esto no es un archivado. — deps: 4.2, 1.2

## Fase 14: Verificación

- [x] 14.1 `make test` (suite completa: dominio, db, api, api-client) en verde. — deps: todas
- [x] 14.2 `tsc --noEmit` en `domain`, `db`, `api-contract`, `api`, `api-client`, `web` — vitest no typechequea, así que este gate es aparte y obligatorio. — deps: todas
- [ ] 14.3 **[USUARIO]** `make db-reset` aplica las dos migraciones nuevas (`add_cesion_pendiente_notification`, `add_transfer_initiation`) sin intervención. Prisma bloquea `migrate reset` para agentes de IA sin consentimiento explícito del usuario. — deps: 2.3, 6.2
- [x] 14.4 `pnpm --filter web build`. — deps: Fase 11, Fase 12
- [ ] 14.5 **[USUARIO]** Walkthrough manual: (a) vendedor de YouTube declara la cesión y ve su paso concreto; (b) vendedor de un listing web declara con la lista vacía; (c) admin confirma custodia y puede leer las dos cuentas congeladas (declarada y verificada); (d) el vendedor recibe `cesion_pendiente` y el comprador `contrato_firmado`; (e) el tablero separa `contract_signed` de las esperas a la plataforma. — deps: 14.4
