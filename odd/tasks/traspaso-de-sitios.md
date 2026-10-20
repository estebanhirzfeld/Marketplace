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
- [ ] T2 Progreso por paso persistido: entidad `TransferStepProgress`, puerto, tabla aditiva `transfer_step_progress`, mapper y repositorio. Ruta: escritor delegado.
- [ ] T3 Puerto `IDomainRegistrar` y adaptador `HostingerDomainRegistrar` con `fetch` inyectable, cableado condicional y prueba en vivo de solo lectura. Ruta: escritor delegado.
- [ ] T4 Custodia del dominio en la operación: comprobación de la señal, guarda de aceptación, cuenta de custodia web sin `platformAccess`, `isPrimaryOwner` desde el portfolio. Ruta: escritor delegado.
- [ ] T5 Avisos de recordatorio, vencimiento y dominio en custodia (migración del enum). Ruta: escritor delegado.
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

## Próximo paso

T2.
