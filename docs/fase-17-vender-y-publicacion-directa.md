# Fase 17 — Vender, publicación directa y acceso de administración verificado

> **Estado**: ✅ Completa
> **Fecha**: Octubre 2026
> **Objetivo**: Que el vendedor elija el tipo de activo, ponga su precio sin confundirlo con la valuación, publique sin revisión cuando la titularidad está comprobada, pueda editar y borrar, y que la plataforma verifique el acceso de administración a su canal.

En producción, `/vender` no dejaba elegir el tipo, el precio se confundía con la valuación, nada se editaba ni se borraba y el panel "Acceso de la plataforma" explicaba de más. Entró por tres PRs: #23 (merge `d8eb344`), #24 (merge `9525423`, regresión con cuentas de marca) y #25 (merge `49ad381`, pendientes de la prueba en producción). El #23 supera el tope de 400 líneas (138 archivos, +8636/−692); cada commit se revisó por separado.

---

## Objetivos cumplidos

- `/vender` con tarjetas por tipo de activo, indicador de pasos y precio primero, con la valuación como referencia.
- Publicación sin revisión cuando la titularidad está comprobada; un activo rechazado vuelve a revisión.
- Borrador editable y borrable; publicado, se cambian precio y moneda.
- Panel de acceso de dos pasos y modal con instructivo y mail de custodia copiable.
- Verificación del acceso por OAuth con la cuenta de custodia, desde `/admin`.
- Rechazo del aviso ("No encontramos la invitación") con aviso al vendedor, y aviso al vendedor cuando se confirma el acceso.
- Bandeja del admin con pestañas, contadores y aviso en la campana.
- Orden del mercado por relevancia, con la transferencia inmediata primero.
- Nivel de vendedor sobre 4 en Verificaciones.
- Verificado de punta a punta en producción el 12/10.

---

## Decisiones técnicas

### 1. Publicación directa con la titularidad comprobada

`Listing.publish()` salta `under_review` cuando la titularidad está comprobada (`PublishingRequirements` es el guarda compartido). Un sitio web sin titularidad va a revisión y un rechazado vuelve a revisión. Rutas: `POST /listings/:id/publish`, `PATCH /listings/:id` y `DELETE /listings/:id`.

### 2. Antes de la venta solo el acceso de administración

`TransferStep.phase` distingue `listing` de `operation`. Antes de la venta se explican dos pasos: la cuenta de marca y la invitación como administrador. Quitar el acceso directo y el propietario principal pasan a la operación, que se muestra con el contrato firmado y los 7 días cumplidos. "Ya los invité" guarda `platformAccessRequestedAt`.

### 3. Verificación de la custodia por OAuth

El admin autoriza con la cuenta de custodia usando `enable_yt_permissions=true` más `openid email`, con `prompt=select_account consent`. Se exige que el mail del ID token sea el de la cuenta de custodia y después que el canal elegido coincida con el del activo. La constancia guarda el mail y el `sub`. Sin la verificación del mail, bastaba con que cualquier cuenta administrara el canal.

### 4. Nivel de vendedor sobre 4

Titularidad +1, acceso +2 y Mercado Pago +1. El KYC es requisito y no suma. Si Mercado Pago no está disponible, la tarjeta se oculta y el nivel es sobre 3.

### 5. Orden por relevancia

Primero lo listo para transferir, después lo publicado más reciente, con desempate por id. Es el orden por defecto y no ensucia la URL.

### 6. Canales de una conexión

La tarjeta "Canal de YouTube" ofrece solo canales disponibles: uno ya publicado, en operación o vendido no aparece. Con borrador se ofrece continuarlo o publicar otro canal.

### 7. Conexión del vendedor sin `enable_yt_permissions` (PR #24)

El parámetro se había sumado a la conexión del vendedor para listar canales por nombre. En producción, un canal en cuenta de marca (Pc Lover) volvía sin los permisos de YouTube Analytics ("Faltan permisos"), en local y en producción; un canal fuera de cuenta de marca conectaba bien. El parámetro quedó solo en la verificación del admin y se sumó la ayuda "Si tu canal está en una cuenta de marca, elegí esa cuenta en Google: puede tener otro nombre".

### 8. Pendientes de la prueba en producción (PR #25)

- El modal de "Ya los invité" quedaba en "Un momento…": `revalidatePath` volvía a renderizar la pestaña completa dentro de la respuesta de la acción. Ahora se cierra con `router.refresh()`.
- Aviso `acceso_confirmado` al vendedor, con la fecha en `occursAt`.
- Foto de cada canal en "Elegí un canal" y "1 suscriptor" en singular.
- Desglose del nivel de vendedor dentro de su tarjeta.

---

## Migraciones

Cuatro, aditivas, aplicadas por `deploy.sh`:

- `add_platform_access_requested_at`
- `add_access_not_found_notification`
- `add_access_requested_notification`
- `add_access_confirmed_notification` (también suma `notifications.occursAt`)

La conexión y la verificación necesitan `YOUTUBE_OAUTH_*`, `YOUTUBE_API_KEY` y una cuenta de custodia de YouTube activa con el identificador real, no el marcador del seed.

---

## Verificación en producción

El 12/10: Pc Lover se conecta (con el arreglo del #24), se publica sin revisión, "Ya los invité" queda guardado y el admin verifica el acceso con la cuenta de custodia: "Acceso verificado". Antes, el 11/10, el caso feliz y el rechazo (otra cuenta, otro canal) se recorrieron en local con la consola real de Google. Encontró, además de lo anterior, que Google reutiliza la elección de canal de un permiso previo si no se pide `consent`.

---

## Tests

| Paquete | Pruebas |
|---|---|
| Dominio | 996 |
| Base de datos (`marketplace_test`) | 121 |
| API | 411 |
| Web | 372 |

`tsc` sin errores. El `lint` del web conserva dos errores previos en `error.tsx` y `global-error.tsx`. Los componentes del web se escribieron sin tests de DOM, que no existen en el paquete.

---

## Deuda técnica conocida

El detalle está en la épica `odd/epica-cierre-mvp.md`.

| Item | Prioridad | Descripción |
|---|---|---|
| Avisos que se pierden | Media | Si falla la notificación después de guardar, el destinatario no se entera. Épica, etapa 5. |
| Carrera de "Ya los invité" | Media | Puede pisar la constancia que el admin registra al mismo tiempo. Épica, etapa 5. |
| "Otra cuenta" por el texto | Media | La web distingue el error por el prefijo del mensaje; falta un código propio. Épica, etapa 5. |
| Selector de canales con reintento | Media | Volver a `enable_yt_permissions` en el vendedor y reintentar sin el parámetro si faltan permisos de Analytics. Épica, etapa 7. |
| Aviso al admin genérico | Baja | Dice "Un vendedor ya nos invitó", sin nombres. Épica, etapa 2. |
| Listado de reclamos | Baja | La pestaña del admin solo muestra el conteo. Épica, etapa 6. |
| Valuación solo en USD | Baja | En pesos no hay diferencia porcentual. Épica, etapa 7. |

---

## Siguiente paso

Etapa 1 de la épica: el experimento del 16/10, traspaso de propietario principal con Pc Lover, para validar la custodia antes de seguir.
