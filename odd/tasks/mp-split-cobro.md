# Cobro con split de Mercado Pago y pesificación con A3500

Rama: `feat/mp-split-cobro` (base `origin/fase-5-frontend-y-avisos` en `c6060e5`). Estrategia de entrega: `stacked-to-main`, un PR por tarea o grupo de tareas chicas, sin push a `fase-5-frontend-y-avisos` salvo por PR.
Plan completo y decisiones: `~/.claude/plans/verifica-con-mcp-faltaba-enchanted-spark.md`. Memoria: Engram `auditoria-ux-moneda-split` y espejo `odd/mp-split-cobro/tasks`.

## Objetivo
El comprador elige cómo pagar. Con Mercado Pago, el vendedor cobra directo (split 1:1, OAuth por vendedor) y la plataforma retiene su comisión con `marketplace_fee`. Las operaciones en USD se pesifican con la cotización A3500 del BCRA, congelada al crear el checkout. La transferencia sigue disponible siempre, en la moneda original, confirmada por un admin.

## Por qué
- El 2-oct un pago de una operación en USD se cobró en pesos y `confirmBuyerPayment` lo rechazó; la operación quedó aceptando pagos.
- Spike del 5-oct (sandbox, split real): MP convierte USD a ARS y el `marketplace_fee` se cobra siempre en moneda local (US$ 100 con fee 10 dio $ 152.000 y $ 10). Por eso la plataforma debe calcular la comisión en ARS con una cotización conocida de antemano.

## Alcance autorizado
Dominio, persistencia, API y web del cobro, la cuenta de MP del vendedor, la cotización y el selector de método de pago. Fuera de alcance: vencimientos y recordatorios, reembolsos automáticos, job de refresh de tokens (alcanza el refresh perezoso), tratamiento de contracargos.

## Decisiones fijas
- Cotización: A3500 del último día hábil publicado (API pública del BCRA), con caché, último valor guardado como respaldo y override cargado por un admin. Vigencia del checkout: 24 h.
- Redondeo: la comisión en ARS es `total en ARS − lo que recibe el vendedor en ARS`; el redondeo lo absorbe la plataforma.
- Vincular MP es obligatorio para publicar (todas las monedas); sin vendedor vinculado no se ofrece MP.
- Opcional, a confirmar al llegar a esa tarea: que un listing pueda desactivar MP y aceptar solo transferencia.
- Textos: sin "más rápido" ni "más seguro" para la transferencia.
- El guard de USD del hotfix (`CreateCheckoutUseCase`) se mantiene hasta que T1 a T4 estén integradas.

## Modo de trabajo
TDD **activo** (fuente: convención del proyecto en `CLAUDE.md`; runner: `vitest`; dominio con `pnpm --filter @marketplace/domain exec vitest run`, API con `pnpm --filter api exec vitest run`). RED observado antes de cada implementación. Los tests de integración de la API (`http.test.ts`) borran datos: no se corren contra la base de desarrollo con datos.
Ruta por tarea: escritor delegado (`sonnet`) cuando toca 2 o más archivos no triviales; el padre verifica, hace el commit y registra.

## Tareas
- [ ] **T1 Dominio: cotización congelada.** Value object de cotización (tasa, fecha, monto en ARS, comisión en ARS), puerto `IExchangeRateProvider`, `Operation` guarda la cotización y `confirmBuyerPayment` compara contra ella cuando existe. `CreateCheckoutUseCase` arma el pedido en ARS desde la cotización. Aceptación: operación en USD con cotización acepta el pago en ARS por el monto congelado y rechaza cualquier otro; operaciones en ARS sin cambios. Ruta: delegada.
- [ ] **T2 Persistencia de la cotización.** Columnas Prisma y mapper de `Operation`, migración. Aceptación: ida y vuelta con la base real. Ruta: delegada.
- [ ] **T3 Cliente del BCRA.** Adaptador del puerto con caché diaria, último valor guardado y override de admin. Aceptación: tests con `fetch` inyectado; sin respuesta ni valor guardado, MP no se ofrece. Ruta: delegada.
- [ ] **T4 Cuenta de MP del vendedor.** Modelo, repositorio, cifrado AES-GCM detrás de un puerto, requisito de vincular para publicar. Ruta: delegada.
- [ ] **T5 OAuth de MP.** Cliente con `state` aleatorio, PKCE S256, canje y refresh perezoso con bloqueo; rutas de API y callback web. Ruta: delegada.
- [ ] **T6 Gateway con split.** Token del vendedor, `marketplace_fee` en ARS, resolución del token en el webhook por `user_id`. Ruta: delegada.
- [ ] **T7 Selector de método de pago.** Pantalla previa a "Pagar", instrucciones de transferencia, confirmación del admin, mensaje real cuando falla. Ruta: delegada.
- [ ] **T8 Cierre.** `docs/fase-*.md`, `docs/gant.json`, textos desactualizados. Ruta: inline.

## Checks por tarea
Tests del paquete tocado en verde, typecheck de `domain` y `api`, y verificación manual en local cuando haya UI. Cada tarea cierra con al menos un commit convencional en la rama; el commit se registra abajo como evidencia.

## Revisión nativa
Se evalúa tras cada commit con `gentle-ai review assess --base-ref <último límite revisado> --committed-only`. El límite inicial es `c6060e5`.

## Progreso y evidencia
- 2026-10-05: documento creado, rama y worktree listos. Aún sin código.

## Siguiente paso
Delegar T1.
