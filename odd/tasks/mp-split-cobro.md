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
- [x] **T2.1 Tests que faltan** (commit `2733f02`; los tests encontraron que el parser aceptaba una fecha ilegible y números no finitos, corregido) (sugerencias de la revisión de T1.1 y T2, no bloqueantes): rutas de error del parser de cotizaciones en `OperationMapper` (columna que no es arreglo, entrada sin campos, fecha inválida, número no finito) y un pago de Mercado Pago en USD rechazado cuando hay cotizaciones. Ruta: inline, junto con la próxima tarea de dominio.
- [x] **T2 Persistencia de la cotización** (commit `8a52412`, migración `20261005183603_add_settlement_quotes`: una columna JSONB nullable). Columnas Prisma y mapper de `Operation`, migración. Aceptación: ida y vuelta con la base real. Ruta: delegada.
- [x] **T3.1 Endurecer el cliente del BCRA** (commit `82a1960` la espera tras una falla; el aviso por tasa manual mal escrita quedó en `fa72c71`) (sugerencias de la revisión de T3, no bloqueantes): (a) breve espera tras una falla para acotar la latencia durante una caída del BCRA, porque hoy cada llamada espera hasta 5 s; (b) un `EXCHANGE_RATE_OVERRIDE_USD_ARS` mal escrito (por ejemplo `1.500,5`) se ignora sin aviso: avisar en el arranque con un registro. Ruta: inline, junto con la tarea que toque `container.ts`.
- [x] **T3 Cliente del BCRA** (commit `cf33eca`; apagado por defecto con `EXCHANGE_RATE_ENABLED`, tasa manual con `EXCHANGE_RATE_OVERRIDE_USD_ARS`). Adaptador del puerto con caché diaria, último valor guardado y override de admin. Aceptación: tests con `fetch` inyectado; sin respuesta ni valor guardado, MP no se ofrece. Ruta: delegada.
- [ ] **T4.1 Existencia de la cuenta sin descifrar** (advertencia de la revisión de T4, no bloqueante): la puerta de publicación solo necesita saber si hay una cuenta vinculada, pero `findByUserId` descifra los dos tokens; con la clave rotada, perdida o una fila corrupta, un vendedor vinculado recibiría un error genérico en vez de un aviso claro. Corrección prevista: `existsByUserId` en el puerto y en el repositorio, sin descifrar, y que la puerta lo use; más un test de la puerta con un repositorio que lanza. Ruta: se hace dentro de T5, que ya toca el repositorio.
- [x] **T4 Cuenta de MP del vendedor** (commit `fa72c71`, migración `20261005230711_add_seller_payment_accounts`; cifrado AES-256-GCM, requisito de vincular detrás de `REQUIRE_MP_LINK_TO_PUBLISH`, apagado por defecto). Modelo, repositorio, cifrado AES-GCM detrás de un puerto, requisito de vincular para publicar. Ruta: delegada.
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

- 2026-10-05: **T3 y T2.1 hechas** en dos commits (`2733f02`, `cf33eca`), escritor delegado con verificación del padre. API 87 tests sin base, dominio 684, base 55 (descartable), typecheck de `api`, `domain` y `db` limpio. RED observado: el proveedor no existía; los tests del parser fallaron en 2 casos (fecha inválida y número no finito). El test de dominio del pago en USD ya pasaba (la conducta existía). Cambio de diseño del padre: el override del admin es una variable de entorno (no una tabla ni una pantalla) y el cableado queda detrás de `EXCHANGE_RATE_ENABLED`, apagada por defecto.
- 2026-10-05: revisión nativa del tramo `8a52412..cf33eca` (evaluación `medium`, 8 archivos, 616 líneas): `granted`, una lente, **approved**, autoridad consumida, dos sugerencias no bloqueantes (pasaron a T3.1). El candidato acumulado (136 archivos) se omitió otra vez (`declined`).
- Límite revisado: `cf33eca`. Las evaluaciones siguientes usan `--base-ref cf33eca`.

- 2026-10-05: **T4 y T3.1 hechas** en dos commits (`82a1960`, `fa72c71`), escritor delegado y verificación del padre (lectura completa del cifrado, del repositorio y del cableado). Dominio 702 tests, base 64 (descartable), API 107, typecheck de los tres paquetes limpio. RED observado en entidad, repositorio, cifrado y espera del BCRA. El usuario aprobó el cifrado con clave de entorno y la vinculación obligatoria para todos los vendedores.
- 2026-10-05: revisión nativa del tramo `cf33eca..fa72c71` (evaluación `medium`, 19 archivos, 1.135 líneas, motivo: el cifrado): `granted`, una lente, **approved**, autoridad consumida, una advertencia no bloqueante (pasó a T4.1). El candidato acumulado (148 archivos) se omitió otra vez (`declined`).
- Límite revisado: `fa72c71`. Las evaluaciones siguientes usan `--base-ref fa72c71`.

## Siguiente paso
T5: OAuth de Mercado Pago (cliente con `state` y PKCE, canje, refresco perezoso, rutas de API y callback web), junto con T4.1. Delegado.
