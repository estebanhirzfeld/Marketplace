# Propuesta: que la ventana de transferencia registre lo que hizo el vendedor

## Intención

`Operation.initiateTransfer()` (`packages/domain/src/entities/Operation.ts:464-469`) comprueba que
el estado sea `contract_signed` y asigna el siguiente. No recibe ningún argumento y no registra
nada. Es la única transición de la entidad que no exige constancia — al lado de
`confirmAssetCustody(data)` (`:479`), `confirmBuyerPayment(datos)` (`:568`) y `complete(data)`
(`:605`).

Así, hoy `transfer_in_progress` significa exactamente una cosa: **alguien apretó un botón.** Esa es
la frase que una comisión evaluadora va a devolver, y este cambio existe para responderla.

La ventana, sin embargo, no está vacía. El vendedor tiene trabajo real adentro —promover a la
plataforma de administrador a propietario principal en una Cuenta de Marca, entregar el código de
autorización (EPP) de un dominio— y la plataforma no puede hacerlo por él. De tener un estado para
ese trabajo sin registrar nada sobre él se siguen tres defectos:

1. **La instrucción es inalcanzable justo cuando aplica.** El paso posterior a la firma se dibuja en
   `apps/web/src/app/activos/[id]/page.tsx:466-480`, bajo el título *"Y MÁS ADELANTE, CON EL
   CONTRATO FIRMADO"*, dentro de la rama que solo se muestra mientras **no** hay acceso registrado.
   El acceso es condición previa para firmar (`SignContractUseCase.ts:60-66` →
   `Listing.assertCanBeTransferred()`), así que para cuando el contrato está firmado la instrucción
   ya desapareció.
2. **La pantalla de la operación se contradice.** `queEsperar()`
   (`apps/web/src/app/operaciones/[id]/page.tsx:77`) le dice al vendedor *"El contrato está firmado y
   ya nos cediste el acceso al activo. Ahora completamos el cambio de titularidad: no necesitamos
   nada más de vos por ahora"* — y la misma pantalla dibuja el botón que tiene que apretar, en
   `:502-508`.
3. **Nadie le avisa que le toca.** El único aviso que sale al firmar es `contrato_firmado`, que va a
   las dos partes con el mismo texto pasivo: *"Las tres partes firmaron. Sigue la transferencia del
   activo."* (`apps/web/src/lib/notifications.ts:35-38`). No nombra al vendedor como responsable de
   nada. Un formulario que el vendedor nunca abre no arregla que no sepa que tiene que actuar: el
   defecto es que no se entera, y la corrección de la pantalla sola no lo toca.

Los tres son el mismo criterio de aceptación que `platform-access-role` se fijó y no cumplió
(`openspec/changes/platform-access-role/proposal.md:156`: *"Existe un paso posterior, visible, donde
el vendedor nos promueve — y aparece recién cuando hay contrato firmado"*).

**El éxito se ve así**: a `transfer_in_progress` solo se llega por una declaración del vendedor,
fechada y atribuida, de que cedió el control del activo y a qué cuenta de custodia. El estado deja
de ser un artefacto de la interfaz y pasa a ser un hecho sobre el mundo — y el vendedor se entera de
que le toca, sin depender de que se le ocurra entrar a mirar.

## Alcance

### Dentro

- `TransferInitiation`: la constancia de cesión de control, exigida por `initiateTransfer(data)` y
  guardada en la operación.
- `InitiateTransferUseCase` congela el identificador de la cuenta de custodia desde el
  `platformAccess` vigente del listing, y registra quién declaró.
- Una columna Json nullable aditiva, `operations.transferInitiation`, con su mapper y su DTO.
- **Aviso al vendedor al quedar firmado el contrato**: un tipo nuevo de `NotificationType` que le
  dice que le toca ceder el control. Reemplaza a `contrato_firmado` para el vendedor; el comprador
  lo sigue recibiendo. Migración aditiva de enum.
- **El tablero de la plataforma distingue a quién se está esperando**: `contract_signed` deja de
  confundirse con las etapas que esperan a la plataforma y pasa a mostrarse como una espera al
  vendedor.
- Web: el botón se convierte en un formulario de declaración que lleva la instrucción posterior a la
  firma; `queEsperar()` corregido para `contract_signed`; textos de presentación de
  `transfer_in_progress` corregidos; el bloque de pasos posteriores sacado de la rama de
  "todavía-sin-acceso" en la pantalla del activo; el componente nuevo reflejado en `/sistema`.
- Borrar la frase obsoleta de `payment_pending` en la sección "Known gap" de `CLAUDE.md:80`.

### Fuera

- **Renombrar el valor `transfer_in_progress` del enum.** Se rechaza más abajo, con su costo.
- **La contradicción del escrow de sitios web** — `WebStrategy.getTransferSteps()` no tiene ningún
  paso de la plataforma mientras `assertCanBeTransferred()` exige `platformAccess` para todo listing.
  Defecto anterior, ya apartado como `web-escrow-transfer-steps` por las dos propuestas hermanas.
  Este cambio no puede suponer un traspaso con forma de YouTube, pero tampoco arregla el camino web.
- **Verificar la declaración.** Ninguna API expone la titularidad de un canal ni la custodia de un
  dominio. La plataforma registra la afirmación; no la certifica. Cualquier otra cosa la movería de
  intermediaria a garante.
- Rellenar `transferInitiation` en las filas que ya están en `transfer_in_progress`.
- Comisión 5%/5%, orden asset-first del escrow, y el carácter manual de cada constancia.

## Capabilities

> Contrato con la fase de specs.

### New Capabilities

- `asset-handover`: la declaración del vendedor de haber cedido el control del activo a una cuenta de
  custodia nombrada, su contenido probatorio, la transición que habilita, y el aviso que la reclama.

### Modified Capabilities

- `transfer-steps`: cuándo y dónde se muestra el paso del vendedor posterior a la firma.
- `platform-dashboard`: la distinción entre esperar a la plataforma y esperar al vendedor.

Dos escenarios de los cambios hermanos necesitan reescritura; ver **Dependencias**. Ningún
requirement queda invalidado.

## Enfoque

### 1. Opción B — conservar el estado y volver la transición portadora de constancia

Es la recomendación de la exploración, y se comparte. El argumento, dicho como corresponde que lo
escuche una comisión:

**Borrar el estado no responde la crítica.** "Este estado significa que alguien apretó un botón"
admite dos respuestas: sacar el estado, o hacer que apretarlo signifique algo. Sacarlo no saca el
acto — el vendedor igual tiene que promovernos, ese acto igual tiene consecuencias, y igual no deja
registro. La crítica simplemente se mudaría: `asset_in_custody` pasaría a alcanzarse desde
`contract_signed` con el trabajo del vendedor ocurrido invisiblemente en el medio.

**El estado es lo único que distingue dos situaciones genuinamente distintas.** `contract_signed` =
el vendedor todavía no actuó. `transfer_in_progress` = el vendedor dice que actuó y la plataforma
tiene que verificar. Esa distinción es sobre la que tría el panel de admin
(`GetPlatformDashboardUseCase.ts:67-71`) y de la que avisa `custodyNeeded`
(`InitiateTransferUseCase.ts:29`). Hoy es una señal débil porque no está registrada — pero es la
señal correcta, y la opción B la fortalece en vez de descartarla.

**El aviso ya está en el lugar correcto, y solo bajo B se queda ahí.** Bajo la opción A (quitar el
estado), `custodyNeeded` tiene que mudarse a `SignContractUseCase`, donde dispara una alerta a los
administradores mientras la plataforma en realidad está esperando al *vendedor* y no puede hacer
nada. Es una mentira peor que la que se está corrigiendo. Bajo B el aviso conserva su significado
actual y correcto: el vendedor declaró, así que ahora nos toca a nosotros.

**Completa un patrón ya establecido en el proyecto.** `docs/fase-7-contratos-y-constancias.md:15`
planteó el trabajo como convertir *"actos con consecuencias y sin constancia"* en constancias, y
produjo `OwnershipVerification`, `CustodyVerification` y `DeliveryVerification`. `initiateTransfer`
es el último que queda afuera. La simetría acá no es estética: es el argumento de que el producto de
la plataforma es documentación, aplicado sin excepciones.

**La objeción más fuerte, respondida.** *"Agregaron una declaración que nadie verifica. ¿No sigue
siendo un botón, con una casilla al lado?"* Dos partes:

- Es **evidencia, no seguro** — el modelo de seguridad declarado de la plataforma. Una afirmación
  fechada, hecha por una identidad verificada por KYC y adosada a un contrato firmado, es
  exactamente el material que la plataforma le entrega a la parte perjudicada en una disputa. No
  cambia quién asume el riesgo; cambia qué se puede probar después.
- **Sí se comprueba**, aguas abajo y por otra parte. `confirmAssetCustody()` ya rechaza la custodia
  sin `isPrimaryOwner: true`, atestiguado por un administrador que efectivamente miró
  (`Operation.ts:488-492`). Hoy esa comprobación del administrador flota sobre nada. Después de este
  cambio hay una afirmación y una comprobación independiente de esa afirmación, y una discrepancia
  entre las dos queda visible en vez de quedar sin registrar.

**Alternativas rechazadas**, con el costo que decidió cada una:

| Opción | Por qué se rechaza |
|---|---|
| **A — quitar el estado** | El trabajo real del vendedor se queda sin lugar; `custodyNeeded` tiene que mudarse a `SignContractUseCase` y dispara mientras la plataforma no puede hacer nada; el panel de admin pierde su distinción de triage; migración de recreación de enum que aborta ante cualquier fila viva. Cambia una señal débil por ninguna. |
| **C — colapsar en `contract_signed` y seguir el avance del vendedor en `Listing`** | Parte una sola preocupación entre dos agregados. `platformAccess` es un hecho del listing, pero esta promoción la fecha el contrato firmado de una operación *concreta*, y un listing puede arrastrar operaciones canceladas. Cuesta la misma recreación de enum más un cambio en `PlatformAccessRecord`. |
| **D — arreglar solo la interfaz** | Lo más barato, y deja la crítica en pie textualmente. La corrección de interfaz se pliega dentro de B en vez de ser el cambio entero. |

### 2. La constancia: rica, no mínima

```ts
/**
 * Constancia de que el vendedor cedió el control del activo.
 *
 * Es la única transición del escrow que la plataforma no puede ejecutar ni
 * verificar en el momento: la hace el vendedor en la plataforma del activo.
 * Por eso lo que queda registrado es su declaración —quién, cuándo, a qué
 * cuenta— y no una comprobación nuestra.
 */
export interface TransferInitiation {
    declaredBy: UniqueEntityID;
    declaredAt: Date;
    /** El vendedor afirma haber cedido el control del activo. */
    controlCeded: boolean;
    /** Copia congelada de la cuenta de custodia nombrada al ceder. */
    custodyAccountId?: UniqueEntityID;
    notes?: string;
}

export type TransferInitiationInput = Omit<TransferInitiation, 'declaredAt'>;
```

**Por qué la forma rica y no un `acknowledgedPromotion: boolean` pelado.** `CustodyVerification`
congela `custodyAccountId` (`Operation.ts:63-70`) por un motivo preciso: el listing puede revocar y
volver a registrar su acceso con otra cuenta más tarde, y una constancia que no se puede reproducir
no es una constancia. La declaración del vendedor tiene exactamente la misma exposición. "Cedí el
control" sin "a quién" repite el defecto que `asset-custody-identity` existió para cerrar — el
vendedor sin saber a quién invitar, el registro sin decir quién recibió. Repetirlo dentro de la
constancia construida encima de ese cambio sería incoherente.

Hay un segundo beneficio. Con la cuenta congelada en los dos extremos,
`TransferInitiation.custodyAccountId` y `CustodyVerification.custodyAccountId` se pueden comparar.
Deberían coincidir; si no coinciden, el acceso se volvió a registrar entre la declaración y la
confirmación de custodia, y esa es una anomalía que conviene poder detectar. Un booleano no se puede
comparar contra nada.

**El costo, dicho con todas las letras.** Hoy `InitiateTransferUseCase` carga solo la operación.
Congelar la cuenta lo obliga a cargar también el listing — una segunda dependencia de repositorio y
un modo de falla nuevo. El modo de falla es demostrablemente inalcanzable:
`assertCanBeTransferred()` vuelve al `platformAccess` vigente condición previa de la firma, así que
para `contract_signed` el listing ya tiene uno. Lo que puede faltar es `custodyAccountId` *dentro*
de él, en constancias de acceso escritas antes de que aterrizara `asset-custody-identity`. Queda
opcional y se muestra como *"cuenta sin registrar"* — el mismo tratamiento que ya recibieron
`heldRole` y `custodyAccountId`, y por el mismo motivo: afirmar una cuenta que nadie nombró sería
inventar una constancia.

**`declaredBy` en vez de deducir el vendedor.** El use case ya llama a `assertIsSeller(actor.id)` y
descarta el id. Registrarlo vuelve la constancia autosuficiente y simétrica con el `verifiedBy` de
las otras dos.

**`controlCeded: false` se rechaza, no se guarda.** En espejo con `confirmAssetCustody` rechazando
`isPrimaryOwner: false`: una declaración negativa no es una transición, es un vendedor que todavía
no terminó. El estado tiene que seguir significando lo que dice significar. La invariante queda
exacta: `transfer_in_progress` vale si y solo si existe en la operación una declaración de cesión de
control positiva, atribuida y fechada.

El campo, entonces, solo puede valer `true` — igual que `isPrimaryOwner` en la constancia de
custodia. La información no es el booleano; es que una persona nombrada afirmó una proposición
concreta en un momento concreto. Explicitar la proposición en el registro es lo que convierte el
control de la interfaz de un botón en un acto de afirmación.

### 3. Una redacción que sirva para los dos tipos de activo — restricción de corrección, no de estilo

`WebStrategy` no tiene ninguna noción de propietario principal. Sus pasos de vendedor son eximir el
dominio del bloqueo de 60 días de la ICANN y entregar el código de autorización (EPP)
(`WebStrategy.ts:112-118`). Quien vende un sitio web cede el control cediendo el dominio, no
promoviendo a nadie.

Por eso la declaración se enuncia de forma genérica en todos los niveles donde habla el dominio:

- El campo es `controlCeded`, no `acknowledgedPromotion`.
- El error del dominio, si el vendedor envía sin afirmar, es genérico: *"Para iniciar la
  transferencia tenés que declarar que ya cediste el control del activo."*
- La instrucción **específica** no se escribe en la entidad. Viene de la estrategia, vía
  `Listing.handoverSteps()`, que ya marca con `afterPlatformStarts` los pasos de vendedor
  posteriores a la entrada de la plataforma (`Listing.ts:289-297`). YouTube aporta *"promovenos a
  propietario principal"* (`YouTubeStrategy.ts:298-300`); web aporta lo que digan sus pasos. Una sola
  fuente de verdad, y ningún vocabulario de YouTube filtrándose a código compartido.

Una advertencia honesta para la fase de spec: para un listing web, `handoverSteps()` hoy no produce
**ningún** paso posterior a la firma, porque `WebStrategy` no tiene ningún paso con
`requiredActor: 'platform'` (0 pasos, contra 4 en `YouTubeStrategy`), de modo que
`entramosNosotros === -1` en `Listing.ts:295` y todos los pasos caen en el tramo "ahora". El
formulario de declaración tiene que **ser correcto** con una lista de instrucciones vacía —cayendo a
la frase genérica, con su casilla y su envío funcionando igual— y no solamente "no romperse". Es
consecuencia del defecto web que queda fuera de alcance, y el formulario tiene que sobrevivirlo en
vez de taparlo.

### 4. Conservar el valor del enum; corregir solo lo que muestra

**Recomendación: conservar `transfer_in_progress`.** El identificador nunca fue la mentira.

Después de este cambio el significado del estado es: el vendedor cedió el control y la plataforma
todavía no confirmó la custodia. La transferencia está genuinamente en curso. Lo que confunde son
los textos, que ponen a la *plataforma* como protagonista en un momento en que el vendedor todavía
no había actuado:

| Dónde | Hoy | Propuesto |
|---|---|---|
| Badge en `ui.tsx:58` | `TRANSFIRIENDO` | `VERIFICANDO` |
| Título en `Timeline.tsx:21` | `Transferencia` | `Verificación` |
| Texto en `Timeline.tsx:21` | *"La plataforma completa el cambio de titularidad sobre el activo cedido."* | *"El vendedor declaró haber cedido el control. La plataforma verifica y toma la custodia."* |

Vale notar que, después del cambio, "la plataforma está haciendo algo" pasa a ser **cierto** de este
estado: el vendedor actúa *antes* de entrar, y lo que queda adentro es nuestra verificación. El
texto se corrige volviendo real la condición de entrada, no suavizando las palabras.

**Rechazado: renombrar a algo como `handover_declared`.** Sería marginalmente más preciso y cuesta
una recreación de enum que toca el enum de Prisma, la unión `OperationStatus`, la unión de
`api-contract`, la máquina de xstate, seis recorredores de estados en los tests y todas las
pantallas — más el riesgo específico que este repositorio ya conoce: una migración que elimina
valores de enum **aborta** si alguna fila los sostiene, y el despliegue vivo en
`traspaso.forzalabs.online` puede tener una de un recorrido manual. Una semilla fresca no tiene
ninguna; un recorrido manual no es una semilla fresca. Pagar una migración que puede fallar en
producción para comprar un renombre que ninguna comisión va a notar es el intercambio equivocado.

### 5. El aviso al vendedor: un tipo nuevo que reemplaza a `contrato_firmado` para esa parte

Hoy `NegotiationNotifier.contractSigned()` manda `contrato_firmado` a las dos partes con
`toBothParties` (`NegotiationNotifier.ts:102-105`), y el cliente redacta el texto a partir del tipo
(`notifications.ts:35-38`): *"Las tres partes firmaron. Sigue la transferencia del activo."* Para el
comprador es exacto —no le toca nada, y el escrow es a propósito así—. Para el vendedor es
justamente la misma mentira que dice `queEsperar()`: enuncia en voz pasiva un paso que es suyo.

**Propuesta**: `contractSigned()` deja de mandar un solo tipo a las dos partes y manda uno por
parte. El comprador conserva `contrato_firmado`. El vendedor recibe un tipo nuevo,
`cesion_pendiente`, con su propio texto:

> **title**: `Te toca ceder el control del activo`
> **cuerpo**: `El contrato quedó firmado. Cedenos el control del activo y declaralo desde la
> operación: recién ahí lo verificamos y lo tomamos en custodia.`

**Rechazado: agregar `cesion_pendiente` *además* de `contrato_firmado`.** Le caerían dos avisos al
vendedor en el mismo instante, uno diciendo "firmado" y otro diciendo "te toca", y el primero
seguiría enunciando su paso en voz pasiva. El ruido no es el problema principal: el problema es que
dejaría en pie el texto que causó el defecto.

**Rechazado: hacer `contrato_firmado` sensible al rol.** El mecanismo no lo admite sin retocarlo:
el texto no viaja a propósito —`NotificationDto` no lleva rol y el diccionario de
`notifications.ts` se indexa solo por tipo (`api-contract/src/index.ts:811-814` explica por qué)—.
Meter el rol para este caso rompería una decisión de diseño sana para resolver un caso que un tipo
nuevo resuelve sin tocarla.

**Migración de enum, aditiva.** `cesion_pendiente` entra en `NotificationType` (dominio y Prisma) y
en `NotificationTypeDto` (`api-contract/src/index.ts:795-809`). Requiere migración: hay precedente
directo y explícito en `migrations/20260901120000_repair_platform_notification_types`, que existe
**porque** una fase anterior empujó cuatro valores de enum con `db:push` sin migración y `make
db-reset` quedaba produciendo un enum incompleto. No se repite acá: la migración se escribe en el
mismo cambio, con la forma que ya usa ese precedente —`ALTER TYPE "NotificationType" ADD VALUE
'cesion_pendiente'`—, que es aditiva y no aborta ante ninguna fila. El valor nuevo no se usa dentro
de la misma migración, así que la restricción de PostgreSQL sobre usar un valor recién agregado en
la misma transacción no se toca.

**¿Y si el vendedor es de un sitio web y su estrategia no tiene ningún paso posterior a la firma?**
Se le avisa igual. El asunto del aviso no es *"la estrategia enumera un paso para vos"* sino *"la
operación está esperando que cedas el control y lo declares"*, y eso es cierto también para web —el
vendedor tiene que entregar el código EPP o empujar el dominio—; que `WebStrategy` no lo enumere es
el defecto que queda fuera de alcance, no evidencia de que no haya nada que hacer. Condicionar el
aviso a que exista un paso codificaría ese defecto dentro de la política de avisos.

### 6. El tablero distingue a quién se está esperando

Hoy `ESPERAN_A_LA_PLATAFORMA` agrupa `transfer_in_progress`, `asset_in_custody` y `payment_received`
(`GetPlatformDashboardUseCase.ts:67-71`), y `EN_CURSO` suma `contract_pending` y `contract_signed`
(`:83-87`). `contract_signed` queda sin categoría propia: cuenta como en curso, pero el panel no
dice de quién es el turno, y `PROXIMO_PASO` (`apps/web/src/app/admin/page.tsx:20-28`) directamente no
tiene entrada para él.

Después de este cambio, `contract_signed` tiene un significado nítido —**se está esperando al
vendedor**— y merece decirse. Se agrega la lista simétrica y se expone como categoría propia:

```ts
/**
 * Las etapas donde el próximo movimiento es del vendedor y no nuestro.
 *
 * `contract_signed` espera que ceda el control del activo y lo declare. La
 * plataforma no puede destrabarlo: solo avisar.
 */
const ESPERAN_AL_VENDEDOR: OperationStatus[] = ['contract_signed'];
```

Es información nueva, no un reparto distinto de `EN_CURSO`: `contract_signed` sigue estando en
curso. El eje que se agrega es *a quién se espera*, que es lo que un panel operativo tiene que poder
responder. Ya hay precedente de esa forma en el mismo use case: `trabadasPorAcceso` (`:124-132`)
separa, dentro de `contract_pending`, las operaciones trabadas por falta de acceso — el panel ya
distingue esperas por su causa, y esto extiende el criterio en vez de inventar uno.

`PROXIMO_PASO` suma la entrada correspondiente, que no es una acción nuestra sino una espera
nombrada: `contract_signed: 'Esperando que el vendedor ceda el control y lo declare'`.

**Rechazado: mover `contract_signed` dentro de `ESPERAN_A_LA_PLATAFORMA`.** Es lo contrario de la
verdad y dispararía el mismo error que la opción A: contar como pendiente nuestra una operación que
no podemos destrabar.

### 7. Dónde vive la instrucción posterior a la firma, y qué pasa con `custodia_pendiente`

**La instrucción no se muda. Se muestra dos veces, con dos trabajos distintos, desde una sola
fuente.**

- **En la pantalla del activo** queda como *anticipo*. Mostrarla temprano es deliberado y correcto —
  el comentario de `activos/[id]/page.tsx:80-88` lo argumenta, y tiene razón: la promesa *"ahora no
  estás cediendo el control"* solo es creíble si el vendedor puede ver cuándo sí lo va a ceder. El
  defecto no es que aparezca temprano; es que el bloque vive dentro de la rama de "todavía no hay
  acceso registrado" y por lo tanto se desvanece en el momento en que empieza a aplicar. **Corrección:
  sacar el bloque `despues` de esa rama para que se dibuje en las dos.** Mínimo y fiel a la
  intención del cambio hermano.
- **En la pantalla de la operación**, en `contract_signed`, pasa a ser *imperativa* — el cuerpo del
  formulario de declaración nuevo, al lado de la casilla que el vendedor tiene que marcar.

Las dos leen los mismos datos de `handoverSteps`.

`queEsperar()` se corrige para las dos personas a las que hoy se les miente en `contract_signed`:

> **vendedor**: *"El contrato está firmado. Queda un último paso tuyo: cedernos el control del
> activo. Cuando lo hagas, declaralo acá y lo verificamos."*
>
> **plataforma**: *"El contrato está firmado. Esperamos que el vendedor nos ceda el control y lo
> declare."*

**`custodia_pendiente` se queda exactamente donde está** — disparado por `InitiateTransferUseCase`
después de la declaración (`InitiateTransferUseCase.ts:29`). Ahí, y solo ahí, es correcto: anuncia
que empezó el turno de la plataforma, y después de este cambio eso es precisamente lo que la
declaración establece. Que sea correcto bajo B e incorrecto bajo A es una de las razones por las que
gana B.

## Áreas afectadas

| Área | Impacto | Qué cambia |
|---|---|---|
| `packages/domain/src/entities/Operation.ts` | Modificado | `TransferInitiation`, `initiateTransfer(data)` con sus guardas, getter. |
| `packages/domain/src/entities/Notification.ts` | Modificado | `cesion_pendiente` en `NotificationType`. |
| `packages/domain/src/services/NegotiationNotifier.ts` | Modificado | `contractSigned()` manda un tipo por parte. |
| `packages/domain/src/use-cases/operation/InitiateTransferUseCase.ts` | Modificado | Dependencia del repositorio de listings; congela la cuenta de custodia; pasa `declaredBy`. |
| `packages/domain/src/use-cases/admin/GetPlatformDashboardUseCase.ts` | Modificado | `ESPERAN_AL_VENDEDOR` y su exposición en el tablero. |
| `packages/domain/src/machines/OperationMachine.ts` | Modificado | Solo comentario — la máquina documenta, la entidad hace cumplir. |
| `packages/db/prisma/schema.prisma` | Modificado | `operations.transferInitiation` Json nullable; `cesion_pendiente` en el enum. |
| `packages/db/prisma/migrations/` | Nuevo | Columna aditiva + `ALTER TYPE ... ADD VALUE`. |
| `packages/db/src/mappers/OperationMapper.ts` | Modificado | En los dos sentidos. |
| `packages/api-contract` | Modificado | DTO de la constancia, `NotificationTypeDto`, el tablero. |
| `apps/web` — pantalla de operación | Modificado | Formulario de declaración en lugar del botón pelado; `queEsperar()` en `contract_signed`. |
| `apps/web` — pantalla del activo | Modificado | Bloque `despues` sacado de la rama sin-acceso. |
| `apps/web` — panel de admin | Modificado | Categoría de espera al vendedor; entrada en `PROXIMO_PASO`. |
| `apps/web` — `ui.tsx`, `Timeline.tsx`, `notifications.ts`, `/sistema` | Modificado | Textos de presentación; redacción del aviso nuevo; componente nuevo catalogado. |
| `packages/domain/tests/**` | Modificado + nuevo | ~6 recorredores de estados suman un argumento; casos nuevos de guarda, aviso y tablero. |
| `CLAUDE.md` | Modificado | Borrar la frase obsoleta de `payment_pending`. |

## Impacto de migración

| Cambio | ¿Migración? |
|---|---|
| `operations.transferInitiation` (Json nullable) | **Sí** — columna nueva, aditiva. Igual que `custodyCheck` / `recipientIdentity` / `deliveryCheck`. |
| `cesion_pendiente` en `NotificationType` | **Sí** — `ALTER TYPE ... ADD VALUE`, aditiva. Precedente en `20260901120000_repair_platform_notification_types`. |
| Valores de `OperationStatus` | **No** — no se agrega ni se quita ninguno. |
| `custodyAccountId` dentro del Json | **No** — es Json. |

Todo es aditivo y nullable. Ninguna fila existente se reescribe y ninguna queda inválida. Las
operaciones que ya estén en `transfer_in_progress` —plausible en el despliegue vivo— quedan con
`transferInitiation` en nulo y se muestran como *"declaración sin registrar"*. **Sin relleno**, por
el mismo principio que ya aplicaron los dos cambios hermanos: fabricar una constancia que nadie
firmó es el defecto, no el arreglo.

Como no se elimina ningún valor de enum, el riesgo de aborto que descarta a las opciones A y C no
existe acá. `make fresh` (`db:push`) no lo nota; `make db-reset` aplica las dos migraciones sin
intervención — y esta vez la de avisos se escribe junto con el cambio, que es exactamente lo que no
pasó la vez que hizo falta el migration de reparación.

## Dependencias

Los dos cambios hermanos están **implementados pero no archivados**. Este se construye encima, no al
lado.

**Qué le debe a `asset-custody-identity`**: la entidad `CustodyAccount` y
`PlatformAccessRecord.custodyAccountId`. Sin ellos no hay identificador de cuenta que congelar, y la
forma rica de la constancia del §2 sería imposible — el booleano mínimo habría sido la única opción.
También le copia el patrón de copia congelada, textualmente.

**Qué le debe a `platform-access-role`**: el paso de promoción posterior a la firma,
`handoverSteps()` devolviendo *todos* los pasos del vendedor en vez del tramo inicial, y el corte
`afterPlatformStarts`. Además **cierra un criterio de aceptación que ese cambio dejó sin cumplir**
(`proposal.md:156`): el paso existe pero es invisible una vez registrado el acceso.

**Escenarios que hay que reescribir — ninguno queda invalidado:**

- `asset-custody-identity/specs/asset-delivery/spec.md:47-51` — *"Avanza sin la identidad
  declarada"*: el `WHEN se inicia la transferencia` ahora exige una constancia. El requirement (que
  la identidad receptora no bloquea nada antes de `complete()`) no cambia y sigue valiendo; el
  escenario subespecifica su propia precondición y tiene que decirlo.
- `asset-custody-identity/specs/custody-account/spec.md:124-127` — *"La constancia de custodia
  registra la cuenta de origen"*: sigue siendo cierto. Pero ahora hay **dos** copias congeladas de la
  cuenta sobre una misma operación, y la spec debería decir que pueden diferir legítimamente si el
  acceso se volvió a registrar en el medio, y que la divergencia es detectable.
- `asset-delivery/spec.md:33-36` no se ve afectado en el fondo; el estado que nombra sigue
  existiendo.

**Decisión de secuencia que esto crea**: el cambio que se archive primero determina dónde aterrizan
las reescrituras. Si los hermanos se archivan antes de que este llegue a su fase de spec, estas
correcciones aplican sobre `openspec/specs/`; si no, este cambio tiene que editar los archivos de
spec en vuelo de los hermanos. Conviene resolverlo antes de empezar la fase de spec y no durante.

## Riesgos

| Riesgo | Prob. | Mitigación |
|---|---|---|
| La declaración no la puede verificar ninguna API, y nunca va a poder. | Certeza | Ya es la premisa del modelo. La plataforma registra quién afirmó qué y cuándo; `confirmAssetCustody()` sigue siendo la comprobación independiente. Se enuncia como evidencia, nunca como garantía. |
| Para un listing web, `handoverSteps()` no produce ningún paso posterior a la firma, así que el formulario no tiene instrucción específica que mostrar. | Alta (existe hoy) | El formulario cae a la frase genérica y **funciona correctamente** con la lista vacía. Arreglar el hueco de fondo es `web-escrow-transfer-steps`, fuera de alcance en los tres cambios. |
| Filas vivas ya en `transfer_in_progress` sin declaración. | Media | Columna nullable, mostrada como *"declaración sin registrar"*. Sin relleno, por diseño. |
| Tres cambios sin archivar tocan `Operation.ts`, `OperationMapper.ts` y la pantalla de la operación. | Media | Este se construye encima, en secuencia, no en paralelo — la misma postura que `platform-access-role` tomó frente a `asset-custody-identity`. |
| Un valor de enum de avisos empujado sin migración, como ya pasó una vez. | Baja | La migración se escribe en el mismo cambio, y el criterio de aceptación la exige explícitamente. |
| El vendedor que marca la casilla sin haber hecho el trabajo. | Media | No se puede impedir y no se pretende. Lo que cambia es que la afirmación falsa queda atribuida, fechada, y contradicha en el registro por la verificación de custodia del administrador. Es el argumento de persuasión, aplicado acá. |

## Plan de reversión

`git revert` más una migración inversa que borra una columna. El valor de enum de avisos **no se
puede quitar** con `ALTER TYPE`: se deja en su lugar, sin emisor, que es inocuo y es lo que ya hace
el repositorio con los valores que agregó. Ninguna fila existente se modifica, así que no hay datos
que restaurar. Las operaciones a mitad de camino vuelven al comportamiento de hoy:
`initiateTransfer()` sin constancia. Las declaraciones ya escritas se pierden con la columna —
aceptable, porque revertir significa que la plataforma decidió no conservar ese registro.

## Presupuesto de revisión

**Pronóstico: 625–810 líneas.** El presupuesto de la sesión es 800, así que **el techo del rango lo
alcanza y puede excederlo.** Queda dicho acá y no absorbido en silencio.

| Bloque | Líneas |
|---|---|
| Constancia: dominio, use case, persistencia, contrato | 170–220 |
| Web: formulario, textos, `/sistema`, pantalla del activo | 180–210 |
| Aviso al vendedor: tipos, notificador, migración, redacción, tests | 60–90 |
| Tablero: `ESPERAN_AL_VENDEDOR`, DTO, panel, tests | 115–140 |
| Tests del núcleo (~6 recorredores de estados + guardas nuevas) | 100–150 |

Antes de sumar el aviso y el tablero el pronóstico era 450–600 y entraba con holgura. Los dos
agregados son los que empujan el techo contra el límite, y no son adorno: sin el aviso, el defecto
de que el vendedor no se entera de que le toca queda sin resolver.

**Costura sugerida si se decide partirlo**, ofrecida para que la decisión sea informada y no un
descubrimiento a mitad de implementación:

- **A — la constancia y la verdad en pantalla** (~450–600): `TransferInitiation`, `initiateTransfer`,
  persistencia, formulario, `queEsperar()`, textos, `/sistema`, `CLAUDE.md`. Cierra la crítica del
  botón sin significado y es autosuficiente.
- **B — que la persona que tiene que actuar se entere** (~175–230): el aviso `cesion_pendiente` con
  su migración, y el corte `ESPERAN_AL_VENDEDOR` en el tablero. Depende de A solo por vocabulario, no
  por código.

La decisión de partir o no es del usuario; esta propuesta no la toma.

## Criterios de éxito

- [ ] `initiateTransfer()` rechaza cualquier llamada que no lleve una declaración positiva de cesión
      de control, igual que `confirmAssetCustody()` rechaza la custodia sin propiedad principal.
- [ ] Una operación en `transfer_in_progress` puede responder **quién** declaró, **cuándo** y **a qué
      cuenta de custodia** — o informa explícitamente la cuenta como no registrada, para las
      constancias escritas antes de este cambio.
- [ ] Un vendedor con contrato firmado **recibe un aviso** que le dice que le toca ceder el control,
      y el comprador no recibe ese aviso.
- [ ] El vendedor deja de recibir el texto pasivo de `contrato_firmado`; el comprador lo conserva.
- [ ] El valor nuevo de `NotificationType` entra por migración escrita en este mismo cambio, y
      `make db-reset` produce el enum completo sin intervención.
- [ ] El panel de admin muestra `contract_signed` como una espera al **vendedor**, distinguible de
      las etapas que esperan a la plataforma, con su texto en `PROXIMO_PASO`.
- [ ] Un vendedor con contrato firmado ve, en la pantalla de la operación, el paso concreto que su
      tipo de activo le exige — y ya no lee que no necesitamos nada de él.
- [ ] El paso posterior a la firma sigue visible en la pantalla del activo **después** de registrado
      el acceso de la plataforma, cerrando el criterio incumplido de `platform-access-role`.
- [ ] Un vendedor de sitio web llega a la declaración sin encontrarse vocabulario de YouTube, recibe
      igual su aviso, y el formulario funciona con la lista de instrucciones vacía.
- [ ] Ningún texto presenta a la plataforma como protagonista en un momento en que el vendedor
      todavía no actuó.
- [ ] `custodia_pendiente` sigue disparando exactamente una vez, después de la declaración, y nunca
      mientras la plataforma está esperando al vendedor.
- [ ] `CLAUDE.md` ya no afirma que `payment_pending` es un hueco conocido.
- [ ] El formulario de declaración aparece en `/sistema`.
- [ ] `make test` en verde; `make db-reset` aplica las migraciones sin intervención; ninguna
      migración recrea un enum.

## Decisiones que le corresponden al usuario

Se registran acá en vez de resolverse, porque son llamadas de producto o de presentación y no
técnicas.

1. **Si el cambio se entrega entero o partido en dos.** El pronóstico alcanza el techo de 800 líneas;
   la costura sugerida está en **Presupuesto de revisión**. `asset-custody-identity` sentó el
   precedente de aceptar el exceso explícitamente y entregar en una rama; sigue siendo una elección,
   no un default.
2. **Los textos propuestos** (`VERIFICANDO`, `Verificación`, la redacción de `cesion_pendiente`, la
   entrada de `PROXIMO_PASO` y los tres bloques de copy citados en §4, §5 y §7). Son defendibles,
   pero son las palabras que lee una persona, y el usuario ya corrigió copy antes.
