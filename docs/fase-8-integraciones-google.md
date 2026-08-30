# Fase 8 — Verificación contra Google

> **Estado**: ✅ Completa — falta completar la consola de Google
> **Fecha**: Agosto 2026
> **Objetivo**: Dejar de creerle al vendedor todo lo que declara.

---

## La investigación primero

Antes de escribir una línea de adaptador se investigó qué exponen realmente las APIs. El resultado está en `docs/investigacion-integraciones.md` y cambió el diseño más de una vez.

La conclusión que ordena todo lo demás:

| | YouTube | Sitio web |
|---|---|---|
| Identidad y audiencia | Sí | Sí |
| Que el vendedor controla el activo | Sí, con su OAuth | Sí, con su OAuth |
| **Ingreso mensual** | **No, por ninguna vía** | **Sí, con AdSense** |

Un sitio web queda verificable casi por completo, incluido el dato que fija el precio. Un canal de YouTube no. Esa asimetría es real, y la interfaz la muestra en vez de disimularla.

---

## Lo que no se puede, y por qué importa

**El ingreso de un canal no es consultable.** La documentación de YouTube Analytics dice que las métricas de ingreso *"are not currently supported for channel reports"*, y remata que el scope `yt-analytics-monetary.readonly` **no da acceso a datos monetarios en esos reportes**. Aunque el vendedor conceda todos los permisos que existen, Google no devuelve el número. Solo existe para content owners certificados, que no somos.

**El ownership de la plataforma tampoco.** Ninguna de las nueve partes del recurso `channel` indica si un canal es Cuenta de Marca ni lista sus propietarios. Y quien es invitado a administrar un canal *"can't manage via YouTube APIs"*. Juntas, las dos cosas significan que **ningún software puede comprobar que la plataforma tiene el ownership**: por eso esa constancia es manual, y va a seguir siéndolo.

`getVerifiableMetrics()` se corrigió en consecuencia: devolvía `['subscribers', 'revenue']` y ahora devuelve solo suscriptores, con un test que lo fija. Declarar verificable el ingreso era la clase de mentira que la plataforma existe para evitar.

---

## Métricas públicas: el redondeo obliga a pensar

`channels.list` con una clave de API devuelve suscriptores, vistas y videos de cualquier canal. Pero **`subscriberCount` viene redondeado hacia abajo a tres cifras significativas**.

Comparar de forma literal marcaría como mentiroso a cualquier canal de más de mil suscriptores. Como el redondeo es determinístico, la comparación correcta no necesita tolerancias inventadas: se le aplica el mismo redondeo al valor declarado y se exige igualdad exacta.

```typescript
export function subscribersAreConsistent(
    declared: number,
    reported: number | undefined,
): boolean | undefined {
    if (reported === undefined) return undefined;

    return floorToThreeSignificantFigures(declared) === reported;
}
```

El `undefined` no es un descuido: un canal puede ocultar sus suscriptores, y tratar la ausencia como desacuerdo sería acusar sin evidencia.

---

## Titularidad: se compara por ID, no por handle

`channels.list` con `mine=true` devuelve *"only return channels owned by the authenticated user"*. El vendedor autoriza, le preguntamos a Google qué canales controla, y buscamos el publicado entre ellos.

La dirección publicada puede ser un handle y la respuesta trae IDs, así que primero se resuelve el handle a su identificador canónico. **Comparar handles sería frágil: se pueden cambiar**, y publicar `@canalA`, renombrarlo y verificar contra otro canal sería trivial.

Elimina el fraude principal del rubro: vender un canal ajeno.

---

## AdSense: la verificación que alcanza el precio

La dimensión se llama `OWNED_SITE_DOMAIN_NAME` y la documentación la define como *"Domain name of a verified site"* — Google ya comprobó por su cuenta que ese sitio pertenece a esa cuenta.

Que el dominio aparezca en el reporte prueba **dos cosas de un saque**: que el vendedor controla la cuenta que cobra, y que ese sitio es el que genera el ingreso. Es el único camino de todo el sistema que alcanza el dato que fija el precio.

---

## No se guarda ningún token

La verificación es una foto, no una suscripción. El vendedor autoriza una vez, se hace una llamada y el token se descarta: `access_type=online`, sin refresh token.

Las consecuencias son buenas en las tres direcciones. No hay credenciales de terceros en reposo, así que no hay nada que filtrar ni que rotar. La expiración de siete días que Google impone a las apps en modo de prueba deja de importar, porque el token vive segundos. Y lo que queda guardado es una constancia con fecha, que es exactamente lo que se puede afirmar con honestidad: *"el 30 de agosto, esta persona controlaba este canal"*.

Lo que **no** se puede afirmar es que lo siga controlando hoy, y la interfaz no lo sugiere.

---

## Un defecto que apareció de costado

Buscando dónde se guardaba la dirección del canal se descubrió que no existía. `getConfidentialFields()` declaraba `channel_url`, `channel_id`, `raw_metrics` y `has_strikes`; `toJSON()` no emitía ninguno.

El problema era más grande: **las listas estaban en snake_case y `assetData` en camelCase**, así que el filtro de los listings blind no encontraba coincidencias. Un canal blind mostraba solo `{subscribers}` —se comía el ingreso, la monetización y el país que él mismo declaraba públicos— y `hiddenFields` nombraba cuatro campos inexistentes.

Se verificó ejecutándolo antes de tocar nada. Las listas ahora usan las claves reales, cada estrategia guarda su campo de identidad, y el modelo quedó más claro: **blind significa que ves los números y no sabés de qué activo se trata**.

El test que faltaba exige que cada campo declarado exista en `assetData`, que ninguno esté en las dos listas, que ninguno quede sin clasificar, y —lo que realmente importaba— que un comprador sin NDA reciba efectivamente los campos públicos. Las listas estaban bien escritas y el filtro estaba bien escrito; nadie comprobaba que hablaran del mismo conjunto de datos.

---

## Pendiente

Completar la consola de Google: clave de API, pantalla de consentimiento con los scopes `youtube.readonly` y `adsense.readonly`, y cliente OAuth. Los pasos están en `docs/integracion-youtube.md`.

Sin credenciales la API arranca igual y las rutas responden 503 con el motivo.

Queda anotado como TODO pedirle a Google el scope `youtubepartner-channel-audit`, que devuelve strikes y estado del canal —hoy declarados a mano—, con la salvedad de que es un scope restringido para MCNs y la aprobación no está garantizada.
