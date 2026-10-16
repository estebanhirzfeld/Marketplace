# titularidad-dns — Titularidad de un sitio por registro DNS

Rama: `feat/titularidad-dns` (desde `origin/fase-5-frontend-y-avisos`).
TDD: activado (fuente: `CLAUDE.md` del proyecto, "TDD is expected"). Runners: `pnpm --filter @marketplace/domain exec vitest run`, `pnpm --filter @marketplace/api exec vitest run`, `pnpm --filter @marketplace/db exec vitest run` (contra `marketplace_test`), `pnpm --filter web exec vitest run`.
Plan aprobado: `~/.claude/plans/si-dale-con-el-idempotent-otter.md`. Evidencia previa: Engram #292 a #294.
Ítem de la épica: «Titularidad por registro DNS», etapa 1b de `odd/epica-cierre-mvp.md`.
Entrega: `stacked-to-main` (elegido por el usuario el 15/10/2026). PRs apilados hacia `fase-5-frontend-y-avisos`, abiertos el 15/10/2026: #30 dominio (hasta `68eed85`), #31 API (`5dbcf96`), #32 modal del DNS, primera versión (`a6c8d57`), #33 textos por tipo de activo (`6b2ea3e`), #34 sin autoridad de dominio (`140a07f`), #35 proveedor de DNS (`0500190`), #36 diseño del lienzo (`feat/titularidad-dns`). Todos menos #34 superan las 400 líneas; se pidió `size:exception` porque cada corte es una tarea con sus tests. La épica va aparte en #29.
Revisión: el modo de revisión con recibos está activado (global); se evalúa el riesgo después de cada commit.

## Objetivo

Que un vendedor compruebe la titularidad de un sitio con un registro TXT en su DNS y publique sin revisión del admin, sin depender de AdSense.

## Problema

Hoy la única fuente de titularidad de un sitio es AdSense (`WebStrategy.ownershipSource = 'adsense'`). Un sitio sin AdSense no puede comprobar que es suyo.

## Decisiones (del usuario, 15/10/2026)

- Se reutiliza la tarjeta «Comprobar titularidad» de YouTube. En un sitio abre un modal con el valor del TXT para copiar, las instrucciones del proveedor de DNS deducido de sus servidores y un estado que cambia solo cuando aparece el registro.
- AdSense queda como opción dentro del modal: es la que además comprueba los ingresos.
- La Site Verification API de Google queda para después del MVP. Domain Connect queda descartado.

## Decisiones de diseño

- El valor del TXT se deriva con HMAC-SHA256 (secreto `DNS_CHALLENGE_SECRET`, `listingId:dominio`), truncado a 24 caracteres hexadecimales. No hay tabla ni migración. Sin secreto, la fuente queda «no configurada».
- Los TXT se consultan en los servidores autoritativos del dominio, para evitar la caché negativa de un resolvedor público.
- El estado cambia solo mientras el modal está abierto (consulta cada 10 segundos con tope de intentos, más el botón «Ya lo cargué»). No hay tarea en segundo plano.
- Fuera de alcance: revocar la constancia si se borra el TXT. Va con el ítem «Traspaso de un sitio con pasos comprobables y plazos».

## Tareas

- [x] T1 Dominio: value object `DomainName`; `'dns'` en `VerificationSource`; puertos `IOwnershipChallengeIssuer` e `IDnsResolver`; casos de uso `GetDomainOwnershipChallengeUseCase` y `VerifyDomainOwnershipUseCase`; `WebStrategy` con `ownershipSource: 'dns'` y textos revisados. Ruta: escritor delegado (más de 2 archivos no triviales).
  - Commit `ee256d3`. RED visto (módulos inexistentes y 2 tests corregidos por el padre), luego dominio 68 archivos / 1057 tests en verde y `tsc` sin errores. Corrección del padre: la constancia nombra al vendedor aunque la pida un admin, y una constancia previa de AdSense del mismo dominio se respeta (no se pisan los ingresos verificados).
  - Revisión nativa: riesgo medio, `slice_budget_reached`, consentida. La captura del revisor falla con `invalid_request` en Gentle AI 3.4.0 (defecto de la herramienta, issue #5044, comentado). Por decisión del usuario se omitió solo para este cambio (`declined`) y se revisó con `judgment-day`.
  - `judgment-day` sobre `ee256d3`: **APPROVED**, ronda 1, sin hallazgos críticos, 13 advertencias o sugerencias informativas.
  - [x] T1b Arreglos de las advertencias, aceptados por el usuario: la comprobación por AdSense normaliza el dominio; `DomainName` acepta dominios con tildes o ñ (punycode); identificadores nuevos en inglés; en un subdominio la consigna usa el nombre completo en vez de `@`. Ruta: escritor delegado. Commit `0e80936`: RED visto (5 tests), luego dominio 68 archivos / 1065 tests en verde y `tsc` sin errores, verificado por el padre.
  - Pendientes anotados, anteriores a este cambio: AdSense guarda el ingreso sin mirar la moneda; el ingreso verificado no cambia el precio estimado; los pasos 3 a 5 de `WebStrategy` no tienen fase; las comprobaciones de titularidad no miran el estado del activo; `registerOwnershipVerification` no valida `monthlyRevenueCents`.
- [x] T2 Infraestructura: `'dns'` en `ListingMapper`; adaptadores `HmacOwnershipChallengeIssuer` y `NodeDnsResolver`; `identifyDnsProvider`; rutas `GET /listings/:id/verificacion-dns` y `POST /listings/:id/verificar/dns`; contrato, cliente y contenedor. Ruta: escritor delegado.
  - Commit `5f8fa08`. RED visto en cada pieza (mapper: «Fuente de verificación desconocida en la base: dns»; módulos inexistentes; rutas con 404). Verde: dominio 1065, db 122 (contra `marketplace_test`), api 450 + 3 omitidos (la prueba en vivo), api-client 24; `tsc` sin errores en todos. La API la volvió a correr el padre.
  - Prueba en vivo con `DNS_LIVE_TEST=1`: `deliaorrego.online` devuelve los NS `dns1..4.p08.nsone.net` (Hostinger) y el TXT `traspaso-verificacion=178cd4d4534d977fbdf74f70`.
  - `DNS_CHALLENGE_SECRET` documentada en `env.example`; sin ella, las dos rutas responden 503 «La verificación por DNS todavía no está configurada.». Las rutas de Google ahora aceptan solo `youtube` o `adsense` como fuente.
  - Revisión nativa: riesgo medio, consentida; la captura falla igual que en T1 (#5044). Por decisión del usuario se omitió para este cambio, sin reportar de nuevo, y se revisa con `judgment-day`.
  - `judgment-day` sobre `5f8fa08`: **APPROVED**, ronda 1, sin hallazgos críticos, 13 advertencias o sugerencias informativas.
  - [x] T2b Arreglos aceptados por el usuario: filtrar IP no públicas antes de consultar los servidores autoritativos (consultas a la red interna); un intento y tope total de 8 s por comprobación; secreto de al menos 32 caracteres. Ruta: escritor delegado. Commit `5cc66d5`: RED visto (9 tests), luego api 497 + 3 omitidos en verde y `tsc` sin errores, verificado por el padre; la prueba en vivo sigue pasando. Un secreto de menos de 32 caracteres hace fallar el arranque de la API, como `MP_TOKEN_ENCRYPTION_KEY`; vacío sigue siendo «no configurada».
  - Pendientes anotados: en un subdominio no se detecta el proveedor (no se reusa la subida al dominio padre); los errores DNS pierden su causa; `authorizationUrl` y `verifyOwnership` del cliente aceptan `'dns'` en el tipo; `nsone.net` no es exclusivo de Hostinger (T3 lo muestra como «Parece que…»).
- [x] T3 Web: `DnsVerificationDialog`, variante DNS de `VerificationCards`, consulta repetida, `CopyValueButton`, textos de `/vender` y de `activos/[id]`, `/sistema`. Ruta: escritor delegado.
  - Commit `b506970` (incluye la URL de DonWeb corregida a `micuenta.donweb.com`; la anterior daba 404). RED visto (11 tests), luego web 48 archivos / 420 tests en verde y `tsc` sin errores, verificado por el padre; lint con los 2 errores previos de `error.tsx` y `global-error.tsx`.
  - Revisión nativa: riesgo medio, consentida; la captura falla igual (#5044). Se omitió para este cambio, sin reportar de nuevo. `judgment-day` sobre `b506970`: **APPROVED**, ronda 1, sin hallazgos críticos.
  - Advertencias en las que coinciden los dos jueces: la consulta repetida sigue después de un error (por ejemplo el 503); la consigna inicial no maneja un rechazo y queda en «Preparando tu registro…»; una falla de red durante la consulta llega al límite de errores y reemplaza la página; el botón de copiar oculta el valor a los lectores de pantalla; `/sistema` muestra un botón de relleno en vez de `DnsVerificationTrigger`; el ciclo de la consulta repetida no tiene tests.
  - Prueba en la app (local, 15/10/2026): borrador `[TEST] Delia Orrego` con `deliaorrego.online`; el modal mostró `TXT`, `@`, el valor y «Parece que tu DNS está en Hostinger»; el usuario agregó el TXT nuevo, apareció en `dns1.p08.nsone.net` en ~5 s y el modal lo detectó solo: la página pasó a «Listo para publicar · Sos el titular del sitio» con el botón «Publicar», sin revisión. El borrador se borró después.
  - Hallazgo en la prueba: en un sitio aparece «Vendé más rápido… A los 7 días tu canal la muestra», texto de YouTube. Pendiente.
  - [x] T3b Arreglos aceptados por el usuario: la consulta repetida se detiene ante un error y una consulta en curso se muestra como búsqueda; la consigna muestra un error con «Reintentar»; una falla de red durante la consulta queda como error en el modal; el estado se limpia al cerrar y la primera consulta corre apenas carga la consigna; el botón de copiar incluye el valor en su nombre accesible y el título del modal es `h2`; `/sistema` usa `DnsVerificationTrigger` real; pista de subdominio sin calcular la etiqueta; `SellMoreAside` dice «sitio» o «canal» según el activo. Ruta: escritor delegado. Commit `b6d90a6`: RED visto (13 tests), luego web 50 archivos / 438 tests en verde y `tsc` sin errores, verificado por el padre; comprobado en `/sistema` en la app.
- [x] T3c Barrido de textos e íconos de YouTube en la UI compartida que se ven en un sitio (ícono de titularidad del nivel de vendedor, «7 días después de invitarnos tu canal…» en el panel de acceso, pasos del acceso en tercera persona, aviso de notificaciones, texto del precio, bandeja del admin, tarjeta superior con espacio vacío) más un test de guarda que falla con «canal», «YouTube» o «7 días» en las variantes de sitio. Origen: prueba del usuario, 15/10/2026 («esto no se puede repetir»). Ruta: escritor delegado. Commit `7631679`: siete fugas corregidas (`SellerLevelGauge`, `AccessPanel`, `notifications.ts`, `PriceSection`, `AdminInbox`, títulos de los pasos de `WebStrategy`, tarjeta superior como `AssetSummaryCard`); `websiteCopyGuard.test.tsx` vio RED en 5 de 11 casos y después GREEN; web 458 y dominio 1067 tests en verde, `tsc` sin errores, verificado por el padre. Comprobado en la app con el borrador del usuario: sin «canal», «YouTube» ni «7 días»; el paso 1 dice «Eximite del bloqueo de 60 días» (hizo falta reiniciar la API: `tsx watch` no recarga cambios de `packages/domain`).
- [x] T3d Ajustes del modal pedidos por el usuario en la prueba:
  - El proveedor se elige: «¿Dónde manejás el DNS de tu dominio?» con Netlify, Hostinger, Cloudflare, GoDaddy, DonWeb, Namecheap, Route 53 y Otro; «No sé» muestra lo que se deduce de los servidores DNS y cómo averiguarlo.
  - Mapeo corregido: `*.nsone.net` es Netlify (NS1), no Hostinger; Hostinger es `dns-parking.com` (verificado: `netlify.app` delega en `p01.nsone.net`; tutorial de Hostinger). El dominio del usuario se compró en Hostinger y su DNS está en Netlify.
  - Aclarar que el TTL queda en el valor por defecto.
  - Animación de un panel de DNS cargando el registro, como la de YouTube.
  - El formulario de venta de un sitio todavía dice que para publicar hay que enviarlo a revisión; con la titularidad por DNS se publica directo.
  - Ruta: escritor delegado, después de T3c. Commit `e4f7e37`: RED visto (API 2, web 12 y formulario 1), luego api 498 y web 477 tests en verde, `tsc` sin errores; la animación es CSS pura y respeta `prefers-reduced-motion`. Verificado por el padre en la app con el borrador del usuario: «Por tus servidores DNS, parece que es Netlify» (hizo falta reiniciar la API) y la nota del TTL.
- [x] T5 Sacar la autoridad de dominio del formulario, de los datos del sitio y de la valuación (decisión del usuario, 15/10/2026: es un puntaje de Moz que el vendedor escribe a mano, no se comprueba y sumaba un 10 % al precio). Vuelve solo si se mide (Moz o Search Console). Ruta: escritor delegado, después de T3c (comparte `WebStrategy`). Commit `592f4ef`: `WebStrategy` pasa a recibir un objeto con nombres (los argumentos posicionales permitían cruzar rubro y nombre); los datos guardados con `domainAuthority` se leen sin error y el campo se descarta; también se quitó el filtro «autoridad desde» del mercado, que leía el mismo dato. RED visto (7 tests), luego dominio 1070, db 122, api 497, api-client 24 y web 460 tests en verde, `tsc` sin errores; verificado por el padre en la app (formulario sin el campo; el borrador del usuario con el dato viejo carga bien).
- [x] T3e Llevar a la web lo elegido en la octava vuelta del lienzo (`project/v8`, versión 67): logo B (ventana de navegador como forma) en `/vender` y en chico; pestaña «Verificaciones» de un sitio según `VerifSitioA` (acción de DNS dentro de la tarjeta, misma grilla que la de YouTube, logo real de Mercado Pago en el nivel); modal según `ModalDnsA2` (pregunta centrada con las opciones; al elegir, las opciones pasan a la columna izquierda sin animación y entra «Vas a cargarlo en …»; «No sé» marca Netlify; paso 2 con registro, TTL y animación del panel; vista final con la lista de comprobación y el estado de éxito). Ruta: escritor delegado. Commit `77f4548`: RED visto (WebLogo 4, AssetSummaryCard, VerificationCards 2, diálogo 25 de 41), luego web 55 archivos / 504 tests en verde y `tsc` sin errores, verificado por el padre. En la app con el borrador del usuario: bloque de titularidad en la tarjeta del sitio; «No sé» deduce Netlify, lo marca y muestra «Vas a cargarlo en Netlify». El nivel de vendedor pasó a anillo a la izquierda con el desglose a todo el ancho, también en YouTube. «No puedo cargar el registro» envía a revisión sin confirmación (a revisar con el usuario).
- [x] T4 Prueba real con `deliaorrego.online` en local y en producción; write-up en `docs/fase-*.md`, `docs/gant.json` y el ítem tildado en la épica. Ruta: en línea.
  - Local: ver T3 (TXT detectado en ~5 s). Producción, 15/10/2026: `DNS_CHALLENGE_SECRET` agregada en el VPS; despliegue de `7cc3def` correcto (sin migraciones, `SMOKE OK`); el usuario lo verificó de punta a punta con `deliaorrego.online` y el modal mostró «Listo: comprobamos que el sitio es tuyo».
  - Write-up: `docs/fase-18-titularidad-de-un-sitio-por-dns.md`; entrada `fase-18` en `docs/gant.json`; ítem tildado en `odd/epica-cierre-mvp.md`.

## Criterios de aceptación

- Un sitio con el TXT correcto queda con titularidad comprobada (`source: 'dns'`, `assetId` = dominio normalizado) y se puede publicar sin revisión.
- Sin el TXT, la comprobación responde `verified: false` sin error, y el modal sigue esperando.
- El vendedor elige dónde maneja su DNS; «No sé» muestra lo que se deduce de sus servidores (`nsone.net` es Netlify, `dns-parking.com` es Hostinger) y cómo averiguarlo; «Otro» muestra pasos genéricos.
- AdSense sigue funcionando como fuente alternativa.

## Verificación

- `make test-domain` después de T1; `make test` después de T2 y T3; `pnpm lint` en `apps/web`.
- Prueba de punta a punta con `deliaorrego.online`, comprobada en la app.

## Fuera del alcance, anotado

- Demo de la tesis: `deliaorrego.online` es el único dominio extra del usuario. Si se lo traspasa con éxito, documentarlo y avisarle para que grabe la demo.
- Bloqueo de 60 días: después de cambiar de registrador corre otro bloqueo de 60 días. La custodia no puede pasar por el registrador de la plataforma sin trabar la entrega al comprador.

## Progreso

Todas las tareas hechas (T1 a T5, con sus subtareas). Cadena de PRs #30 a #36 mergeada (`b14fe20`, `06d0699`, `cd22a9e`, `88b6e5f`, `6a8d65d`, `6812397`, `7cc3def`) y en producción. Tests finales: dominio 1070, db 122, api 498 + 3 omitidos, api-client 24, web 507.

## Siguiente paso

Feature cerrada. Sigue el ítem «Traspaso de un sitio con pasos comprobables y plazos» de la etapa 1b de la épica.
