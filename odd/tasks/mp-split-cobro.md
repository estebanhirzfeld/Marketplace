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
- [x] **T1 Dominio: cotización congelada** (commit `51bea09`). Value object de cotización (tasa, fecha, monto en ARS, comisión en ARS), puerto `IExchangeRateProvider`, `Operation` guarda la cotización y `confirmBuyerPayment` compara contra ella cuando existe. `CreateCheckoutUseCase` arma el pedido en ARS desde la cotización. Aceptación: operación en USD con cotización acepta el pago en ARS por el monto congelado y rechaza cualquier otro; operaciones en ARS sin cambios. Ruta: delegada.
- [x] **T1.1 Pagos contra una cotización reemplazada** (commit `8a52412`; queda para T6 fijar `expiration_date_to` de la preferencia) (seguimiento del hallazgo `R3-stale-quote-overwrite`, advertencia no bloqueante de la revisión de T1). `quoteSettlement` reemplaza la cotización y `confirmBuyerPayment` solo valida contra la última: un pago hecho desde un link generado con una cotización anterior llega por el monto viejo y se rechaza con la plata ya cobrada. Corrección prevista: guardar las cotizaciones emitidas y aceptar un pago que coincida con cualquiera de ellas, y que T6 fije `expiration_date_to` de la preferencia en `expiresAt` de la cotización. Test que falta: pago contra una cotización reemplazada. Ruta: delegada, junto con T2 porque toca la persistencia.
- [ ] **T2.1 Tests que faltan** (sugerencias de la revisión de T1.1 y T2, no bloqueantes): rutas de error del parser de cotizaciones en `OperationMapper` (columna que no es arreglo, entrada sin campos, fecha inválida, número no finito) y un pago de Mercado Pago en USD rechazado cuando hay cotizaciones. Ruta: inline, junto con la próxima tarea de dominio.
- [x] **T2 Persistencia de la cotización** (commit `8a52412`, migración `20261005183603_add_settlement_quotes`: una columna JSONB nullable). Columnas Prisma y mapper de `Operation`, migración. Aceptación: ida y vuelta con la base real. Ruta: delegada.
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
- 2026-10-05: **T1 hecha.** Ruta: escritor delegado (sonnet), verificación del padre. Commit `51bea09`. Dominio 671 tests en verde (línea base 636), typecheck de `domain` y `api` limpio. RED observado: los tres archivos de test fallaban por imports inexistentes y tres casos nuevos de `CreateCheckoutUseCase` fallaban antes de implementar; los tests de `SettlementQuote` no se vieron fallar uno por uno. La rama es inerte en producción hasta cablear el proveedor de cotización (T3).
- 2026-10-05: revisión nativa de T1: evaluación `medium`, 8 archivos y 718 líneas, `review_due` por presupuesto del tramo. Consentimiento `granted`, una lente (`review-reliability`), resultado **approved**, autoridad consumida. Un hallazgo no bloqueante (`R3-stale-quote-overwrite`, pasó a T1.1). El candidato acumulado de toda la rama (133 archivos) se omitió por decisión del usuario (`declined`); antes había fallado por presupuesto de contexto.
- Límite revisado: `51bea09`. Las evaluaciones siguientes usan `--base-ref 51bea09`.

- 2026-10-05: **T1.1 y T2 hechas** en un solo commit `8a52412` (escritor delegado, verificación del padre). Dominio 683 tests, base de datos 47 tests en una base descartable `marketplace_scratch` (la base `marketplace_dev` quedó intacta: 5 usuarios, 7 activos, 6 operaciones, sin la columna nueva). RED observado en dominio (9 tests) y en la base (cotizaciones perdidas al leer). Defecto corregido por el padre con TDD antes del commit: una transferencia en la moneda original se rechazaba si ya había cotizaciones; ahora las cotizaciones valen solo para pagos de Mercado Pago.
- 2026-10-05: revisión nativa del tramo `51bea09..8a52412` (evaluación `medium`, 9 archivos, 406 líneas): consentimiento `granted`, una lente, **approved**, autoridad consumida, tres sugerencias no bloqueantes (pasaron a T2.1). El candidato acumulado (134 archivos) se omitió otra vez (`declined`).
- Límite revisado: `8a52412`. Las evaluaciones siguientes usan `--base-ref 8a52412`.

## Siguiente paso
T3: cliente del BCRA con caché y override de admin, delegado.
