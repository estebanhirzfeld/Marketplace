# Propuesta: identidad de custodia y constancia de entrega

## Intención

El escrow no es ejecutable por una persona real porque faltan dos identidades en el modelo.

**La cuenta de custodia de la plataforma no existe en ninguna parte** — ni en el dominio, ni en Prisma, ni en la semilla, ni en una variable de entorno. El paso 2 de `YouTubeStrategy.getTransferSteps()` dice *"El vendedor invita a la plataforma como propietaria del canal"* sin decir **a quién**. `admin@traspaso.com` es un usuario con rol ADMIN para entrar al sitio, no una cuenta de Google que pueda ser propietaria de una Cuenta de Marca. El vendedor no tiene a quién invitar.

**La entrega al comprador no deja constancia.** `Operation.confirmAssetCustody()` exige una `CustodyVerification` completa cuando el activo entra (quién verificó, si la plataforma quedó como propietaria principal, si los accesos están asegurados, foto de métricas). `Operation.complete()` no registra nada cuando sale: ni destinatario, ni confirmación, ni más fecha que el `completedAt` automático. Al comprador se le dice "estamos entregándote el activo" y el sistema no sabe **dónde**.

## Alcance

### Dentro

- Entidad y tabla `CustodyAccount`: la identidad que sostiene un activo en custodia.
- Vínculo `Listing.platformAccess → CustodyAccount`: qué cuenta sostiene qué activo.
- Identidad receptora declarada por el comprador, en la operación.
- `DeliveryVerification`: constancia de entrega, simétrica a `CustodyVerification`, exigida por `complete()`.
- `getTransferSteps()` parametrizado para poder nombrar la cuenta sin conocerla.
- Paso faltante del vendedor: salir de los permisos de canal de YouTube Studio.
- Una fila de cuenta de custodia en la semilla.

### Fuera

- Comisión 5%/5%, orden asset-first del escrow, y el carácter manual de `registerPlatformAccess` / `confirmCustody`: decisiones cerradas.
- Aprovisionar varias cuentas, o asignar cuentas a administradores. El modelo lo admite; la operación de hoy usa una.
- Guardar credenciales, segundo factor o correos de recuperación. Se guarda **el identificador** de la cuenta, nunca su acceso.
- Variables de entorno para la identidad de custodia.
- **Arreglar el escrow de sitios web** (ver Riesgos): cambio aparte.
- Verificar la titularidad por API (`channels.list` con `mine=true`) y `auditDetails`.

## Capabilities

> Contrato con la fase de specs. `openspec/specs/` todavía no existe: todas son nuevas.

### New Capabilities

- `custody-account`: la identidad que sostiene un activo en custodia, su ciclo de vida y su vínculo con la constancia de acceso.
- `asset-delivery`: identidad receptora del comprador y constancia de entrega que cierra la operación.
- `transfer-steps`: pasos de traspaso parametrizados, capaces de nombrar cuentas concretas.

### Modified Capabilities

- Ninguna.

## Enfoque

### 1. La cuenta de custodia es una entidad propia, no un valor dentro del acceso

`CustodyAccount` = tabla `custody_accounts` + entidad de dominio + `ICustodyAccountRepository`. Campos: `label` operativo, `identifier` (la dirección que el vendedor invita o el usuario del registrador), `assetType`, `isActive`.

**Alternativa rechazada: un value object dentro de `PlatformAccessRecord`** (la columna Json, sin migración). Se descarta por tres motivos concretos:

1. Una misma cuenta sostiene varios activos a la vez —la investigación lo confirma con fuente oficial de Google—, así que su identidad quedaría duplicada en cada blob Json y cambiarla obligaría a reescribirlos todos.
2. No se podría preguntar *"qué activos sostiene la cuenta X ahora mismo"*, que es exactamente la consulta que exige el riesgo de abajo.
3. La cuenta tiene un ciclo de vida propio —se da de alta, se retira— independiente de cualquier listing.

**Tipada por `AssetType`, no por `ownershipSource`.** El descriptor ya sabe contra qué fuente se comprueba la titularidad, pero eso no es lo mismo que dónde vive la custodia: para un sitio web `ownershipSource` es `adsense` y la custodia vive en una cuenta de registrador. Son dos ejes distintos y usar uno para el otro haría que el primer sitio web en custodia quedara mal clasificado.

**Riesgo del modelo operativo, dimensionado.** El radio de daño de una sola cuenta son los activos en custodia **en ese momento** —la custodia dura ~14 días por operación—, no todos los activos que pasaron alguna vez. Lo que lo acota es la concurrencia, no la ventana. A la escala del proyecto son uno o dos canales: una pérdida real y acotada. Registrar qué cuenta sostiene qué activo convierte "una cuenta" o "varias" en una decisión de operación —insertar una fila— y no en una migración.

### 2. La identidad receptora vive en la operación, no en el usuario

Un comprador puede querer dos activos en dos cuentas distintas, y la identidad solo tiene sentido respecto de una entrega concreta. Va en `Operation`: el comprador la declara a partir de `contract_signed`, así la plataforma no queda bloqueada al final esperando un dato.

`DeliveryVerification` es la constancia simétrica: quién entregó, cuándo, a qué identificador (copia congelada, porque la declarada puede cambiar después), si el comprador quedó como propietario principal, si los accesos se cedieron. `complete()` la exige, igual que `confirmAssetCustody()` exige la suya. El campo `isPrimaryOwner` de la entrega es también lo que atestigua la segunda espera de 7 días, sin necesidad de un temporizador nuevo.

`CustodyVerification` suma `custodyAccountId`: la constancia congela desde qué cuenta se entregó, aunque el listing revoque y vuelva a registrar el acceso más tarde.

### 3. La estrategia nombra la cuenta sin conocerla

`getTransferSteps(context?: TransferContext)`, donde el contexto trae la cuenta de custodia y el destinatario si existen. La estrategia escribe la frase —es la única que sabe cómo se dice en su plataforma— y quien la llama aporta los datos. Sin contexto, redacta la variante genérica que se usa hoy en el catálogo. Ninguna cuenta queda escrita en una estrategia.

`YouTubeStrategy` suma el paso que faltaba: **salir de los permisos de canal de YouTube Studio antes de invitar**. Es el paso que rompe el traspaso con un error incomprensible —la invitación parece funcionar y el cambio de propietario principal falla sin explicar por qué—.

## Áreas afectadas

| Área | Impacto | Qué cambia |
|---|---|---|
| `packages/domain/src/entities/CustodyAccount.ts` | Nuevo | Entidad. |
| `packages/domain/src/entities/Listing.ts` | Modificado | `PlatformAccessRecord.custodyAccountId`. |
| `packages/domain/src/entities/Operation.ts` | Modificado | Identidad receptora, `DeliveryVerification`, `complete()` con constancia. |
| `packages/domain/src/strategies/*` | Modificado | `TransferContext`, opt-out de permisos de canal. |
| `packages/domain/src/ports/Repositories.ts` | Modificado | `ICustodyAccountRepository`. |
| `packages/domain/src/use-cases/{listing,operation,admin}/` | Modificado + nuevos | Asignar cuenta, declarar destinatario, completar con constancia. |
| `packages/db/prisma/schema.prisma` | Modificado | Tabla + 3 columnas. |
| `packages/db/src/mappers/`, `seed` | Modificado | Mapeo y una fila de custodia. |
| `packages/api-contract`, `apps/api`, `apps/web` | Modificado | DTOs, rutas y las pantallas que muestran los pasos. |

## Impacto de migración

| Cambio | ¿Migración? |
|---|---|
| Tabla `custody_accounts` | **Sí** — modelo nuevo. |
| `listings.custodyAccountId` (FK nullable) | **Sí** — columna nueva, aditiva. Se desnormaliza fuera del Json para tener integridad referencial y poder consultar qué sostiene cada cuenta. |
| `operations.recipientIdentity` (Json nullable) | **Sí** — columna nueva, aditiva. |
| `operations.deliveryCheck` (Json nullable) | **Sí** — columna nueva, aditiva. |
| `custodyAccountId` dentro de `custodyCheck` | **No** — es Json. |
| Campos por estrategia en `assetData` | **No** — es Json. Los cambios de descriptor y de pasos salen gratis. |

Todo es aditivo y nullable: nada se reescribe y ninguna fila existente queda inválida. Los `platformAccess` ya registrados quedan con `custodyAccountId` nulo —"cuenta sin asignar"— o se apuntan a la fila sembrada; conviene decidirlo en la fase de spec. El flujo de desarrollo (`make fresh` con `db:push`) no lo nota; `make db-reset` sí necesita la migración.

## Riesgos

| Riesgo | Prob. | Mitigación |
|---|---|---|
| **`WebStrategy.getTransferSteps()` no tiene ningún paso de custodia**: va de vendedor a comprador directo, contradiciendo el escrow que el resto del modelo impone. `Listing.assertCanBeTransferred()` exige `platformAccess` para todo listing, así que hoy un sitio web no puede llegar legítimamente a custodia. | Alta (ya existe) | **Cambio aparte** (`web-escrow-transfer-steps`): arreglarlo exige investigar el traspaso real de dominios (código EPP, bloqueo ICANN de 60 días) y duplicaría este cambio. El modelo que se propone acá lo deja como alta de datos y de texto, no como re-modelado. Mientras tanto se siembra solo una cuenta de custodia de YouTube. |
| Perder la única cuenta de custodia destruye los canales que sostenga en ese momento | Baja | El esquema ya admite varias filas; pasar a dos es insertar, no migrar. |
| La constancia sigue siendo humana: ninguna API puede comprobar la titularidad | Certeza | Ya asumido en el diseño actual; esta propuesta no lo cambia. |
| El comprador declara un identificador con un error de tipeo | Media | La constancia de entrega congela el identificador y exige atestiguar que quedó como propietario principal: un destino equivocado no se puede firmar. |

## Plan de reversión

Cada pieza es aditiva y nullable, así que revertir es `git revert` del código más una migración inversa que borra tres columnas y una tabla. Ninguna fila existente se modifica, así que no hay datos que restaurar. Si se revierte con operaciones a mitad de camino, vuelven al comportamiento de hoy: `complete()` sin constancia.

## Dependencias

- Ninguna externa. No hace falta credencial de Google ni de ningún registrador: todo lo que se agrega es constancia atestiguada por una persona.
- Operativa: alguien tiene que crear la cuenta de Google real que va a figurar como identidad de custodia. El código puede escribirse antes; la semilla necesita ese dato para ser verdadera.

## Presupuesto de revisión

**Pronóstico: 900–1400 líneas autoría (dominio + persistencia + contrato + API + web + tests). Excede el presupuesto de 800.**

Se le consultó al usuario con el pronóstico a la vista y **eligió un solo PR**, aceptando explícitamente que exceda el presupuesto. Sumado a la pantalla de alta que también decidió incluir, el rango pasa a **1050–1550 líneas**.

Queda registrado como excepción aceptada, no como descuido: el cambio se entrega entero en una rama.

La división en tres que se había propuesto —A la cuenta de custodia, B la entrega, C los pasos y pantallas— queda documentada por si hiciera falta partirlo durante la implementación, pero no es el plan.

## Decisiones tomadas

Las cinco preguntas de la ronda quedaron resueltas por el usuario. Se registran acá porque cambian lo que la spec tiene que especificar.

### 1. Alta de la cuenta de custodia: pantalla de admin

Se construye el ABM completo desde el panel, no se deja en la semilla. Suma unas 150 líneas, y a cambio el alta queda resuelta para cualquier entorno —no solo el sembrado— y para cuando haya más de una cuenta. Con la semilla sola, un entorno sin sembrar se quedaba sin ninguna cuenta y, como registrar el acceso pasa a exigirla, el flujo entero quedaba trabado.

### 2. Momento de declarar el destino: tarea pendiente del comprador, bloqueante solo al final

Ni al firmar ni en custodia: **disponible desde que hay trato y exigible recién al entregar**. El comprador ve la declaración de su cuenta receptora como una tarea pendiente en el panel *Qué podés hacer*, puede resolverla cuando quiera, y solo se vuelve inevitable cuando sin ella no se puede avanzar.

Es el mismo patrón que ya usa el vendedor con sus verificaciones pendientes y con la cesión del acceso: se puede hacer temprano, conviene hacerlo temprano, y nadie te lo impone antes de tiempo. La decisión es del usuario y mejora las dos opciones que se le habían ofrecido, que forzaban un momento único.

Concretamente:

- Declarable desde `contract_pending`, cuando las dos partes ya quedaron comprometidas.
- Visible como pendiente en *Qué podés hacer* desde ese momento, sin bloquear ninguna acción.
- Desde `asset_in_custody` el texto sube de tono, porque a partir de ahí es lo que demora **su propia** entrega: para un canal, la invitación al comprador no puede salir sin la cuenta, y de esa invitación cuelgan sus siete días de espera.
- `Operation.complete()` la exige. Sin destino declarado no hay constancia de entrega posible, y sin constancia no se cierra.

### 3. Registrar acceso sin cuenta asignada: ilegal

`registerPlatformAccess` exige la cuenta de custodia. Una constancia que no dice a qué cuenta se cedió el activo es exactamente el hueco que este cambio cierra: el vendedor no sabría a quién invitar. Con una sola cuenta operativa no hay fricción en exigirlo.

### 4. Corregir un destino equivocado ya entregado: fuera de alcance

No se modela. Si el comprador declaró mal su cuenta y la entrega ya ocurrió, se resuelve fuera del sistema. Entra en el alcance de un cambio posterior si aparece el caso real.

### 5. El escrow de sitios web: cambio aparte

Confirmado. Hasta entonces el camino web sigue contradiciéndose: `WebStrategy.getTransferSteps()` no tiene paso de plataforma y `assertCanBeTransferred()` le exige acceso igual. Es un defecto anterior a este cambio y arreglarlo exige investigar el traspaso real de dominios.

## Criterios de éxito

- [ ] Un vendedor ve, en el paso de invitación, **el identificador concreto** de la cuenta que tiene que invitar.
- [ ] El paso de salir de los permisos de canal de YouTube Studio aparece antes de la invitación.
- [ ] Se puede responder por consulta qué activos sostiene una cuenta de custodia en este momento.
- [ ] `Operation.complete()` rechaza cerrar sin constancia de entrega, igual que `confirmAssetCustody()` rechaza custodia sin propiedad principal.
- [ ] El comprador ve la declaración de su cuenta receptora como tarea pendiente desde que se acuerda el precio, puede resolverla cuando quiera, y no puede cerrarse la operación sin ella.
- [ ] Un admin puede dar de alta una cuenta de custodia desde el panel, sin tocar la base a mano.
- [ ] Pasar de una cuenta de custodia a dos es insertar una fila.
- [ ] `make test` en verde y `make db-reset` aplica las migraciones sin intervención.

## Ronda de preguntas de propuesta

Las cinco preguntas que esta fase dejó abiertas están respondidas en **Decisiones tomadas**, más arriba. Se conserva la sección para que se lea el orden en que se resolvió: primero se escribió la propuesta con supuestos declarados, después el usuario los confirmó o los corrigió.

El supuesto que el usuario **corrigió**: se le ofrecieron dos momentos posibles para declarar el destino —al firmar o en custodia— y propuso un tercero mejor, que es tratarlo como tarea pendiente disponible desde el principio y exigible solo al final.
