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
- [ ] T2 Infraestructura: modelo y migración en `packages/db`, repositorio y mapper, adaptador del lector de Analytics y del OAuth `offline` en `apps/api`, rutas y cliente de la API. Tests con Google simulado.
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

## Próximo paso

Commit de T1 y delegar T2.
