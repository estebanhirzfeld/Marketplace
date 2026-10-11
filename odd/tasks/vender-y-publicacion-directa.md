# Vender, publicación directa, acceso y verificaciones

## Objetivo

Que el vendedor elija el tipo de activo, ponga su precio sin confundirlo con la valuación, publique sin revisión cuando la titularidad está comprobada, pueda editar y borrar, y entienda qué le suma darnos acceso y vincular Mercado Pago.

## Problema y por qué

Observado en producción: `/vender` no elige tipo, el precio se confunde con la valuación, crear deja al vendedor sin saber qué sigue, nada se edita ni se borra, y el panel «Acceso de la plataforma» explica de más y expone la logística.

## Alcance autorizado

Plan aprobado el 11/10: `~/.claude/plans/pasted-content-id-7d4b-primero-que-nested-finch.md`.
Diseño cerrado en el lienzo https://claude.ai/artifact/Mr8uBXhWWn79eSDk6bB3XU (VenderFlujo, PrecioA, BorradorV4, BorradorSinVerificar, PanelD/F, ModalH, VerifL).

## Restricciones

- TDD estricto: RED → GREEN → REFACTOR. Origen: CLAUDE.md del proyecto. Runner: Vitest (`make test-domain`, `pnpm --filter <pkg> exec vitest run`).
- Los tests de base corren contra `marketplace_test`; nunca resetear `marketplace_dev`.
- Identificadores en inglés y textos en español.
- Commits Conventional sin atribución.
- Next.js 16: leer `node_modules/next/dist/docs/` antes de tocar páginas.
- Antes de la venta solo se explica el acceso de administración. Quitar el acceso directo y el propietario principal van en la operación.
- Nivel de vendedor: titularidad +1, acceso +2 y Mercado Pago +1, sobre 4. KYC es requisito, no suma.

## Tareas

- [x] T1 · Dominio y API: `publish()` con titularidad comprobada, `editDraft()`, `changePrice()` y `discard()`; casos de uso y rutas `POST /listings/:id/publish`, `PATCH /listings/:id` y `DELETE /listings/:id`. Ruta: delegado (2+ archivos no triviales).
- [x] T2 · Dominio: pasos por fase en `getTransferSteps`; `requestPlatformAccess()` con `platformAccessRequestedAt` (migración y mapper); ruta de acceso solicitado; estado del acceso en el DTO. Ruta: delegado.
- [x] T3 · Verificación del acceso con OAuth de la cuenta de custodia y botón en `/admin`. Ruta: delegado.
- [x] T4 · Mercado: `sort=relevance` por defecto (transferibles primero). Ruta: delegado.
- [x] T5 · Web `/vender`: tarjetas por tipo con indicador de pasos, precio primero con la referencia al costado, redirección al borrador. Ruta: delegado.
- [x] T6 · Web: borrador (publicar, editar, borrar), panel de acceso de 2 pasos, modal H, Verificaciones L con nivel, isotipo de Mercado Pago, `/sistema`. Ruta: delegado.
- [ ] T6.1 · Antes de T7, observado en la prueba local del 11/10:
  - (a) Avisar al admin cuando un vendedor toca «Ya los invité»: hoy solo aparece en el panel.
  - (b) Rediseñar el panel «Esperan verificación de acceso»: pasa desapercibido y no escala con muchos pendientes.
  - (c) Cubrir el caso del vendedor que tocó «Ya los invité» sin invitar: hoy su botón desaparece y queda «verificando» para siempre. Que el admin pueda marcar «no encontramos la invitación», con aviso al vendedor y vuelta a pendiente.
  - (d) Editar una cuenta de custodia con un identificador repetido devuelve 500 («Error interno del servidor»), por la restricción única de `identifier`. Debe devolver 409 con un mensaje claro.
  - (e) El mensaje de canal no administrado todavía dice «elegí la Cuenta de Marca». Con el selector nuevo debe decir «elegí el canal».
  - (f) Antes de T7, revisar en producción que la cuenta de custodia de YouTube no sea el marcador del seed (`custodia-yt-01@forzalabs.online`).
  - (g) Qué hace la tarjeta «Canal de YouTube» según los canales ya conectados del vendedor (decidido por el usuario el 11/10):
    - Canal ya publicado (o en operación o vendido): no se ofrece. Si no queda ninguno disponible, se conecta otro canal directamente.
    - Canal con borrador: vista intermedia con «Continuar con el borrador de <canal>» (va a `/activos/<id>`) o «Publicar otro canal».
    - Canal conectado sin activo: se ofrece como hoy.
  - (h) El texto al pie del formulario dice «Para publicarlo hay que enviarlo a revisión». Con titularidad comprobada se publica directo: actualizarlo.
  - (j) Usar `enable_yt_permissions=true` también en la conexión del vendedor. El selector viejo lista cuentas («Traspaso Brand Account»), no canales, y el vendedor elige la cuenta personal sin canal. El nuevo lista los canales por nombre.
  - (k) En el modal, el mail de custodia se copia al portapapeles con un clic, con la confirmación «Copiado».
  - (l) «Abrir en Google» cae en la lista de cuentas de marca. El paso 1 del modal debe decir «Elegí la cuenta de marca de tu canal y tocá "Administrar permisos"», y aclarar que el nombre de la cuenta puede no ser el del canal.
  - (m) Si el canal no coincide, el mensaje tiene que nombrar qué canal se eligió y cuál es el del activo.
- Arreglo en la prueba local: la verificación usaba `prompt=select_account` y Google recordaba el canal elegido antes («Forza Labs», sin canal), así que no volvía a mostrar el selector. Pasa a `select_account consent`. RED: el test de la URL falló; GREEN: api 408/408 y `tsc` limpio.
- Prueba local del 11/10: con `contacto.forzalabs@gmail.com`, «Lovi en Reddit» dio «La cuenta elegida no administra este canal». Es el resultado correcto: ese vendedor nunca nos invitó, que es el caso (c).
- [ ] T7 · Producción: habilitar `YOUTUBE_*` en la VM (requiere autorización explícita).

## Criterios de aceptación

- Un canal conectado se publica sin pasar por `under_review`.
- Un sitio web sin titularidad va a revisión.
- El precio se edita estando publicado; el borrador se edita y se borra.
- «Ya los invité» muestra «Verificando» y el admin confirma con OAuth.
- El mercado ordena primero los activos con transferencia inmediata.

## Entrega

Forecast: unas 2500 líneas en total. Estrategia: ask-on-risk → **feature-branch-chain** (elegida el 11/10). Cada rebanada es un PR contra la rama anterior y todo se integra en `feat/vender-y-publicacion-directa`, que se mergea al final.

## Progreso y evidencia

- **T1** (`d1c98e8`, ruta: delegado).
  - Agrega `publish()`, `editDraft()`, `changePrice()` y `assertCanBeDiscarded()`, el guarda compartido `PublishingRequirements`, el puerto `IListingDeleter` y las rutas `POST /listings/:id/publish`, `PATCH /listings/:id` y `DELETE /listings/:id`.
  - RED: `ListingDirectPublish` (27 fallaron), integración «eliminación» (4 fallaron), http «Publicación directa» (12 fallaron).
  - GREEN:
    - dominio: 925/925;
    - db: 114/114;
    - api: 382/382;
    - `tsc` limpio;
    - control del orquestador: 41/41.
  - RDD: riesgo medio, `slice_budget_reached`. Consentimiento `granted`; revisión `review-2d19bab0e36df110` aprobada y reconocida (autoridad consumida). El límite revisado avanza a `d1c98e8`.
  - Hallazgos informativos, como trabajo aparte:
    - `R3-publish-bypasses-rejection`: un activo rechazado por el admin se podía publicar directo. Se corrige en T2: rechazado vuelve a revisión.
    - `R3-edit-published-lost-update`: dos ediciones concurrentes de un publicado, la última gana. Se acepta por ahora.
    - `R3-delete-silent-noop`: el borrado de un activo que ya no es borrador no avisa. El caso de uso valida antes, así que solo queda la carrera.

- **T2** (ruta: delegado).
  - Agrega `TransferStep.phase` (`listing` / `operation`). Antes de la venta solo quedan la cuenta de marca y la invitación como administrador; los pasos de la operación aparecen recién con el contrato firmado y los 7 días cumplidos.
  - Suma `requestPlatformAccess()` (conserva la primera fecha), `platformAccessStatus()` (pending, verifying, waiting o immediate), la migración `20261011120000_add_platform_access_requested_at`, `POST /listings/:id/acceso-solicitado` y el DTO.
  - `publish()` queda solo para borradores: un rechazado vuelve a revisión.
  - RED:
    - dominio: 27 fallaron;
    - db: 1 falló;
    - api: 4 fallaron.
  - GREEN:
    - dominio: 951/951;
    - db: 117/117;
    - api: 388/388;
    - `tsc` limpio en 6 paquetes;
    - control del orquestador: 42/42.
  - RDD: riesgo medio, `slice_budget_reached`. Consentimiento `granted`; revisión `review-cb49087334296cba` aprobada y reconocida. El límite revisado avanza a `ddc69e5`.
  - Hallazgos informativos:
    - `R3-request-access-overwrites-admin-constancia`: si el vendedor guarda su aviso al mismo tiempo que el admin registra el acceso, puede pisarse la constancia (carrera de escritura). Mitigar con un update parcial de la columna en T3 o después.
    - `R3-operation-signed-denylist`: la condición de «contrato firmado» se expresa como lista de exclusión de estados; conviene una lista de inclusión.
  - Pendiente: aplicar la migración a `marketplace_dev` con `migrate deploy` (aditiva) antes de probar en local.

- **T3** (ruta: delegado).
  - Reusa `IYouTubeOwnershipReader.channelsOf` (OAuth `online` con `login_hint` de la cuenta de custodia, sin token guardado).
  - Agrega `VerifyPlatformAccessUseCases` (lista, inicio y verificación) y tres rutas admin en `me.ts`.
  - El estado `acceso:<id>:<hex>` queda atado a la cookie `traspaso_acceso_verif`; la misma URL de callback, sin registrar una nueva en Google.
  - Suma el panel «Esperan verificación de acceso» en `/admin`.
  - RED:
    - dominio: no cargaba el módulo;
    - adaptador: 1 falló;
    - http: 8 fallaron;
    - web: falta el módulo.
  - GREEN:
    - dominio: 967/967;
    - api: 398/398;
    - web: 251/251;
    - `tsc` limpio;
    - control del orquestador: 16/16.
  - `lint` del web: 2 errores previos en `error.tsx` y `global-error.tsx`, que no se tocaron.

- **T4** (ruta: delegado).
  - El orden por defecto pasa a ser `relevance`: primero lo que está listo para transferir, después lo publicado más reciente, con un desempate estable por id.
  - El reloj se inyecta en `GetPublishedListingsUseCase`.
  - «Relevancia» es la primera opción de `MarketSort` y no ensucia la URL.
  - RED: 4 de 30 fallaron.
  - GREEN:
    - dominio: 973/973;
    - api: 398/398;
    - web: 251/251;
    - `tsc` limpio;
    - control del orquestador: 30/30.
  - `lint`: solo los 2 errores previos.

- **Revisión T3+T4** (`review-ee61b5e3a84403eb`).
  - El commit de T4 movió el candidato de T3, así que se rearmó como uno solo: T3 y T4, 22 archivos y 1478 líneas. Consentimiento `granted`, revisión aprobada y reconocida. El límite revisado avanza a `d9c7c27`.
  - Hallazgos informativos:
    - `R3-oauth-verify-does-not-prove-custody-identity` (WARNING): la verificación probaba que la cuenta elegida administra el canal, pero no que fuera la cuenta de custodia. **Cerrado** con `enable_yt_permissions=true` más `openid email`: probado con Pc Lover el 11/10, el ID token trae el mail real de quien entra y `channels.list` trae el canal elegido.
      - Nuevo puerto `IYouTubeCustodyAccessReader.authorizedChannelsOf`. Se exige el mail verificado igual a la cuenta de custodia y después el canal. La nota de la constancia guarda el mail y el `sub`.
      - La web muestra `acceso=otra-cuenta`.
      - RED: dominio 10 fallaron, adaptador 8, http 1, web 4.
      - GREEN: dominio 977, api 408, web 301, `tsc` limpio.
    - `R3-first-active-custody-account-arbitrary`: con varias cuentas de custodia activas se usa la primera.
    - `R3-google-error-reported-as-cancelled`: un error de Google se informa como «cancelada».
    - `R3-awaiting-access-failure-silent`: si falla la lista de pendientes, el panel no se muestra y no avisa.
- **T5** (ruta: delegado).
  - Portada de `/vender` con tarjetas por tipo (`AssetTypeCard`, logos YouTube y web), `SellSteps` y «← Cambiar tipo».
  - `PriceSection`: tu precio primero y la referencia al costado, con `priceDifference` y `comparableEstimate`.
  - `/sistema` actualizado.
  - Brecha: la valuación solo existe en USD. Si el vendedor elige ARS se muestra «en USD», sin diferencia porcentual. Convertirla necesita un endpoint de cotización.
  - RED: `pricing`, `SellSteps`, `isTypePick` y `PriceSection` sin implementación.
  - GREEN:
    - web: 271/271;
    - `tsc` limpio;
    - `lint`: solo los 2 errores previos.

- **Revisión T5** (`review-09033ece032324e0`): consentimiento `granted`, aprobada y reconocida. El límite revisado avanza a `886bba9`.
  - Hallazgos informativos:
    - `R3-type-pick-ignores-oauth-success-return`: lo revisé y el callback exitoso vuelve con `?canal=`, así que no aparece la portada. Queda como sugerencia de test.
    - `R3-price-input-hardcoded-dom-id`: el id del input es fijo; conviene `useId`.
    - `R3-other-currency-label-hardcoded-usd`.
    - Faltan tests de las ramas de las tarjetas y del texto base.

- **T6** (ruta: delegado).
  - Borrador: `DraftPanel` (listo, sin verificar o rechazado), `SellMoreAside`, `EditListingDialog` y `DiscardDraftButton` (borrado en dos pasos, sin `confirm()`).
  - Acceso: `AccessPanel` (solo la fase `listing`), `AccessStatusPanel` y `AccessInstructionsDialog` con `GoogleMock` y `WhyPopover`; el paso 1 se guarda en `localStorage` con try/catch.
  - Verificaciones: `SellerLevelGauge` y `VerificationCards`; Mercado Pago sale de `paymentAccountStatus()`.
  - Se suman `CheckIcon` y `CheckLine` a `ui.tsx`, y `/sistema` queda actualizado.
  - RED: `sellerLevel`, `accessCountdown`, `accessProgress` y `listingEdit` sin módulo.
  - GREEN:
    - web: 295/295;
    - `tsc` limpio;
    - `lint`: solo los 2 errores previos;
    - control del orquestador: 13/13.
  - Los tests de componentes se escribieron después del componente (no hay DOM en los tests del web).
  - Sin verificar en el navegador.

- **Revisión T6** (`review-43873794f8510b5f`): consentimiento `granted`, aprobada y reconocida. El límite revisado avanza a `aa0da9f`.
  - Hallazgos informativos:
    - `R3-listing-edit-subcent-price-passes-validation`: un precio de 0,004 se redondea a 0 centavos; la API lo rechaza con 400, pero el mensaje no es claro.
    - `R3-waiting-without-date-renders-empty`.
    - `R3-access-panel-step-gating-untested`.
    - `R3-server-actions-untested`.

- **Revisión de los arreglos** (`edd9003` Mercado Pago no disponible, `06ad2ad` identidad de custodia; `review-b8f13fed3635f36c`): consentimiento `granted`, aprobada y reconocida. El límite revisado avanza a `06ad2ad`.
  - Hallazgos informativos:
    - `R3-callback-classifies-403-by-message-prefix`: la web distingue «otra cuenta» por el texto del error; conviene un código propio en la API.
    - `R3-mercadopago-default-unavailable-when-not-queried`: en las vistas que no consultan Mercado Pago el estado por defecto es «no disponible». Hoy no se usa ahí, pero conviene un valor neutro.

## Siguiente paso

Prueba local de punta a punta (requiere aplicar la migración a `marketplace_dev`), y T7 con autorización.
