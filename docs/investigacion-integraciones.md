# Investigación — Qué se puede automatizar con las APIs

> **Fecha**: Agosto 2026
> **Objetivo**: Determinar, antes de escribir un adaptador, qué partes del flujo de negocio pueden automatizarse contra las APIs de YouTube y qué queda necesariamente manual.

---

## Resumen

Tres conclusiones, en orden de impacto sobre el modelo:

1. **La transferencia de titularidad de un canal de YouTube no se puede automatizar.** No existe API. Y la regla de los 7 días de Google, aplicada dos veces, impone un piso de aproximadamente **14 días** al flujo de custodia.
2. **El ingreso mensual declarado no se puede verificar por API** para un canal común. Es el dato que más pesa en la valuación.
3. **Instagram y TikTok prohíben transferir cuentas.** Dos de los cuatro tipos de activo del dominio tienen un problema anterior al técnico.

---

## 1. Transferencia de titularidad — no automatizable

### Lo que dice Google

La documentación oficial de YouTube establece, para cambiar el propietario principal de un canal con Cuenta de Marca:

> *"To become primary owner, you must have been an owner for 7 days or more."*

> *"An account must have one primary owner."*

> *"If you delete the primary owner account linked to your channel, the channel will also be deleted."*

No hay endpoint para ninguna de estas operaciones: se hacen desde la interfaz de Cuentas de Marca de Google. Los permisos se administran fuera de la API, y quienes son invitados a administrar un canal **no pueden hacerlo mediante las APIs de YouTube**.

### Qué implica para el escrow

El flujo de custodia requiere dos cambios de propietario principal: del vendedor a la plataforma, y de la plataforma al comprador. Cada uno arrastra la espera de 7 días.

| Etapa | Espera |
|---|---|
| La plataforma es invitada como propietaria | — |
| La plataforma puede volverse propietaria principal | **+7 días** |
| El comprador es invitado como propietario | — |
| El comprador puede volverse propietario principal | **+7 días** |

**Piso realista: 14 días** entre el contrato firmado y el cierre, y eso sin contar demoras humanas.

`YouTubeStrategy.getTransferSteps()` ya contempla un congelamiento de 7 días en el paso 5, del lado del comprador. **Falta el otro**: el mismo período se aplica cuando la plataforma toma la custodia.

### Un error concreto en el código

`getTransferSteps()` marca el paso 8 —*"Plataforma elimina al seller del canal y cierra la operación"*— como `automated: true`. **No lo es**: quitar a un propietario se hace a mano en la interfaz de Cuentas de Marca.

El paso 3 —verificación de ownership y captura de métricas— sí es parcialmente automatizable.

### El riesgo que esto abre

Durante los 7 días en que la plataforma es propietaria pero **todavía no principal**, el vendedor sigue siendo el propietario principal y conserva la facultad de expulsarla. La custodia no es efectiva hasta que el cambio de propietario principal se completa.

Esto no invalida el modelo, pero cambia cuándo se le puede pedir el pago al comprador: **recién cuando la plataforma es propietaria principal**, no cuando fue invitada.

### Corrección: la espera de 7 días corre para las dos partes

La cita de arriba —*"To become primary owner, you must have been an owner for 7 days or more"*— describe solo la mitad de la regla. La página de Google sobre cambiar quién administra una Cuenta de Marca la enuncia completa, y son **dos** condiciones simultáneas:

> *"The person making the change has been an owner for 7 days or more"*

> *"The person becoming the new primary owner has been a manager or owner for 7 days or more"*

Si alguna no se cumple, Google devuelve un error.

Para nuestro flujo el piso de 14 días no cambia, porque quien cede siempre lleva más de 7 días como propietario: el vendedor lo es desde antes de publicar, y la plataforma cumple sus 7 días al volverse principal. Pero la regla es más estricta de lo que decíamos, y conviene tenerla escrita entera: **la plataforma no puede cederle el canal al comprador el mismo día en que lo recibió**, aunque el comprador ya llevara sus 7 días esperando.

### Un paso que faltaba: salir del modelo nuevo de permisos

YouTube está migrando la administración de accesos desde los roles de Cuenta de Marca hacia los **permisos de canal** de YouTube Studio. Los dos modelos coexisten, y son incompatibles con la transferencia:

> *"Only opt out of channel permissions if you need to complete a channel transfer."*

Para mover un canal entre Cuentas de Marca hay que **salir de los permisos de canal** en YouTube Studio y no tener a nadie más con acceso otorgado por esa vía. Un canal que use el modelo nuevo —cada vez más son así— no se puede transferir hasta que su propietario principal lo desactive.

Esto es un paso previo del vendedor que `getTransferSteps()` no contempla, y es de los que rompen el traspaso con un error incomprensible: el vendedor invita a la plataforma, la invitación parece funcionar, y el cambio de propietario principal falla sin explicar por qué.

---

## 1bis. ¿Una cuenta nuestra puede sostener varios activos a la vez?

La pregunta importa porque define el esquema de datos: si la plataforma necesitara una cuenta de Google por operación, la identidad de custodia sería un campo de la operación; si alcanza con una, sería configuración.

### Lo que dice Google

> *"You can use one Google Account to manage multiple Brand Accounts connected to YouTube channels."*

> *"If you have multiple YouTube channels connected to Brand Accounts, you can manage them all through one Google Account without signing out."*

Y sobre la unicidad, que es lo que podría haber sido un impedimento:

> *"An account must have one primary owner."*

La restricción es **por Cuenta de Marca, no por cuenta de Google**: cada canal necesita exactamente un propietario principal, pero nada impide que la misma cuenta de Google ocupe ese lugar en varios canales a la vez.

**Respuesta: sí.** Una sola cuenta puede sostener múltiples canales en custodia simultáneamente.

### Lo que Google NO dice

No hay un límite documentado —ni de Cuentas de Marca por cuenta de Google, ni de propietarios por Cuenta de Marca—. Circulan cifras de 50 o 100 canales por cuenta, pero **ninguna sale de documentación oficial** y no conviene apoyar un diseño en ellas. Que no esté documentado no es lo mismo que garantizar que no exista.

### El argumento en contra de una sola cuenta

Que se pueda no quiere decir que convenga, y la razón está en una cita que ya teníamos:

> *"If you delete the primary owner account linked to your channel, the channel will also be deleted."*

Con una única cuenta de custodia, perderla —suspensión, recuperación fallida, un error de Google— **destruye todos los canales que la plataforma tenga en custodia al mismo tiempo**, no uno. Es la diferencia entre un incidente y el fin del negocio.

### Recomendación para el modelo de datos

Registrar **qué cuenta sostiene qué activo**, sea cual sea la política operativa. Así "una sola cuenta" y "una por operación" dejan de ser decisiones de esquema y pasan a ser decisiones de operación, reversibles sin migrar nada. Además es el dato que hoy falta para que el traspaso sea ejecutable: el vendedor no tiene a quién invitar y el comprador no sabe de quién va a recibir la invitación.

Para sitios web el problema no existe: una cuenta de registrador administra tantos dominios como se quiera, y no hay ventana de espera.

---

## 2. El ingreso mensual no se puede verificar

La documentación de YouTube Analytics es explícita:

> *"Estimated revenue and ad performance metrics are not currently supported for channel reports."*

> *"As a result, the `https://www.googleapis.com/auth/yt-analytics-monetary.readonly` scope does not currently grant access to monetary data in those reports."*

Las métricas monetarias solo están disponibles en **content owner reports**, que requieren ser un Content Owner certificado por YouTube —una red o MCN—, no un intermediario común.

### Por qué importa tanto

`YouTubeStrategy.calculateEstimatedPrice()` valúa un canal monetizado como `ingresoMensual × múltiplo`. El ingreso es **el** insumo de la valuación, y es justamente el que la plataforma no puede comprobar.

Lo que sí se puede verificar por API queda del lado de la audiencia: suscriptores, vistas, tiempo de reproducción, altas y bajas de suscriptores. Útil para detectar una inconsistencia grosera, insuficiente para validar el número que fija el precio.

**Consecuencia de diseño**: el ingreso declarado seguirá siendo una declaración jurada del vendedor. Corresponde tratarlo como tal en la interfaz y en el contrato, en vez de presentarlo como dato verificado.

**Y la respuesta, que no es técnica ni financiera**: la plataforma cobra 5% a cada parte y no asume el riesgo de que una de ellas mienta. No retiene fondos, no ajusta el precio después del cierre y no arbitra la verdad de un número que ninguna API expone.

Lo que sí hace es dejar constancia: qué se declaró, cuándo y quién lo declaró, con el contrato firmado y su huella SHA-256. Ante un fraude, entrega esa documentación y los datos identificatorios de la parte en falta a su contraparte, para que inicie las acciones legales que correspondan. El valor que vende la plataforma es la custodia del activo y la mediación de los instrumentos, no una garantía contra un contraparte que miente.

---

## 2 bis. La propiedad de la plataforma no es verificable por API

Ampliación posterior de la investigación, y el hallazgo que más condicionó el diseño.

El recurso `channel` de la Data API admite las partes `snippet`, `contentDetails`, `statistics`, `topicDetails`, `status`, `brandingSettings`, `auditDetails`, `contentOwnerDetails` y `localizations`. **Ninguna expone si el canal es una Cuenta de Marca, y ninguna lista sus propietarios o administradores.** `contentOwnerDetails` solo identifica al content owner vinculado, que es otra cosa: un MCN certificado.

A eso se suma que quien es invitado a administrar un canal mediante permisos de canal *"can't manage via YouTube APIs"*.

Las dos cosas juntas significan que **ningún software puede comprobar que la plataforma tiene el ownership de un canal**. Es un estado que solo puede atestiguar una persona.

### Consecuencias de diseño

1. La constancia de acceso es manual por necesidad, no por falta de trabajo. Igual que la constancia de custodia.
2. Un distintivo permanente de "listo para transferir" estaría afirmando algo que la plataforma no puede ni verificar ni monitorear: durante la espera el vendedor sigue siendo propietario principal y puede expulsarnos sin que nada nos avise. Por eso el estado se muestra con la fecha del cálculo y existe una forma explícita de revocar la constancia.
3. Lo que sí se deriva de forma confiable es el **plazo**: registrada la fecha desde la que hay acceso, los 7 días se calculan. La espera pertenece a la `IAssetStrategy`, no a la entidad, porque es una regla de la plataforma del activo — un sitio web no la tiene.

### Verificación de titularidad del vendedor: eso sí se puede

`channels.list` con `mine=true` devuelve *"only return channels owned by the authenticated user"*. Con un OAuth **del vendedor** —no un acceso nuestro— se confirma que en ese instante controla el canal, y de paso se capturan `statistics` y `status`. Es el complemento barato de la constancia manual y queda pendiente porque requiere credenciales de Google.

### `auditDetails`: el part que existe para esto

Devuelve `overallGoodStanding`, `communityGuidelinesGoodStanding`, `copyrightStrikesGoodStanding` y `contentIdClaimsGoodStanding` — exactamente lo que hoy el vendedor declara a mano en `has_strikes`. Requiere el scope restringido `youtubepartner-channel-audit`, pensado para MCNs, y *"any token that uses that scope must be revoked when the MCN decides to accept or reject the channel or within two weeks"*. Habría que pedirle la aprobación a Google sin garantía de obtenerla, pero el caso de uso encaja tan bien que vale intentarlo.

---

## 3. Lo que sí se puede automatizar

| Dato | Endpoint | Costo | Requisito |
|---|---|---|---|
| Suscriptores, vistas, cantidad de videos | `channels.list` | 1 unidad | Clave de API |
| Vistas, tiempo de reproducción, altas y bajas de suscriptores | YouTube Analytics, channel reports | — | OAuth del **dueño** del canal |
| Verificación de propiedad | `channels.list` con `mine=true` | 1 unidad | OAuth del dueño |

**Cuota**: 10.000 unidades diarias para el conjunto de endpoints, y **100 llamadas diarias** a `search.list`, que se contabiliza aparte.

A un costo de 1 unidad por consulta de canal, la cuota no es una restricción para el volumen de un marketplace de este tamaño: alcanza para miles de verificaciones diarias. **La cuota no es el límite. El límite es qué expone la API.**

---

## 4. Instagram y TikTok — un problema anterior al técnico

TikTok, en sus términos de servicio, sección 3.2:

> *"Do not give others access to your account, or transfer your account to anyone else, without our permission."*

Instagram, según fuentes secundarias, prohíbe la compraventa de cuentas y contempla la suspensión de ambas partes. **Esta afirmación no pudo verificarse contra la fuente oficial**: la página de términos no devolvió contenido al consultarla. Antes de tomar cualquier decisión sobre esto hay que leer los términos directamente.

El dominio tiene `AssetType.INSTAGRAM` y `AssetType.TIKTOK` con su `SocialStrategy`. Si la transferencia de esas cuentas viola los términos de las plataformas, el problema no es que no haya API: es que el activo no se puede entregar de forma legítima, y la plataforma quedaría facilitando un incumplimiento contractual de sus usuarios frente a un tercero.

**Es una decisión de producto, no de ingeniería.** Las opciones eran acotar el marketplace a YouTube y sitios web, o asumir el riesgo de forma explícita y documentada.

### Resolución: quedan afuera

Se acotó el marketplace a **canales de YouTube y sitios web**. Instagram y TikTok salieron del catálogo por completo: del enum `AssetType`, del enum de Prisma —con una migración que recrea el tipo, porque Postgres no permite quitar valores—, de la factory de estrategias y de toda la interfaz.

El motivo es el que se investigó: si transferir la cuenta viola los términos de la plataforma, el activo no se puede entregar de forma legítima y el marketplace estaría facilitando el incumplimiento de sus propios usuarios frente a un tercero. No es que falte una API, es que no hay traspaso posible.

La `SocialStrategy` se eliminó. Una fila vieja con uno de esos tipos ya no se reconstituye: la factory la rechaza, y hay un test que lo fija.

---

## 5. Firma electrónica en Argentina — verificación de lo ya escrito

Las plantillas de contrato afirman que la firma utilizada no es firma digital y no goza de presunción de autoría. La Ley 25.506 lo confirma:

**Artículo 5** — *"Se entiende por firma electrónica al conjunto de datos electrónicos […] utilizado por el signatario como su medio de identificación, que carezca de alguno de los requisitos legales para ser considerada firma digital. En caso de ser desconocida la firma electrónica corresponde a quien la invoca acreditar su validez."*

**Artículo 7** — *"Se presume, salvo prueba en contrario, que toda firma digital pertenece al titular del certificado digital que permite la verificación de dicha firma."*

**Artículo 8** — *"Si el resultado de un procedimiento de verificación de una firma digital aplicado a un documento digital es verdadero, se presume, salvo prueba en contrario, que este documento digital no ha sido modificado desde el momento de su firma."*

Las presunciones de los artículos 7 y 8 alcanzan **únicamente** a la firma digital. Con firma electrónica, la carga de la prueba recae sobre quien la invoca — es decir, sobre la plataforma si tuviera que hacer valer un contrato.

**Lo que aporta el hash SHA-256 ya implementado**: no otorga la presunción del artículo 8, pero constituye evidencia técnica de integridad que refuerza la posición probatoria. Es exactamente la clase de elemento que ayuda a "acreditar su validez" cuando el artículo 5 lo exige.

**Lo que aportaría un proveedor de firma**: sello de tiempo de un tercero independiente y trazabilidad de la identidad del firmante. Sigue sin ser firma digital en el sentido del artículo 2 —eso requiere un certificado de un certificador licenciado—, pero mejora la posición probatoria.

---

## Qué se propone construir

Ordenado por valor sobre esfuerzo:

| Prioridad | Qué | Por qué |
|---|---|---|
| ~~Alta~~ **Hecho** | Registro de verificación en la custodia | `ConfirmCustody` era un botón sin constancia. Ahora exige declarar qué se verificó, y rechaza la custodia si la plataforma no es propietaria principal. |
| ~~Alta~~ **Hecho** | Constancia de acceso y candado sobre el tripartito | Firmar el tripartito es el punto de no retorno. Se bloquea hasta que hay acceso registrado y el plazo de espera del activo se cumplió. |
| **Alta** | Verificación de titularidad por OAuth del vendedor al publicar | `mine=true` lo permite y es barato. Requiere credenciales de Google. |
| ~~Alta~~ **Hecho** | Corregir `getTransferSteps()` | Ningún paso queda marcado como automatizable, porque ninguno lo es. Se agregó la espera de 7 días del lado de la plataforma: son nueve pasos y dos ventanas. |
| ~~Alta~~ **Hecho** | Marcar el ingreso como declarado, no verificado | `getVerifiableMetrics()` ya no incluye `revenue`. Queda un test que lo fija. |
| **Media** | Adaptador de YouTube Data API para métricas de audiencia | Suscriptores y vistas sí se verifican. Requiere una clave de API. |
| ~~Media~~ **Resuelto** | Decisión sobre Instagram y TikTok | Quedaron fuera del catálogo. El marketplace se acotó a canales de YouTube y sitios web. |
| **Media** | Pedir el scope `youtubepartner-channel-audit` | Reemplazaría `has_strikes` declarado por dato verificado. Aprobación de Google no garantizada. |
| **Baja** | Proveedor de firma electrónica | El hash ya aporta integridad. El sello de tiempo de un tercero mejora la posición probatoria pero no cambia el encuadre legal. |

---

## Fuentes

- [Change channel owners & managers with a Brand Account — YouTube Help](https://support.google.com/youtube/answer/4628007?hl=en)
- [Change who manages your Brand Account — Google Account Help](https://support.google.com/accounts/answer/7311601?hl=en&co=GENIE.Platform%3DDesktop) — la regla de los 7 días completa, para las dos partes
- [Manage your Brand Account — Google Account Help](https://support.google.com/accounts/answer/7001996?hl=en&co=GENIE.Platform%3DDesktop) — una cuenta de Google administra varias Cuentas de Marca
- [Manage YouTube channels — YouTube Help](https://support.google.com/youtube/answer/4642409?hl=en)
- [Move your YouTube channel from one Brand Account to another — YouTube Help](https://support.google.com/youtube/answer/3056283?hl=en)
- [Migrate from Brand Account user access to channel permissions — YouTube Help](https://support.google.com/youtube/answer/9367690?hl=en)
- [YouTube Data API v3 — Getting Started](https://developers.google.com/youtube/v3/getting-started)
- [YouTube Data API — Channels resource](https://developers.google.com/youtube/v3/docs/channels)
- [YouTube Data API — Channels: list](https://developers.google.com/youtube/v3/docs/channels/list)
- [YouTube Analytics API — Channel Reports](https://developers.google.com/youtube/analytics/channel_reports)
- [YouTube Analytics API — Content Owner Reports](https://developers.google.com/youtube/analytics/content_owner_reports)
- [TikTok — Terms of Service](https://www.tiktok.com/legal/page/us/terms-of-service/en)
- [Ley 25.506 de Firma Digital — InfoLEG](https://servicios.infoleg.gob.ar/infolegInternet/anexos/70000-74999/70749/norma.htm)
