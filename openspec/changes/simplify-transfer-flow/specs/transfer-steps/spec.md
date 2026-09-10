# Transfer Steps — Delta (simplify-transfer-flow)

Modifica la capacidad `transfer-steps` en un solo eje: **cuándo y dónde se le muestra al vendedor su paso posterior a la firma**. La parametrización de `getTransferSteps` por contexto y el paso de opt-out de YouTube Studio, definidos en `asset-custody-identity`, no se tocan.

## ADDED Requirements

### Requirement: El paso posterior a la firma es visible después de registrado el acceso de la plataforma

El paso de vendedor marcado `afterPlatformStarts` (ceder el control: promoción a propietario principal en YouTube, o lo que enumere la estrategia) MUST seguir visible en la pantalla del activo **después** de registrado el `platformAccess`, no solo antes. Esto cierra el criterio que `platform-access-role` fijó y no cumplió (`openspec/changes/platform-access-role/proposal.md:156`): el paso existe pero se desvanecía al registrarse el acceso.

#### Scenario: El paso sigue visible con el acceso ya registrado

- GIVEN un listing cuyo `platformAccess` ya está registrado y cuyo contrato está firmado
- WHEN el vendedor abre la pantalla del activo
- THEN ve el paso posterior a la firma de ceder el control

#### Scenario: El paso sigue visible como anticipo antes del acceso

- GIVEN un listing sin `platformAccess` registrado
- WHEN el vendedor abre la pantalla del activo
- THEN ve el paso posterior a la firma presentado como un paso futuro

### Requirement: En `contract_signed` la pantalla de la operación muestra el paso concreto del vendedor

En `contract_signed`, la pantalla de la operación MUST mostrarle al vendedor el paso de cesión concreto que exige su tipo de activo, tomado de `Listing.handoverSteps()` —la misma fuente que la pantalla del activo—, como texto imperativo junto a la casilla que tiene que marcar. `queEsperar()` para el vendedor en `contract_signed` MUST NOT decir que la plataforma no necesita nada de él; MUST enunciar que ceder el control es su paso pendiente. `queEsperar()` para el actor plataforma en `contract_signed` MUST enunciar que se está esperando al vendedor.

#### Scenario: El vendedor ve su paso, no un mensaje de que no se necesita nada

- GIVEN una operación de YouTube en `contract_signed`
- WHEN su vendedor abre la pantalla de la operación
- THEN ve el paso concreto de promoción a propietario principal
- AND no lee que la plataforma no necesita nada de él

#### Scenario: La plataforma ve que se espera al vendedor

- GIVEN una operación en `contract_signed`
- WHEN un administrador abre la pantalla de la operación
- THEN el texto enuncia que la plataforma está esperando que el vendedor ceda el control y lo declare

### Requirement: El formulario de declaración sobrevive una lista de pasos vacía

Cuando `Listing.handoverSteps()` no devuelve ningún paso posterior a la firma —el caso de un listing web, porque `WebStrategy` no tiene ningún paso con `requiredActor: 'platform'`—, el formulario de declaración MUST renderizarse igual y ser enviable: la frase de instrucción genérica, la casilla `controlCeded` y un envío que funciona. Una lista vacía MUST NOT ocultar el formulario, bloquear el envío ni filtrar vocabulario de YouTube.

#### Scenario: Formulario web con lista de instrucciones vacía

- GIVEN una operación sobre un listing web en `contract_signed` cuya estrategia no produce ningún paso posterior a la firma
- WHEN el vendedor abre el formulario de declaración
- THEN se muestra la instrucción genérica y la casilla `controlCeded`
- AND al marcar la casilla y enviar, la transferencia se inicia

#### Scenario: Sin vocabulario de YouTube en el camino web

- GIVEN ese mismo formulario
- WHEN el vendedor lo lee
- THEN no aparece redacción específica de YouTube ("propietario principal", "Cuenta de Marca")

### Requirement: Ningún texto presenta a la plataforma como protagonista antes de que el vendedor actúe

Los textos de presentación de `contract_signed` y `transfer_in_progress` MUST NOT describir a la plataforma como la parte que actúa en un momento en que el vendedor todavía no cedió el control. En `transfer_in_progress` el texto MUST reflejar que el vendedor declaró la cesión y que la plataforma verifica y toma la custodia.

#### Scenario: El texto de `contract_signed` atribuye la acción al vendedor

- GIVEN una operación en `contract_signed`
- WHEN cualquiera de las partes ve el texto de su estado
- THEN el texto atribuye el paso pendiente al vendedor, no a la plataforma

#### Scenario: El texto de `transfer_in_progress` refleja la verificación

- GIVEN una operación en `transfer_in_progress`
- WHEN cualquiera de las partes ve el texto de su estado
- THEN el texto dice que el vendedor declaró la cesión y que la plataforma la verifica

### Requirement: El formulario de declaración aparece en `/sistema`

El componente de formulario de declaración de cesión MUST estar catalogado en la página de sistema de diseño `/sistema`.

#### Scenario: El componente figura en el catálogo

- GIVEN la página `/sistema`
- WHEN se la visita
- THEN el componente del formulario de declaración de cesión aparece listado
