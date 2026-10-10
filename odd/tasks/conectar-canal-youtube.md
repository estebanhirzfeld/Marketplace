# conectar-canal-youtube — Publicar un canal conectando YouTube primero

Rama: `feat/conectar-canal-youtube` (desde `origin/fase-5-frontend-y-avisos`).
TDD: activado (fuente: `CLAUDE.md` del proyecto, "TDD is expected"). Runners: `pnpm --filter @marketplace/domain exec vitest run`, `pnpm --filter api exec vitest run` (o el nombre real del paquete de la API), `pnpm --filter @marketplace/db exec vitest run` para integración (base local en `localhost:5434`).
Plan aprobado: `~/.claude/plans/teniendo-todo-el-panorama-wobbly-sphinx.md`. Evidencia previa: Engram #275 a #278.
Entrega: un PR por rebanada hacia `fase-5-frontend-y-avisos` (estrategia `stacked-to-main`, como `mp-split-cobro`), a confirmar con el usuario.

## Objetivo

Que el vendedor publique un canal autorizando YouTube primero, con suscriptores, vistas, ingresos y país verificados por Google en lugar de tipeados, y que la plataforma guarde la conexión para verificarla periódicamente después.

## Decisiones (del usuario, 10/10/2026)

- Conectar primero; los datos que Google conoce no se tipean.
- Los tres permisos son obligatorios: `youtube.readonly`, `yt-analytics.readonly`, `yt-analytics-monetary.readonly`. Si falta uno, no se guarda nada y se dice cuál falta.
- La conexión guarda el token de actualización cifrado, con el mismo patrón que `SellerPaymentAccount` + `AesGcmSecretCipher`.
- Monetizado se deduce de los ingresos: en cero se valúa por alcance (`calculateByReach()`). No se declara más.
- Carga manual solo cuando la integración no está configurada.

## Decisiones por defecto de esta rebanada (revisables por el usuario)

- Ingreso mensual para la valuación: promedio de los últimos 3 meses completos de `estimatedRevenue` (USD).
- `growthFactor`: neutro mientras no haya una fórmula sobre la serie de suscriptores. El neutro de la fórmula de `YouTubeStrategy` es **1** (0 significa "cayendo" y resta múltiplo).
- Sin país informado por Google (canal sin vistas), la estrategia usa su default `'AR'`, que resta 3 al múltiplo. Conocido, a revisar.
- País principal: el de más vistas en los últimos 12 meses; si no hay datos, sin país.

## Tareas

- [x] T1 Dominio: entidad `YouTubeConnection`, value objects `YouTubeChannelAnalytics` y `YouTubeScopes` (`MissingYouTubeScopesError`), puertos `IYouTubeAnalyticsReader`, `IYouTubeConnectionOAuthClient`, `IYouTubeChannelListingFinder` e `IYouTubeConnectionRepository`, casos de uso `ConnectYouTubeChannelUseCase` y `CreateListingFromYouTubeConnectionUseCase` (`ChannelAlreadyListedError`), marca `verifiedFromYouTubeAt` en `assetData`. Tests vistos en rojo (módulos inexistentes) y luego 60 archivos / 838 tests en verde; `tsc` sin errores. Identificadores en español renombrados a inglés tras la revisión.
- [x] T2 Infraestructura: migración `20261009202120_add_youtube_connections` (tabla de conexiones con unicidad vendedor+canal e índice único parcial `listings_active_youtube_channel_key` contra canal duplicado), repositorio, mapper y finder en `packages/db`; adaptadores `YouTubeConnectionOAuthClient` (offline, `select_account consent`) y `YouTubeAnalyticsReader` en `apps/api`; `ServiceUnavailableError` → 503 para fallas de Google; rutas `POST /me/youtube/authorization`, `POST /me/youtube/connect`, `GET /me/youtube/connections`, `POST /me/youtube/connections/:channelId/listing`; DTOs y cliente. Hallazgos de la revisión de T1 resueltos. Verificado: dominio 857, db 92, api 357, api-client 22 tests en verde; `tsc` sin errores; migración aplicada sin reset.
  - Efecto no deseado: la suite de integración de `packages/db` (la existente y la nueva) borra todas las tablas de la base local de desarrollo. Al correrla, la base quedó vacía (antes: 7 activos y 5 usuarios del seed).
  - Commit `eaaeb66`. Revisión nativa (lineage `review-9782bdea6954a19f`, riesgo medio): **aprobada y reconocida**, con hallazgos no bloqueantes:
    - Una falla permanente al leer el canal (401 o 403 sin cuota) termina como 503 "probá en unos minutos" en vez de pedir que vuelva a autorizar: el caso de uso tira por la borda la distinción que hace el adaptador.
    - La suite de `packages/db` borra la base apuntada sin comprobar que sea de prueba.
    - El esquema del cuerpo de crear activo no acota precio ni largo del rubro.
- [x] T2b Arreglos de la revisión de T2: falla permanente de lectura → `ValidationError` que pide volver a conectar (solo `ServiceUnavailableError` da 503); los tests de `packages/db` **y de `apps/api`** corren contra `marketplace_test` (creada y migrada en un `globalSetup`, con resguardo que aborta si la base no termina en `_test`); `askingPrice.cents` con `minimum: 1` y `niche` limitado al catálogo `ASSET_NICHES`. Verificado por el padre: api 361 y db 100 tests en verde, y `marketplace_dev` con 7 activos antes y después. La base de desarrollo se restauró con el seed antes de T2b.
  - Commit `91952ff`. Revisión nativa de cuatro lentes (lineage `review-823ac1844bfecd54`, riesgo alto por el `Makefile`): **aprobada y reconocida**. Avisos: la clasificación quedó al revés de amplia (cualquier error inesperado pide reconectar y se pierde sin registro) y hay una carrera al crear `marketplace_test` si las suites de db y api corren en paralelo.
- [x] T2c (hecha; nuevo `YouTubeAuthorizationRevokedError`, `DomainError` con `cause` y registro en `errorHandler`; creación de `marketplace_test` tolera `42P04` y `23505`, probada con suites en paralelo; dominio 860, db 110, api 367 en verde; `marketplace_dev` en 7). Arreglos de la revisión de T2b: el adaptador marca explícitamente las fallas permanentes (401, 403 sin cuota) con un error propio; solo esas piden reconectar; lo desconocido sigue como 503 y se registra. Creación de `marketplace_test` tolerante a "ya existe". Menores: constante para el mensaje, test HTTP del 400 por falla permanente, test de `useTestDatabase`.
- [ ] T3 Pantalla `/vender` para canal (rebanada 2 del plan).
- [ ] T4 Componentes en el sistema visual y `/sistema` (rebanada 3).
- [ ] T5 Arreglos menores: atajo de `/perfil` y callback viejo (rebanada 4).

## Ruta por tarea

- T1, T2: delegated direct, un escritor por tarea (varios archivos no triviales).
- T3 a T5: se definen al terminar T2.

## Criterios de aceptación (T1 y T2)

- Faltando cualquiera de los tres permisos, conectar falla sin persistir nada y nombra los permisos faltantes.
- El token nunca se guarda en claro; se descifra solo dentro del adaptador.
- Crear un activo desde la conexión llena `assetData` con datos verificados y la valuación los usa.
- Un canal ya publicado no se puede volver a publicar.
- Tests de dominio, API y base en verde; `tsc` sin errores.

## Progreso

T1 hecha por un escritor delegado. Revisión del padre: identificadores en español en el código nuevo (corregido).

Pendiente para T2, informado por el escritor de T1:
- Modelo y migración de la conexión con unicidad `(sellerId, channelId)`, repositorio, mapper y adaptador de `IYouTubeChannelListingFinder`, que busca por la URL `/channel/<id>`. Los activos viejos con URL de handle no se detectan como duplicados.
- `hydrateStrategy` de `ListingMapper` tiene que aceptar `verifiedFromYouTubeAt` (o delegar en `createAssetStrategy`).
- Adaptadores de Analytics y OAuth `offline` con `prompt=consent`, rutas y cifrado con `AesGcmSecretCipher`.

Commit de T1: `166080d`. Revisión nativa (lineage `review-8cb25b5e3ab94415`, riesgo medio, una lente de confiabilidad): **aprobada y reconocida**, con hallazgos no bloqueantes que se resuelven en T2:
- Las fallas transitorias de Google (red, 5xx, cuota) salen como `ValidationError` (400) y con un mensaje que culpa al vendedor. Clasificarlas como no disponibilidad.
- "Un canal ya publicado no se publica de nuevo" se apoya en consultar y después guardar, sin respaldo en la base: dos pedidos simultáneos pueden crear dos activos. Hace falta una restricción de unicidad en persistencia.
- Sugerencias: tests de los resguardos de `reconnect`, validar en `create` que el canal del snapshot coincida, y que `optionalDate` acepte solo ISO.

## Próximo paso

Delegar T2, incluyendo esos hallazgos.
