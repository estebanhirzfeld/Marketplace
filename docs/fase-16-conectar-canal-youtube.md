# Fase 16 — Conectar un canal de YouTube

> **Estado**: ✅ Completa
> **Fecha**: Octubre 2026
> **Objetivo**: Que el vendedor publique un canal autorizando YouTube primero, con suscriptores, vistas, ingresos y país verificados por Google en lugar de tipeados, y que la plataforma guarde la conexión para verificarla después.

Los datos tipeados a mano eran la parte menos confiable de una publicación. La fase 14 ya había dejado el escrow ejecutable; esta cambia el origen de los números de un canal: los lee de YouTube Analytics con el permiso del dueño. Entró por el PR #22 (merge `1d4a21c`), en ocho commits, uno por unidad de trabajo. Supera el tope de 400 líneas (90 archivos, +7639/−137) y se pidió `size:exception`: cada commit se revisó por separado.

---

## Objetivos cumplidos

- Conexión de un canal con OAuth de Google (acceso `offline`), con token de renovación cifrado.
- Tres permisos obligatorios; si falta uno no se guarda nada y se nombra cuál falta.
- Activo creado desde la conexión con `assetData` verificado y marca `verifiedFromYouTubeAt`.
- Un canal ya publicado no se puede volver a publicar, con respaldo en la base.
- `/vender` conecta primero y muestra la tarjeta del canal verificado (`VerifiedChannelCard`, `VerificationSeal`).
- Tests de integración contra una base `marketplace_test` separada.
- Todo detrás de configuración: sin `YOUTUBE_OAUTH_*` y `YOUTUBE_API_KEY`, `/vender` muestra el formulario manual.

---

## Decisiones técnicas

### 1. Conectar antes de cargar datos

Los datos que Google conoce no se tipean. La carga manual queda solo para cuando la integración no está configurada.

### 2. Tres permisos obligatorios

`youtube.readonly`, `yt-analytics.readonly` y `yt-analytics-monetary.readonly`. `YouTubeScopes` lanza `MissingYouTubeScopesError` con los que faltan; `ConnectYouTubeChannelUseCase` no persiste nada en ese caso.

### 3. Token cifrado con el patrón de Mercado Pago

`YouTubeConnection` guarda el token de renovación con `AesGcmSecretCipher`, igual que `SellerPaymentAccount`. Solo se descifra dentro del adaptador. La unicidad es vendedor + canal.

### 4. Monetización deducida de los ingresos

`monetized` ya no se declara: con ingresos en cero, `YouTubeStrategy` valúa por alcance (`calculateByReach()`).

### 5. Datos para la valuación

- Ingreso mensual: promedio de los últimos tres meses completos de `estimatedRevenue` (USD).
- `growthFactor`: neutro (1) mientras no haya una fórmula sobre la serie de suscriptores. 0 significa "cayendo" y resta múltiplo.
- País principal: el de más vistas en los últimos 12 meses. Sin país de Google la estrategia caía en `'AR'` y restaba 3 al múltiplo; ahora se muestra "Sin datos" y se usa el valor neutro.

### 6. Canal duplicado

Un índice único parcial (`listings_active_youtube_channel_key`) impide dos activos vivos del mismo canal. Consultar y después guardar no alcanzaba: dos pedidos simultáneos creaban dos activos. El buscador compara por la URL `/channel/<id>`.

### 7. Clasificación de los errores de Google

Las fallas transitorias (red, 5xx, cuota) salen como `ServiceUnavailableError` (503). Solo una autorización revocada, marcada por el adaptador (401, 403 sin cuota), lanza `YouTubeAuthorizationRevokedError` y pide volver a conectar. Lo desconocido sigue como 503 y se registra.

### 8. Base de prueba separada

Probar la suite de `packages/db` borró todas las tablas de la base de desarrollo. Ahora las suites de `db` y `api` corren contra `marketplace_test`, creada y migrada por un `globalSetup`, que aborta si el nombre no termina en `_test`. La creación tolera los errores `42P04` y `23505` de dos suites en paralelo.

---

## Defectos encontrados en la prueba real

La conexión con un canal real (50 suscriptores, 17 vistas en 12 meses) devolvió el primer dato no nulo: la API pública decía 0. La misma prueba encontró:

- La foto del canal no se veía en el navegador; ahora `ChannelAvatar` usa `referrerPolicy="no-referrer"` y cae a la inicial.
- "Acceso de la plataforma" era una pared de texto; pasó a un panel breve y un modal con pasos (`InstructionsModal`).
- El aviso de ingresos decía que YouTube no los expone aun con ingresos verificados.
- Sin país de Google se mostraba "AR" (ver decisión 5).
- La fecha de verificación salía en ISO crudo.

---

## Tests

| Paquete | Pruebas |
|---|---|
| Dominio | 884 |
| Base de datos (`marketplace_test`) | 110 |
| API | 369 |
| Web | 229 |
| Cliente de la API | 22 |

El cliente de la API se contó al cerrar la API (T2). `tsc` sin errores. El `lint` del web conserva dos errores previos en `error.tsx` y `global-error.tsx`, que no se tocaron.

---

## Deuda técnica conocida

Los pendientes de producto están en la épica `odd/epica-cierre-mvp.md`.

| Item | Prioridad | Descripción |
|---|---|---|
| Verificación periódica | Alta | Los números verificados quedan congelados el día de la publicación. Épica, etapa 5. |
| Duplicados por handle | Media | Los activos viejos con URL de handle no se detectan como duplicados del mismo canal. |
| Nombre del error | Baja | `YouTubeAuthorizationRevokedError` también cubre un 403 por permiso nunca otorgado. |
| Lectura de conexiones sin registro | Baja | La web no tiene log de servidor: un fallo distinto de 503 al leer conexiones no queda registrado. |
| Gráficos de la serie mensual | Baja | Idea del usuario. Épica, etapa 7. |

---

## Siguiente paso

Fase 17: elegir el tipo de activo, publicar sin revisión con la titularidad comprobada y verificar el acceso de administración.
