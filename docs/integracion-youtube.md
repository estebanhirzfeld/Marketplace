# Integración con YouTube — pasos de configuración

> **Objetivo**: dejar la plataforma en condiciones de (a) leer métricas públicas de cualquier canal y (b) comprobar que un vendedor realmente controla el canal que publica.
> **Quién ejecuta**: los pasos de la consola de Google los hace una persona. Las credenciales no pasan por el repositorio.

---

## Lo que se puede y lo que no

Antes de configurar nada conviene tener claro el techo, porque define qué tiene sentido construir.

| Objetivo | ¿Se puede? | Con qué |
|---|---|---|
| Suscriptores, vistas, cantidad de videos de un canal | Sí | Clave de API. Sin consentimiento del usuario |
| Probar que el vendedor controla el canal | Sí | OAuth del **vendedor** |
| Saber si el canal es Cuenta de Marca | **No** | Ningún campo lo expone |
| Saber quiénes son los propietarios del canal | **No** | Ningún campo lo expone |
| Probar que **la plataforma** tiene el ownership | **No** | Se atestigua a mano (`PlatformAccessRecord`) |
| Ingreso mensual | **No** | Solo en reportes de content owner (MCN certificado) |
| Strikes y estado del canal | Quizás | `auditDetails`, scope restringido para MCNs |

---

## Dos credenciales distintas, dos alcances distintos

Esto es lo que más conviene entender antes de entrar a la consola: **no es una sola credencial**.

### 1. Clave de API — métricas públicas

Sirve para consultar cualquier canal por su ID. No requiere que nadie inicie sesión, no pasa por pantalla de consentimiento y no necesita verificación de Google. Funciona el mismo día.

Cubre lo que hoy el vendedor declara a mano en el formulario de publicación: suscriptores, vistas totales, cantidad de videos.

### 2. Cliente OAuth — prueba de titularidad

Sirve para una sola cosa: que el vendedor inicie sesión con su cuenta de Google y que la API nos devuelva *sus* canales (`channels.list` con `mine=true`). Si el canal que publicó aparece en esa lista, controla el canal.

Requiere pantalla de consentimiento y, para salir a producción, verificación de Google.

---

## Pasos en la consola de Google

### A. Proyecto y API

1. Entrar a [console.cloud.google.com](https://console.cloud.google.com) y crear un proyecto. Nombre sugerido: `traspaso-marketplace`.
2. En **APIs y servicios → Biblioteca**, buscar **YouTube Data API v3** y habilitarla.

### B. Clave de API

3. **APIs y servicios → Credenciales → Crear credenciales → Clave de API**.
4. Restringirla: en **Restricciones de API**, elegir *Restringir clave* y marcar solo **YouTube Data API v3**. Sin esto, una clave filtrada sirve para cualquier API del proyecto.
5. Guardar el valor. Va a `apps/api/.env` como `YOUTUBE_API_KEY`.

### C. Pantalla de consentimiento

6. **APIs y servicios → Pantalla de consentimiento de OAuth**.
7. Tipo de usuario: **Externo**. (Interno solo existe con Google Workspace.)
8. Completar nombre de la app, correo de asistencia y correo de contacto del desarrollador.
9. En **Permisos**, agregar únicamente:
   ```
   https://www.googleapis.com/auth/youtube.readonly
   ```
   Es el scope mínimo para lo que necesitamos: *"View your YouTube account"*. No pedir `youtube` ni `youtube.force-ssl` — dan permiso de escritura y borrado, y encarecen la verificación sin aportar nada.
10. En **Usuarios de prueba**, agregar las cuentas de Google que van a probar el flujo, incluida la de la demo.

### D. Cliente OAuth

11. **Credenciales → Crear credenciales → ID de cliente de OAuth → Aplicación web**.
12. En **URI de redireccionamiento autorizados**, agregar:
    ```
    http://localhost:3000/api/youtube/callback
    ```
    Cuando haya dominio, agregar también el de producción. Google exige coincidencia exacta: un `/` de más y falla.
13. Guardar el **ID de cliente** y el **secreto de cliente**.

---

## Variables de entorno

Los `.env` no están en el repositorio y no se versionan. Agregar a `apps/api/.env`:

```
YOUTUBE_API_KEY=...
YOUTUBE_OAUTH_CLIENT_ID=...
YOUTUBE_OAUTH_CLIENT_SECRET=...
YOUTUBE_OAUTH_REDIRECT_URI=http://localhost:3000/api/youtube/callback
```

---

## El límite del modo de prueba, y por qué acá no molesta

Mientras la app esté en estado **Prueba**:

- Hasta **100 usuarios de prueba**, y solo esas cuentas pueden autorizar.
- Google muestra una advertencia de aplicación no verificada antes de pedir el consentimiento.
- Las autorizaciones **expiran a los 7 días**, y con ellas los refresh tokens.

Para salir de ahí hay que pasar a **En producción** y completar la verificación de Google, porque los scopes de YouTube son sensibles. Es un trámite con revisión humana y video demostrativo, razonable para un lanzamiento y desproporcionado para una defensa de tesis.

**La expiración de 7 días no nos afecta, y vale la pena entender por qué.**

La verificación de titularidad es una foto, no una suscripción. El vendedor autoriza una vez, hacemos una llamada, guardamos el resultado y descartamos el token. Nunca necesitamos volver a llamar en su nombre.

De eso se desprende la decisión de diseño más importante de esta integración: **la plataforma no guarda tokens de OAuth**. Ni access token ni refresh token. Se piden con `access_type=online`, se usan una vez y se tiran.

Las consecuencias son buenas en las tres direcciones:

- No hay credenciales de terceros en reposo, así que no hay nada que filtrar ni que rotar.
- La expiración a los 7 días es irrelevante: el token vive segundos.
- Lo que queda guardado es una constancia con fecha —igual que `PlatformAccessRecord` y que la verificación de custodia—, que es exactamente lo que se puede afirmar con honestidad: *"el 30 de agosto, esta persona controlaba este canal"*.

Lo que **no** podemos afirmar es que lo siga controlando hoy. Ninguna API nos lo diría, y la interfaz no debe sugerir lo contrario.

---

## Orden de construcción

1. ~~**Adaptador de métricas públicas**~~ — **hecho**. Con la clave de API contrasta suscriptores, vistas y videos contra lo declarado.
2. ~~**Flujo de titularidad**~~ — **hecho**. `GET /listings/:id/autorizacion/:fuente` da la dirección de Google; la vuelta cae en `/api/youtube/callback`, que canjea el código y compara.
3. ~~**Sitios web**~~ — **hecho, y por una vía mejor que la prevista**: en vez de verificar el dominio por DNS, la AdSense Management API comprueba de una sola vez que el vendedor controla la cuenta que cobra y cuánto gana ese dominio.

### La asimetría entre los dos tipos de activo

| | YouTube | Sitio web |
|---|---|---|
| Identidad y audiencia | Sí | Sí |
| Control del activo | Sí, con OAuth | Sí, con OAuth |
| **Ingreso** | **No, por ninguna vía** | **Sí, con AdSense** |

Un sitio web queda verificable casi por completo, incluido el dato que fija el precio. Un canal de YouTube no, porque las propiedades de YouTube quedaron fuera de los reportes de la AdSense Management API y las métricas monetarias tampoco están en los reportes de canal de YouTube Analytics.

Para el ingreso de un canal no queda camino técnico. La respuesta es de diseño del negocio: retener parte del pago y liberarlo contra el desempeño medido, de modo que declarar de más no rinda.

**Para AdSense hay que agregar un scope** a la pantalla de consentimiento, junto al de YouTube:

```
https://www.googleapis.com/auth/adsense.readonly
```

---

## Cuota

10.000 unidades diarias. Una consulta a `channels.list` cuesta **1 unidad**, así que alcanza para miles de verificaciones por día. `search.list` se contabiliza aparte y tiene un tope de 100 llamadas diarias, pero no lo usamos.

La cuota no es la restricción de esta integración. La restricción es qué expone la API.

---

## Fuentes

- [YouTube Data API — Channels: list](https://developers.google.com/youtube/v3/docs/channels/list)
- [YouTube Data API — Channels resource](https://developers.google.com/youtube/v3/docs/channels)
- [YouTube Data API — OAuth 2.0 scopes](https://developers.google.com/youtube/v3/guides/auth/installed-apps)
- [Manage App Audience — Google Cloud Console Help](https://support.google.com/cloud/answer/15549945)
- [OAuth app state overview — Google for Developers](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview)
