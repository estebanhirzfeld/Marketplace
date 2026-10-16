# Fase 18 — Titularidad de un sitio por registro DNS

> **Estado**: ✅ Completa
> **Fecha**: Octubre 2026
> **Objetivo**: Que el vendedor de un sitio compruebe que el dominio es suyo con un registro TXT en su DNS y publique sin revisión del admin, sin depender de AdSense.

Hasta acá la única fuente de titularidad de un sitio era AdSense (`WebStrategy.ownershipSource = 'adsense'`): un sitio sin AdSense no podía comprobar nada y quedaba en revisión manual. Entró por una cadena de PRs apilados hacia `fase-5-frontend-y-avisos`: #30 a #36, más la épica aparte en #29. Seis de los siete superan el tope de 400 líneas; ver "Entrega".

---

## Objetivos cumplidos

- Un sitio con el TXT correcto queda con titularidad comprobada (`source: 'dns'`, `assetId` = dominio normalizado) y se publica sin revisión.
- Sin el TXT, la comprobación responde `verified: false` sin error y el modal sigue esperando.
- El vendedor elige dónde maneja su DNS y ve las instrucciones de ese proveedor; «No sé» muestra lo que se deduce de los servidores.
- AdSense sigue funcionando como fuente opcional, que además comprueba los ingresos.
- La autoridad de dominio sale del formulario, de los datos del sitio y de la valuación.
- Los textos e íconos de YouTube dejan de verse en un sitio, con un test de guarda.
- Verificado de punta a punta en producción el 15/10/2026 con `deliaorrego.online`.

---

## Funcionamiento

1. En la pestaña de verificaciones de un sitio, la tarjeta del sitio trae el bloque «Comprobá que el sitio es tuyo»; «Comprobar con tu DNS» abre el modal. «No puedo cargar el registro» envía a revisión, con confirmación.
2. `GET /listings/:id/verificacion-dns` devuelve la consigna: tipo `TXT`, nombre (`@`, o el nombre completo en un subdominio) y el valor `traspaso-verificacion=<24 hex>`. El valor se deriva por HMAC-SHA256 de `listingId:dominio` con `DNS_CHALLENGE_SECRET`; no se guarda en ningún lado.
3. El vendedor elige su proveedor de DNS (Netlify, Hostinger, Cloudflare, GoDaddy, DonWeb, Namecheap, Route 53 u Otro). «No sé» muestra lo deducido de los servidores de nombres: `nsone.net` es Netlify y `dns-parking.com` es Hostinger.
4. `POST /listings/:id/verificar/dns` consulta el TXT en los servidores autoritativos del dominio, descarta las IP no públicas y corta a los 8 s. Si el valor coincide con el derivado, registra la constancia.
5. Mientras el modal está abierto, la web consulta cada 10 segundos con tope de intentos, más el botón «Ya lo cargué». No hay tarea en segundo plano.
6. Al detectar el registro, el modal muestra la lista de comprobación final y «Listo: comprobamos que el sitio es tuyo». La página pasa a «Listo para publicar» y el botón «Publicar» salta la revisión.

---

## Decisiones técnicas

### 1. Sin tabla ni migración

El valor del TXT sale de un HMAC, así que la plataforma no guarda el desafío: lo recalcula al verificar. Sin `DNS_CHALLENGE_SECRET`, la fuente queda «no configurada» y las dos rutas responden 503. Un secreto de menos de 32 caracteres hace fallar el arranque de la API, como `MP_TOKEN_ENCRYPTION_KEY`.

### 2. Servidores autoritativos, no un resolvedor público

Un resolvedor público cachea la ausencia del registro (caché negativa) y mostraría «no está» minutos después de cargarlo. Se consulta a los servidores de nombres del dominio. Como esos nombres los controla un tercero, se filtran las IP no públicas antes de consultar (si no, un dominio podría apuntar a la red interna), con un intento por servidor y un tope total de 8 s.

### 3. AdSense como opción

AdSense sigue dentro del modal porque además comprueba los ingresos. Si ya hay una constancia de AdSense del mismo dominio, la del DNS la respeta y no pisa los ingresos verificados. La constancia nombra al vendedor aunque la pida un admin. La Site Verification API de Google queda para después del MVP; Domain Connect, descartado.

### 4. Autoridad de dominio y argumentos con nombre en `WebStrategy`

La autoridad de dominio era un puntaje de Moz que el vendedor escribía a mano, no se comprobaba y sumaba un 10 % al precio. Se quitó del formulario, de los datos y de la valuación, y también el filtro «autoridad desde» del mercado. Los datos guardados con `domainAuthority` se leen sin error y el campo se descarta. Vuelve solo si se mide (Moz o Search Console). `WebStrategy` pasó a recibir un objeto con propiedades nombradas: los argumentos posicionales permitían cruzar rubro y nombre.

### 5. Proveedor de DNS elegido por el vendedor

La primera versión deducía el proveedor de los servidores de nombres y se equivocaba: `*.nsone.net` es Netlify (NS1), no Hostinger; Hostinger es `dns-parking.com`. Un mismo servidor de nombres no identifica al proveedor con certeza, así que la deducción pasó a ser una pista («Por tus servidores DNS, parece que es Netlify») y la elección es del vendedor. En un subdominio no se detecta el proveedor.

### 6. Diseño iterado en el lienzo «Acceso de la plataforma»

Octava vuelta (`project/v8`, versión 67): logo B (ventana de navegador), pestaña «Verificaciones» según `VerifSitioA` (acción de DNS dentro de la tarjeta, misma grilla que YouTube) y modal según `ModalDnsA2` (pregunta centrada con las opciones; al elegir pasan a la columna izquierda y entra «Vas a cargarlo en …»; paso 2 con registro, TTL y animación de un panel de DNS; vista final con la lista de comprobación). La animación es CSS pura y respeta `prefers-reduced-motion`. El nivel de vendedor pasó a anillo a la izquierda con el desglose a todo el ancho, también en YouTube.

### 7. UI compartida por tipo de activo

La prueba local mostró textos de YouTube en un sitio («A los 7 días tu canal la muestra»). Se corrigieron siete fugas (`SellerLevelGauge`, `AccessPanel`, `notifications.ts`, `PriceSection`, `AdminInbox`, los títulos de los pasos de `WebStrategy`, la tarjeta superior como `AssetSummaryCard`) y se agregó `websiteCopyGuard.test.tsx`, que falla si las variantes de sitio contienen «canal», «YouTube» o «7 días».

### 8. Confirmación antes de enviar a revisión

«No puedo cargar el registro» enviaba el sitio a revisión sin preguntar. Ahora pide confirmación (`bc25131`).

---

## Entrega

Siete PRs apilados hacia `fase-5-frontend-y-avisos`, más la épica en #29 (merge `bcfb082`).

| PR | Contenido | Merge |
|---|---|---|
| #30 | Dominio: `DomainName`, puertos, casos de uso, `WebStrategy` con `'dns'` | `b14fe20` |
| #31 | API: emisor HMAC, resolvedor DNS, rutas, contrato y cliente | `06d0699` |
| #32 | Modal del DNS, primera versión | `cd22a9e` |
| #33 | Textos por tipo de activo y test de guarda | `88b6e5f` |
| #34 | Sin autoridad de dominio | `6a8d65d` |
| #35 | Proveedor de DNS elegido por el usuario | `6812397` |
| #36 | Diseño del lienzo y confirmación de revisión | `7cc3def` |

Todos menos #34 superan las 400 líneas; se pidió `size:exception` porque cada corte es una tarea con sus tests (entre el 30 y el 60 % del cambio). Cada commit lleva sus tests y se revisó por separado.

---

## Revisión

- `judgment-day` aprobó (APPROVED, sin hallazgos críticos) las tandas de dominio, API y web; las advertencias aceptadas se arreglaron en `0e80936`, `5cc66d5` y `b6d90a6`.
- La revisión nativa de Gentle AI no pudo correr: la captura del revisor falla con `invalid_request` en la versión 3.4.0 (issue `Gentleman-Programming/gentle-ai#5044`). El usuario decidió omitirla para este cambio.

---

## Verificación en producción

- Prueba local previa (15/10/2026): con `deliaorrego.online`, el TXT apareció en `dns1.p08.nsone.net` en unos 5 s y el modal lo detectó solo.
- Producción (15/10/2026): se agregó `DNS_CHALLENGE_SECRET` en el VPS y se desplegó `7cc3def` (sin migraciones, `SMOKE OK`). El usuario lo verificó de punta a punta con `deliaorrego.online`: el modal mostró «Listo: comprobamos que el sitio es tuyo».

---

## Tests

| Paquete | Pruebas |
|---|---|
| Dominio | 1070 |
| Base de datos (`marketplace_test`) | 122 |
| API | 498 (más 3 omitidos: la prueba en vivo, con `DNS_LIVE_TEST=1`) |
| Cliente de la API | 24 |
| Web | 507 |

`tsc` sin errores. El `lint` del web conserva dos errores previos en `error.tsx` y `global-error.tsx`.

---

## Deuda técnica conocida

| Item | Prioridad | Descripción |
|---|---|---|
| Revocar la constancia | Media | Si se borra el TXT, la constancia sigue. Va con «Traspaso de un sitio con pasos comprobables y plazos» (épica, etapa 1b). |
| Site Verification API | Baja | Segunda fuente para quien ya verificó el dominio en Search Console. Después del MVP. |
| `tsx watch` y el dominio | Baja | La API en desarrollo no recarga los cambios de `packages/domain`; hay que reiniciarla. |
| Proveedor en subdominios | Baja | No se reusa la subida al dominio padre, así que no se detecta el proveedor. |
| Errores DNS sin causa | Baja | Los errores de resolución pierden su causa original. |
| Tipos del cliente | Baja | `authorizationUrl` y `verifyOwnership` aceptan `'dns'` en el tipo. |
| Pasos 3 a 5 de `WebStrategy` | Media | No tienen fase. Anterior a este cambio. |
| Ingresos de AdSense | Media | Se guardan sin mirar la moneda, no cambian el precio estimado y `registerOwnershipVerification` no valida `monthlyRevenueCents`. Anterior a este cambio. |
| Estado del activo | Baja | Las comprobaciones de titularidad no miran el estado del activo. Anterior a este cambio. |

---

## Siguiente paso

El siguiente ítem de la etapa 1b de `odd/epica-cierre-mvp.md`: «Traspaso de un sitio con pasos comprobables y plazos», que antes necesita cerrar la decisión abierta sobre `.com.ar` (titularidad de la plataforma o custodia por acceso delegado). Detalle de la tarea: `odd/tasks/titularidad-dns.md`.
