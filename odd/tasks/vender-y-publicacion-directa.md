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
- [x] T6.1 · Antes de T7, observado en la prueba local del 11/10:
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
  - (n) Aunque se pida `consent`, Google reutiliza la elección de canal de un permiso anterior y no muestra el selector. Se resuelve quitando el acceso de Traspaso en myaccount.google.com/connections. El mensaje de canal no coincidente tiene que explicar ese paso.
- Arreglo en la prueba local: la verificación usaba `prompt=select_account` y Google recordaba el canal elegido antes («Forza Labs», sin canal), así que no volvía a mostrar el selector. Pasa a `select_account consent`. RED: el test de la URL falló; GREEN: api 408/408 y `tsc` limpio.
- **Caso feliz verificado en local el 11/10:** Pc Lover conectado, publicado sin revisión, «Ya los invité», admin «Verificar acceso» con `contacto.forzalabs@gmail.com` eligiendo el canal en el selector nuevo. Resultado: «Acceso verificado».
  - Constancia guardada: notas «Verificado por OAuth de la cuenta de custodia contacto.forzalabs@gmail.com (sub 110426901773510589068)», `heldRole` manager, `accessSince` igual al momento de la verificación.
  - (o) `accessSince` se registra como «ahora», aunque la cuenta es administradora desde antes. Es conservador: los 7 días cuentan desde la verificación. La constancia no guarda `custodyAccountId`; conviene enlazarlo.
  - (p) En Verificaciones, «Ingreso mensual» ocupa toda la altura con una línea: mover el dato a la tarjeta del canal y dejar «Los datos publicados» a todo el ancho.
  - (q) No mostrar «Factor de crecimiento»: es un valor interno de la valuación.
  - (r) En la publicación pública, el aviso «Transferible desde…» es largo, explica la regla de los 7 días y la custodia (lógica del negocio) y le habla al vendedor aunque lo lea un comprador sin sesión. Tiene que ser una línea para el comprador.
  - **División de T6.1** (decidida el 11/10):
    - **T6.1a, sin diseño (hecho):** (c) dominio y API, (d), (e), (g) lógica, (h), (j), (k), (m), (n), (o), (q).
    - **T6.1b, con una ronda de lienzo antes de codear:** (a) y (b) aviso y panel del admin, (c) pantalla del admin, (g) vista intermedia, (l) textos del modal, (p) Verificaciones, (r) aviso público.
- **T6.1a** (ruta: delegado). Hechos (c), (d), (e), (g), (h), (j), (k), (m), (n), (o) y (q).
  - Nuevo `RejectPlatformAccessRequestUseCase`, la notificación `acceso_no_encontrado` (migración `20261011130000_add_access_not_found_notification`) y `POST /admin/listings/:id/acceso/rechazar`.
  - El duplicado de custodia da 409; el mensaje de canal no coincidente es explicativo.
  - Se suma `planYouTubeSell` con un bloque provisorio de «borrador o publicar otro». La conexión del vendedor usa `enable_yt_permissions` y `select_account consent`.
  - `CopyEmailButton`; `growthFactor` pasa a interno.
  - RED observado por ítem.
  - GREEN:
    - dominio: 987;
    - db: 119;
    - api: 411;
    - web: 324;
    - `tsc` limpio;
    - control del orquestador: 18/18.
  - Pendiente: aplicar la migración nueva a `marketplace_dev`.
  - Revisión `review-57f2a1f2acb377ca`: consentimiento `granted`, aprobada y reconocida. El límite revisado avanza a `de7b9d4`.
    - Hallazgos informativos:
      - `R3-reject-save-then-notify-not-atomic`: si falla la notificación después de guardar, el vendedor no se entera.
      - `R3-vender-plan-wiring-untested`.
      - `R3-copy-email-stateful-path-untested`.
- **Decisiones de diseño de T6.1b** (11/10, lienzo, séptima vuelta):
  - Aviso público: variante A («Se transfiere desde el 18 de octubre» y «Podés ofertar desde hoy») con el ícono de calendario de B.
  - Admin: la bandeja de A (pestañas con contador y tabla con acciones) más los avisos de B (contador en «ADMIN» del menú y aviso en la campana cuando un vendedor toca «Ya los invité»).
  - «Vender» con borrador: como el tablero.
  - Verificaciones: la M (los ingresos pasan a la tarjeta del canal y los datos publicados ocupan todo el ancho), pero el panel grande «7 días para la transferencia inmediata» queda como está. Su texto deja de decir «aparecés primero» y dice «más visibilidad en el mercado»; ese cambio de texto vale en toda la app. La dirección del canal es un enlace.
  - Logos cuadrados en `apps/web/public/brand/` (SVG y PNG de 512 y 120 px). El usuario los carga en Mercado Pago y en Google.
- **T6.1b** (ruta: delegado). Implementados el aviso público (A con el calendario), la bandeja del admin con contador en el menú y el aviso `acceso_solicitado` a los admins (migración `20261011150000_add_access_requested_notification`), `DraftChoice`, Verificaciones M con `PublishedData` y el enlace al canal, el texto «más visibilidad» y el paso 1 del modal.
  - RED observado en la mayoría; sin RED previo en `DraftChoice`, `PublishedData`, `adminInbox` y los tests de api/db del aviso.
  - GREEN:
    - dominio: 993;
    - db: 120;
    - api: 411;
    - web: 351;
    - `tsc` limpio;
    - control del orquestador: transferability y adminInbox en verde.
  - Brechas:
    - El aviso al admin es genérico («Un vendedor ya nos invitó»): para nombrar al vendedor y al canal hacen falta campos y una migración.
    - La pestaña de reclamos solo muestra el conteo, porque no hay listado de reclamos del admin en la API.
    - Las migraciones de T6.1a y T6.1b siguen pendientes en `marketplace_dev`.
  - Revisión `review-f3f6297226e77ac2`: consentimiento `granted`, aprobada y reconocida. El límite revisado avanza a `7d95781`.
    - Hallazgos informativos:
      - `R3-notify-after-save-lost`: si falla el aviso al admin después de guardar, el admin no se entera; el panel igual lo muestra.
      - `R3-seller-lookup-failure`.
- Prueba local del 11/10: con `contacto.forzalabs@gmail.com`, «Lovi en Reddit» dio «La cuenta elegida no administra este canal». Es el resultado correcto: ese vendedor nunca nos invitó, que es el caso (c).
- [ ] Idea para más adelante (usuario, 11/10): gráficos de la serie mensual de YouTube en Verificaciones y en las tarjetas del mercado, y usar esos datos para ordenar y rankear el mercado.
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
