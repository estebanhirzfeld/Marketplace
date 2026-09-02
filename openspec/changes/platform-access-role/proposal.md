# Propuesta: el rol que sostiene la plataforma, y contarlo bien

## Intención

Hoy le pedimos al vendedor que nos invite **como propietaria del canal**. Es más poder del que necesitamos y es exactamente el que le da miedo ceder.

La regla real de Google, verificada contra su documentación oficial y citada entera en `docs/investigacion-integraciones.md` §1:

> *"The person becoming the new primary owner has been a **manager or owner** for 7 days or more"*

La antigüedad **como administrador cuenta**. Y un administrador no puede borrar el canal ni quitar propietarios. O sea que el vendedor puede sumarnos con permisos mínimos, seguir siendo dueño absoluto de su canal, y el plazo de siete días corre igual mientras recibe ofertas.

Eso convierte una limitación en el argumento de venta: *podés publicar y recibir ofertas concretas sin comprometer tu activo*. El poder se cede una sola vez, al final, cuando las dos partes ya se comprometieron.

Este cambio hace cierto ese enunciado en el producto y lo cuenta donde corresponde.

## El problema que resuelve

La propuesta de valor original era automatizar el traspaso con APIs. La investigación la mató: Google no expone ninguna forma de leer ni cambiar la titularidad de un canal. Pero la automatización nunca fue el valor — era un medio. Nadie paga una comisión por ahorrarse clics.

El valor es que **ninguna de las dos partes tiene que confiar en la otra**:

- El vendedor teme entregar un canal que es su esfuerzo y su ingreso.
- El comprador teme pagar dinero real por algo que no puede verificar del todo.

El modelo del dominio ya sostiene esa historia. Lo que está mal es lo que pedimos y lo que decimos.

## Alcance

### Dentro

- Registrar **qué rol** sostiene la plataforma (`PlatformAccessRecord.heldRole`).
- Corregir los pasos de `YouTubeStrategy`: pedir administrador, y agregar el paso posterior donde el vendedor nos promueve.
- Corregir `waitingNotice` de YouTube, que hoy enuncia la regla más angosta de lo que es.
- Poner el **identificador de la cuenta de custodia** a la vista donde el vendedor actúa, y explicar el alcance de los permisos.
- Decir en `WebStrategy` lo que corresponde sobre el bloqueo de 60 días.
- El copy que sostiene la historia: la landing, el panel del vendedor, el formulario de acceso.

### Fuera

- **`guion_pitch_final.md`.** Sigue vendiendo "integración de APIs, métricas reales, badge inmutable, valuación automática" — contradicho por la investigación. Es el guion de defensa del usuario y le corresponde a él.
- **El escrow de sitios web** (`web-escrow-transfer-steps`): `WebStrategy.getTransferSteps()` no tiene paso de custodia mientras `assertCanBeTransferred()` lo exige. Defecto anterior, cambio aparte.
- La comisión 5/5, el orden activo-antes-que-pago, el carácter manual de las constancias.

## Enfoque

### 1. `PlatformAccessRecord.heldRole`

```ts
export type PlatformHeldRole = 'manager' | 'owner';
```

Campo **opcional en el tipo, obligatorio al escribir**, exactamente como se resolvió `custodyAccountId` en `asset-custody-identity`: las constancias anteriores a este cambio se rehidratan sin rol y se muestran como "rol sin registrar". No hay relleno de datos, por el mismo motivo que allá — afirmar un rol que nadie atestiguó sería inventar una constancia.

Vive dentro del blob Json `platformAccess`. **No necesita migración**: a diferencia de `custodyAccountId`, que salió a columna solo para tener integridad referencial contra `custody_accounts`, acá no hay nada a qué apuntar.

`assertCanBeTransferred()` **no cambia**. El plazo se cuenta desde `accessSince` sin mirar el rol, y eso es correcto: la regla de Google no distingue. La compuerta que sí importa —`confirmAssetCustody()` exige `isPrimaryOwner`— ya está bien ubicada.

**Alternativa rechazada**: derivar el rol en vez de guardarlo. No se puede. Ninguna API dice qué rol tenemos, y esa es justamente la razón por la que la constancia existe.

### 2. El corte de `handoverSteps()` deja de servir

```ts
const corte = pasos.findIndex((p) => p.requiredActor !== 'seller');
return corte === -1 ? pasos : pasos.slice(0, corte);
```

Devuelve el tramo inicial de pasos del vendedor y corta en el primero que no lo es. Se escribió asumiendo que lo del vendedor va todo junto al principio.

Con este cambio deja de ser cierto: hace falta un paso del vendedor **después** de los de la plataforma —promovernos a propietario principal— y con este corte quedaría invisible.

**Propuesta**: `handoverSteps()` devuelve todos los pasos con `requiredActor === 'seller'`, y el panel los agrupa en dos momentos según lo que ya sabe del activo:

- **Ahora**: los que puede hacer antes de tener comprador.
- **Cuando haya trato**: el de promovernos, que solo aparece si ya hay una operación con contrato firmado.

Es un cambio de comportamiento y necesita prueba propia. Rechazado: agregar un campo `stage` a `TransferStep` — el momento no es del paso sino de la operación, y la estrategia no conoce operaciones.

### 3. Los pasos corregidos de `YouTubeStrategy`

| # | Hoy | Queda |
|---|---|---|
| 1 | Convertir a Cuenta de Marca | igual |
| 2 | Salir de los permisos de canal | igual |
| 3 | *"Invitá a X como **propietaria** del canal"* | *"Invitá a X como **administrador**"* + el alcance |
| 4 | Verificación y foto de métricas (plataforma) | igual |
| 5 | *"Pasados 7 días la plataforma se convierte en propietaria principal"* | se parte: informativo + el paso nuevo |
| **nuevo** | — | **vendedor**: *"Con el contrato firmado, promovenos de administrador a propietario principal"* |
| 6–9 | comprador y plataforma | igual |

Redacción propuesta para el paso 3:

> **description**: `El vendedor invita a ${cuenta} como administrador del canal`
> **instruction**: `Invitá a ${cuenta} como administrador desde la administración de tu Cuenta de Marca. No como propietario: un administrador no puede eliminar el canal, no puede quitarte a vos, y no puede transferir nada. Lo único que cambia es que arranca el plazo de siete días que exige Google — y ese plazo corre mientras seguís recibiendo ofertas.`

Y el paso nuevo:

> **description**: `El vendedor promueve a ${cuenta} de administrador a propietario principal`
> **instruction**: `Ahora sí: promovenos a propietario principal desde la Cuenta de Marca. Recién en este momento cedés el control, con el contrato ya firmado y el comprador comprometido.`

### 4. `waitingNotice` dice la regla más angosta de lo que es

Hoy: *"YouTube exige haber sido **propietario** del canal durante siete días…"*. La regla real admite administrador, y esa diferencia es el cambio entero. Queda:

> `YouTube exige haber sido administrador o propietario del canal durante siete días antes de permitir el cambio de propietario principal. Por eso alcanza con sumarnos como administrador: el plazo corre igual y vos seguís siendo el dueño.`

### 5. Sitios web: decir la verdad, que es distinta

Según `docs/investigacion-integraciones.md` §1ter, el bloqueo de 60 días de la ICANN impide mover el dominio **a otro registrador**, no cambiar de titular dentro del mismo. El escrow es viable empujando el dominio entre cuentas del mismo registrador.

Pero **no hay equivalente estándar al rol de administrador**. Un vendedor de dominio cede control al ceder el dominio. El producto no debe prometerle lo mismo que a un vendedor de canal.

`WebStrategy.describe().waitingNotice` pasa de `undefined` a nombrar lo que el comprador tiene que saber:

> `Cambiar el titular de un dominio activa un bloqueo de 60 días para moverlo a otro registrador. No afecta la propiedad —el dominio es tuyo desde el traspaso— pero durante ese plazo no vas a poder llevártelo a un registrador distinto.`

Y un paso previo del vendedor: eximirse del bloqueo **antes** de ceder el dominio, si su registrador lo permite. Después ya no se puede.

## El copy, lugar por lugar

| Dónde | Hoy | Queda |
|---|---|---|
| Landing, `page.tsx` | Cuenta el escrow ("primero el activo, después el pago"). No dice nada de publicar sin ceder | Suma el argumento del vendedor: *publicá y recibí ofertas sin entregar tu canal* |
| Panel ACCESO DE LA PLATAFORMA | Empuja a hacerlo temprano pero no tranquiliza | El **mail de la cuenta** destacado, el alcance de los permisos, y la promesa explícita de lo que no podemos hacer |
| `PlatformAccessForm` | Dice "como propietaria" | "como administrador", y selector de rol para la constancia |
| `Transferability` | Correcto del lado comprador | Ajuste menor de vocabulario |
| `vender/page.tsx` | *"en ese momento te pedimos el acceso"* — vago | Nombrar que es acceso de administrador y que no compromete el activo |

Texto propuesto para el panel del vendedor, que es el que más carga:

> **Nos sumás con permisos mínimos**
> Invitanos como **administrador** a `custodia@traspaso.com`. Con ese rol **no podemos** eliminar tu canal, **no podemos** quitarte a vos, y **no podemos** transferirlo a nadie. Seguís siendo el propietario principal y podés echarnos cuando quieras.
> Lo único que cambia es que arranca el plazo de siete días que exige Google. Hacelo ahora y ese plazo corre mientras recibís ofertas, en vez de hacerte esperar cuando ya tengas comprador.

## Impacto de migración

Ninguna. `heldRole` es un campo dentro de una columna Json existente. Las constancias previas quedan sin rol, visibles como "rol sin registrar", y se corrigen volviendo a registrar el acceso — el mismo camino que `custodyAccountId`.

## Riesgos

- **El corte de `handoverSteps()`** es la única modificación de comportamiento; todo lo demás es aditivo o texto. Necesita prueba propia.
- **Se solapa con `asset-custody-identity`**, recién implementado: los dos tocan `PlatformAccessRecord`, `ListingMapper` y `PlatformAccessForm`. Este cambio construye encima, no en paralelo.
- **La cuenta de custodia real todavía no existe**, así que el mail que se muestre va a ser un marcador de posición hasta que el usuario la cree. El texto se vuelve verdadero recién ahí.
- **El guion de defensa queda contradiciendo al producto** hasta que el usuario lo corrija.

## Presupuesto de revisión

Estimado **380–520 líneas**: dominio y estrategias unas 180, pruebas unas 120, web unas 150. **Entra en el presupuesto de 800** y no hace falta partirlo.

Es un cambio chico para lo que corrige, y no es casualidad: el modelo ya sostenía la historia. Lo que faltaba era pedir lo correcto y decirlo.

## Criterios de éxito

- [ ] El instructivo le pide al vendedor **administrador**, no propietario, y le dice qué no podemos hacer con ese rol.
- [ ] El vendedor ve **el mail concreto** de la cuenta a la que tiene que invitarnos, sin salir del panel donde actúa.
- [ ] Existe un paso posterior, visible, donde el vendedor nos promueve — y aparece recién cuando hay contrato firmado.
- [ ] La constancia registra con qué rol quedamos.
- [ ] `waitingNotice` de YouTube enuncia la regla completa, no la angosta.
- [ ] Un vendedor de sitio web no recibe una promesa que solo vale para canales, y el comprador se entera del bloqueo de 60 días.
- [ ] `make test` en verde sin migración de por medio.

## Preguntas abiertas

1. **El selector de rol en `PlatformAccessForm`**: ¿el admin elige entre administrador y propietario al registrar, o se asume administrador y solo se marca la excepción? Lo segundo es menos configuración para el caso normal.
2. **El paso de promoción**: ¿se le muestra al vendedor desde el principio como "esto va a pasar después", o aparece recién cuando hay contrato firmado? Mostrarlo temprano es más honesto sobre lo que se le va a pedir; mostrarlo tarde no lo asusta antes de tiempo.
