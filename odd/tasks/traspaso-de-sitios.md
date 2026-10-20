# traspaso-de-sitios — Traspaso de un sitio con el dominio en custodia

Rama: `feat/traspaso-de-sitios` (apilada sobre `feat/rechazar-dominios-ar`, que todavía no tiene PR; se rebasa sobre `origin/fase-5-frontend-y-avisos` cuando ese PR se mergee).
TDD: activado (fuente: `CLAUDE.md` del proyecto, "TDD is expected"). Runners: `pnpm --filter @marketplace/domain exec vitest run`, `pnpm --filter @marketplace/api exec vitest run`, `pnpm --filter @marketplace/db exec vitest run` (contra `marketplace_test`), `pnpm --filter web exec vitest run`. En este worktree `pnpm` se invoca como `corepack pnpm` y antes hay que compilar `@marketplace/shared-types`.
Plan aprobado: `~/.claude/plans/dale-starry-stearns.md`. Evidencia previa: Engram #305 a #308.
Ítem de la épica: «Traspaso de un sitio con pasos comprobables y plazos», etapa 1b de `odd/epica-cierre-mvp.md`.
Entrega: `ask-on-risk`. El pronóstico supera las 400 líneas, así que antes del segundo commit se elige la estrategia de cadena.

## Objetivo

Que la venta de un sitio con dominio genérico proteja al comprador igual que la de un canal: la plataforma retiene el activo mientras se paga y lo entrega después, con pasos que se comprueban solos donde se puede y con plazos.

## Problema

`WebStrategy` va de vendedor a comprador sin pasar por la custodia, los pasos de la operación de un sitio no se muestran (no tienen fase), `TransferStep.automated` no lo usa nadie, los pasos no se guardan y el sistema no tiene ninguna tarea periódica.

## Decisiones (del usuario, 20/10/2026)

- La plataforma protege al comprador reteniendo el activo, no la plata: con el split de Mercado Pago el vendedor cobra directo y retener fondos encuadra como PSP del BCRA y sujeto obligado ante la UIF.
- La plataforma es titular temporal del dominio en su cuenta de Hostinger. Prueba real con `deliaorrego.online`: trasladar entre cuentas exige cargar los datos del titular, y custodiar sin ser titular le dejaría al vendedor un veto sobre la entrega.
- Hostinger es el único registrador del MVP. Un vendedor en otro registrador primero muda el dominio a Hostinger con el EPP.
- Hosting, código, GA4, Shopify y afiliados son pasos declarados con respaldo del admin.

## Decisiones de diseño

- El dominio entra en custodia durante la operación, después de firmar, y no al publicar: la custodia es corta. `Listing.assertCanBeTransferred()` no se llama en ningún lado; la compuerta real es `confirmAssetCustody`, que exige `isPrimaryOwner`.
- Se reutilizan las transiciones existentes (`initiateTransfer`, `confirmAssetCustody`, `confirmBuyerPayment`, `complete`); no hay estados nuevos.
- La señal de custodia sale de la API de Hostinger (portfolio y traslados entrantes y salientes), no de RDAP. La API no tiene webhooks: un job periódico consulta.
- El job solo acepta un traslado entrante si el dominio corresponde a una operación web en `transfer_in_progress`.
- Aceptar un traslado no lo completa: Hostinger manda un mail al nuevo titular. Esa confirmación es humana y la atestigua el admin.
- Plazos: las invitaciones de traslado vencen a los 10 días; recordatorio a los 7 y escalada al admin al vencer.

## Tareas

- [x] T1 Pasos con tipo de comprobación: `automated` → `key` estable + `check: 'automatic' | 'declared' | 'admin'`; pasos de web reescritos con fase, título e instrucción; `GetOperationDetailsUseCase` entrega los pasos de operación de un sitio. Ruta: escritor delegado (varios archivos no triviales).
- [x] T2 Progreso por paso persistido: entidad `TransferStepProgress`, puerto, tabla aditiva `transfer_step_progress`, mapper y repositorio. Ruta: escritor delegado. Commit `6070aee`. RED: `TransferStepProgress.test.ts` falló por módulo inexistente; VERDE: 43 tests, dominio 70 archivos / 1143 tests, `tsc` de dominio y db sin errores. Tests de db (`transfer-step-progress.test.ts`) escritos pero NO ejecutados: el Postgres de `docker-compose.yml` (puerto 5434) no está levantado y el del 5432 no tiene el rol `marketplace`.
- [x] T3 Puerto `IDomainRegistrar` y adaptador `HostingerDomainRegistrar` con `fetch` inyectable, cableado condicional y prueba en vivo de solo lectura. Ruta: escritor delegado. Commit `ce7ea58`. RED: `HostingerDomainRegistrar.test.ts` falló por módulo inexistente (`Failed to load url ../src/adapters/HostingerDomainRegistrar`); VERDE: 33 tests del adaptador y 5 del contenedor, api 22 archivos / 537 tests (2 archivos en vivo omitidos), dominio 70 archivos / 1143 tests, `tsc` de dominio y api sin errores. La prueba en vivo (`HostingerDomainRegistrar.live.test.ts`) NO se ejecutó: no hay token.
- [x] T4 Custodia del dominio en la operación: comprobación de la señal, guarda de aceptación, cuenta de custodia web sin `platformAccess`, `isPrimaryOwner` desde el portfolio. Ruta: escritor delegado. Commits `f9d2440` (dominio) y `b7c2870` (api). RED: `CheckDomainCustody.test.ts` falló por módulo inexistente y `WebCustody.test.ts` 6 de 12 tests en rojo; VERDE: 16 + 12 tests nuevos, dominio 72 archivos / 1171 tests, `tsc` de dominio y api sin errores. Test de la ruta (`http.test.ts`) escrito pero NO ejecutado: el Postgres de `marketplace_test` (puerto 5434) no responde, y el global setup de `apps/api` lo exige, así que tampoco corrió el resto de la suite de api.
- [x] T5 Avisos de recordatorio, vencimiento y dominio en custodia (migración del enum). Ruta: inline (una sola unidad de unas 200 líneas, sin motivo de escritor). Commit `4bb65bc` (el hash de antes de sumarle este dato al mismo commit). RED: `PlatformNotifications.test.ts` 3 en rojo (`is not a function`), `CheckDomainCustody.test.ts` 1 en rojo, `notificaciones.test.ts` 3 en rojo (`Invalid value for argument type`), web 4 de texto y la guarda de sitios en rojo; VERDE: dominio 72 / 1176, db 8 / 138, api 22 / 541 (5 omitidos), web 57 / 523, `tsc` de dominio, api y web sin errores.
- [ ] T6 Primer job periódico: caso de uso idempotente, entrypoint, servicio y timer de systemd. Ruta: escritor delegado.
- [ ] T7 Entrega al comprador: traslado saliente, `complete` exige la señal, atestiguar pasos declarados. Ruta: escritor delegado.
- [ ] T8 UI: lista de pasos con estado y plazo, panel del admin, aviso de los 60 días antes de ofertar, `/sistema`, guarda de textos de sitios. Ruta: escritor delegado.
- [ ] T9 Prueba de punta a punta con un dominio descartable y documentación (`docs/fase-20-*.md`, `docs/gant.json`, épica, cambio `web-escrow-transfer-steps`).

## Requisitos del usuario

- Cuenta de Hostinger de la plataforma, token de API y perfil WHOIS (persona o empresa: decisión pendiente). No bloquean T1 a T3.
- Una casilla con dueño para confirmar los mails de Hostinger dentro de los 10 días.

## Fuera de alcance

Otros registradores y `.ar`; señales automáticas de hosting, GA4 y foto de DNS; gestión de perfiles WHOIS desde la app; cualquier retención de fondos.

## Progreso

T1 hecha (`5529e4c`). `automated` se reemplazó por `key` + `check` en `TransferStep`; `HandoverStepDto` suma `key` y `check` opcionales (aditivo) y las rutas `me.ts` y `listings.ts` los serializan. `WebStrategy` pasa a: tener el dominio en Hostinger (listing), `domain-to-platform`, `hosting`, `code`, `accounts` (operation) y `domain-to-buyer` (plataforma). Pendiente para T4: `GetOperationDetailsUseCase` sigue exigiendo `listing.isReadyToTransfer()`, o sea `platformAccess` registrado; un sitio sin él seguirá recibiendo lista vacía hasta que T4 resuelva la custodia web sin `platformAccess`. `apps/api` no se ejecutó (`tsc` falla por Prisma sin generar, previo a este cambio; `http.test.ts` necesita base).

Corrección del padre en T1: el paso `domain-to-buyer` ofrecía el código EPP para llevar el dominio a otro registrador, pero el traslado a la cuenta de la plataforma ya activó el bloqueo de 60 días, así que durante la custodia esa mudanza está trabada. Ahora la entrega es siempre a la cuenta de Hostinger del comprador y el texto explica que mudarlo a otro registrador espera 60 días. RED visto (1 test), luego dominio 69 archivos / 1100 tests, `tsc` sin errores y guarda de textos de web 14 tests, todo verificado por el padre.

T2 hecha (`6070aee`). Entidad con transiciones validadas, `isOverdue`/`needsReminder` (3 días antes por defecto, configurable)/`needsEscalation` con reloj inyectado, y recordatorio y escalada de una sola vez. Puerto `ITransferStepProgressRepository` (`findByScope`, `find`, `findOpen`, `save` con upsert por `(scope, scopeId, stepKey)`). `findOpen` trae `pending`, `waiting` y `expired` sin escalar. Tabla `transfer_step_progress` sin clave foránea (`scopeId` apunta a activo u operación) y migración `20261020190000_add_transfer_step_progress`. No se integró al `PrismaUnitOfWork`: hoy solo tiene los cuatro repositorios transaccionales del flujo de venta. Pendiente: correr los tests de db contra `marketplace_test` cuando el Postgres esté arriba.

Verificado por el padre el 20/10/2026 contra `marketplace_test` (Postgres del docker-compose, puerto 5434): `packages/db` 8 archivos / 135 tests en verde, incluido el repositorio nuevo; `apps/api` 20 archivos / 499 tests en verde (3 omitidos), incluido `POST /listings` con `.com.ar` → 400 de `feat/rechazar-dominios-ar`, que hasta ahora no se había ejecutado.

T3 hecha (`ce7ea58`). Puerto `IDomainRegistrar` (`getPortfolioEntry`, `getIncomingMove`/`acceptIncomingMove`, `getOutgoingMove`/`startOutgoingMove`/`cancelOutgoingMove`, `getAuthCode`) con `DomainName` y `Email` como entradas y `null` para "no hay". Errores: `ServiceUnavailableError` (5xx, 429 agotado, 401/403, red, tiempo, cuerpo o estado fuera de la especificación), `DomainPremiumProtectionError` (428) y `DomainRegistrarRejectedError` (otro 4xx, y 404 en una escritura), ambos nuevos y subclases de `InvalidStateError`. Adaptador con Bearer, tiempo máximo de 8 s, un reintento ante 429 con `Retry-After` acotado a 5 s, y `domain_contacts` con el mismo perfil en los cuatro ids. Cableado: `Container.domainRegistrar` solo con `HOSTINGER_API_TOKEN` y `HOSTINGER_WHOIS_PROFILE_ID` (documentadas en `env.example`; `infra/README.md` no tiene tabla de variables y remite a ese archivo); un perfil que no sea entero positivo impide arrancar. Contra el OpenAPI: el 428 no figura en la especificación (viene de la prueba real), los estados de portfolio y traslado son cerrados y uno desconocido se trata como no disponible, y `force_sync` de los GET de traslado no se usa. La prueba en vivo debe correrse con un token real antes de T4 para confirmar los estados reales (`HOSTINGER_API_TOKEN=... vitest run tests/HostingerDomainRegistrar.live.test.ts`).

T4 hecha (`f9d2440`, `b7c2870`). `CheckDomainCustodyUseCase(operationRepo, listingRepo, progressRepo, registrar, now)`: guarda antes de tocar al registrador (operación en `transfer_in_progress` y listing web; si no, `InvalidStateError`/`ValidationError`). Cartera con el dominio → `done`; traslado `initiated` → `acceptIncomingMove` y `waiting` (`acceptedAt` en la evidencia, no se repite aunque Hostinger tarde en reflejarlo); `activating` → `waiting` (`awaitingEmailConfirmation`); sin nada → `pending` sin crear fila. El plazo es `createdAt` del traslado + 10 días y la fila nace recién cuando el traslado aparece (no desde `initiateTransfer`, que no tiene invitación que venza). Un `ServiceUnavailableError` sube y, con la fila en curso, solo anota `lastCheckedAt`; un paso vencido solo se cumple con el dominio en la cartera. `services/WebCustody.ts` suma `resolveCustodyAccountId` (el `platformAccess` vigente, o la primera cuenta activa de tipo web si el listing es un sitio y no lo tiene; YouTube sin cambios), `isWebListing` y `websiteDomainOf`. `InitiateTransferUseCase` y `ConfirmCustodyUseCase` reciben `custodyRepo` opcional; `ConfirmCustodyUseCase` recibe además el registrador opcional y, en un sitio, calcula `isPrimaryOwner` como «el dominio está en la cartera» ignorando lo que mande el admin. `GetOperationDetailsUseCase` entrega los pasos de operación de un sitio sin `platformAccess`. Cableado en `container.ts` (`checkDomainCustody` solo con registrador) y ruta `POST /admin/operations/:id/check-domain-custody` (admin, 503 sin registrador, responde `{ status }`); `PrismaTransferStepProgressRepository` se exporta de `@marketplace/db`. Para revisar: la cartera cuenta como «en custodia» con cualquier estado (no se filtra `deleted`/`failed`/`suspended`) porque los estados reales siguen sin confirmarse con la prueba en vivo; `siteDomain` privado de `VerifyOwnershipUseCases.ts` quedó duplicado con `websiteDomainOf`.

Pendiente de T4 cerrado el 20/10/2026 contra `marketplace_test` (5434): `apps/api` 22 archivos / 541 tests en verde (5 omitidos, en vivo), incluidos los 4 de `POST /admin/operations/:id/check-domain-custody`; `packages/db` 8 / 135.

T5 hecha. Tres tipos nuevos en `Notification`, `schema.prisma`, `api-contract` y las plantillas de `apps/web/src/lib/notifications.ts`, con la migración `20261020200000_add_transfer_step_notifications` (`ALTER TYPE ... ADD VALUE`, aditiva). `PlatformNotifier` suma `transferStepReminder(operation, step)` y `transferStepExpired(operation, step)` (llevan `occursAt` = plazo de la invitación) y `domainInCustody(operation)`. `CheckDomainCustodyUseCase` recibe `PlatformNotifier` opcional como sexto parámetro y avisa `dominio_en_custodia` al pasar a `done`, una sola vez porque un paso cumplido no vuelve a esa rama; el contenedor lo cablea. Los enlaces caen en `/operaciones/:id`. Supuesto (sin decisión explícita del usuario): los tres avisos van a los administradores, porque en `domain-to-platform` lo pendiente con plazo es confirmar el mail de Hostinger, que le llega a la plataforma; el recordatorio al comprador de `domain-to-buyer` se decide en T7. Recordatorio y vencimiento los dispara el job de T6 con `needsReminder`/`needsEscalation`.

## Próximo paso

T6: `RunTransferStepChecksUseCase` (idempotente, un error por dominio no corta el recorrido) que llama a `CheckDomainCustodyUseCase` y dispara `transferStepReminder`/`transferStepExpired` con `markReminded`/`markEscalated`; entrypoint `apps/api/src/jobs/run-transfer-checks.ts`; `infra/systemd/marketplace-transfer-checks.{service,timer}`. Sigue pendiente la prueba en vivo del adaptador (necesita `HOSTINGER_API_TOKEN`) y, con ella, filtrar los estados de cartera de T4.
