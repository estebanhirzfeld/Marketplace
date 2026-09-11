# Asset Handover Specification

## Purpose

Define `TransferInitiation`: la declaración fechada y atribuida del vendedor de que cedió el control del activo a una cuenta de custodia nombrada. Cubre qué exige `initiateTransfer` para llegar a `transfer_in_progress`, qué registra, qué rechaza y quién puede llamarla; la copia congelada de `custodyAccountId` y su comparación con la de `CustodyVerification`; y el aviso que reclama al vendedor cuando el contrato queda firmado.

La declaración es **evidencia, no seguro**: una afirmación con fecha, hecha bajo una identidad verificada por KYC. La plataforma registra quién afirmó qué y cuándo; no certifica que sea cierto.

## Requirements

### Requirement: `initiateTransfer` exige una declaración positiva y atribuida del vendedor

`Operation.initiateTransfer(data)` MUST exigir una declaración de cesión de control y MUST rechazar cualquier llamada en la que el vendedor no afirme (`controlCeded` distinto de `true`), con un error genérico que no nombre vocabulario de YouTube: *"Para iniciar la transferencia tenés que declarar que ya cediste el control del activo."* MUST rechazar si la operación no está en `contract_signed`. En éxito MUST registrar una `TransferInitiation` y transicionar a `transfer_in_progress`. NO MUST existir una transición sin argumento ni un segundo camino a `transfer_in_progress` que saltee la declaración.

`InitiateTransferUseCase` MUST restringir la acción al vendedor de la operación (`assertIsSeller`). El comprador y un administrador MUST NOT poder iniciarla. El `declaredBy` registrado MUST ser el id de ese vendedor; NO MUST deducirse aguas abajo ni aportarlo quien llama. El `declaredAt` lo MUST poner la entidad.

#### Scenario: El vendedor declara la cesión

- GIVEN una operación en `contract_signed`
- WHEN su vendedor inicia la transferencia afirmando `controlCeded = true`
- THEN la operación pasa a `transfer_in_progress`
- AND queda una `TransferInitiation` con `declaredBy` igual al vendedor y un `declaredAt` puesto por la entidad

#### Scenario: Declaración no positiva

- GIVEN una operación en `contract_signed`
- WHEN se llama a `initiateTransfer` sin afirmar la cesión (`controlCeded` ausente o `false`)
- THEN se rechaza con un error de validación
- AND la operación sigue en `contract_signed`

#### Scenario: Estado incorrecto

- GIVEN una operación en `negotiating` o `contract_pending`
- WHEN se llama a `initiateTransfer`
- THEN se rechaza con un error de estado

#### Scenario: El comprador o un admin intentan iniciarla

- GIVEN una operación en `contract_signed`
- WHEN el comprador o un administrador intentan iniciar la transferencia
- THEN se rechaza con `ForbiddenError`

### Requirement: La constancia registra quién declaró, cuándo y a qué cuenta de custodia

`TransferInitiation` MUST registrar `declaredBy`, `declaredAt`, `controlCeded` (solo se guarda `true`), `custodyAccountId?` y `notes?`. `InitiateTransferUseCase` MUST congelar `custodyAccountId` copiándolo del `platformAccess` vigente del listing al momento de la declaración. Revocar y volver a registrar el acceso del listing con otra cuenta después MUST NOT alterar una `TransferInitiation` ya emitida.

Una operación en `transfer_in_progress` MUST poder responder quién declaró, cuándo y a qué cuenta. Cuando el `platformAccess` de origen es anterior a `asset-custody-identity` y no tiene `custodyAccountId`, la constancia MUST presentar la cuenta como *"sin registrar"* y NO MUST rellenarse con un valor inventado.

#### Scenario: Constancia completa con la cuenta congelada

- GIVEN un listing cuyo `platformAccess` vigente nombra la cuenta de custodia X
- WHEN su vendedor inicia la transferencia
- THEN la `TransferInitiation` queda con `custodyAccountId` = X

#### Scenario: El listing cambia de cuenta después de la declaración

- GIVEN una operación con una `TransferInitiation` que congeló la cuenta X
- WHEN más tarde se revoca el acceso del listing y se registra de nuevo apuntando a la cuenta Y
- THEN la `TransferInitiation` sigue registrando la cuenta X

#### Scenario: Acceso previo sin cuenta asignada

- GIVEN un listing cuyo `platformAccess` se registró antes de `asset-custody-identity` y no tiene `custodyAccountId`
- WHEN su vendedor inicia la transferencia
- THEN la transferencia se concreta
- AND la constancia informa la cuenta de custodia como *"sin registrar"*

### Requirement: Las dos copias congeladas de la cuenta pueden compararse y una discrepancia es detectable

Como `TransferInitiation.custodyAccountId` y `CustodyVerification.custodyAccountId` son copias congeladas sobre la misma operación, el sistema MUST permitir compararlas. Cuando difieren, el acceso del listing se volvió a registrar entre la declaración del vendedor y la confirmación de custodia del administrador; esa divergencia MUST ser detectable en vez de quedar sin registrar. La divergencia por sí sola MUST NOT bloquear `confirmAssetCustody`. Cuando alguna de las dos copias es *"sin registrar"*, NO MUST afirmarse ninguna divergencia.

#### Scenario: Las dos cuentas coinciden

- GIVEN una operación cuya `TransferInitiation` y cuya `CustodyVerification` registran la cuenta X
- WHEN se comparan las dos copias
- THEN coinciden y no se marca ninguna anomalía

#### Scenario: Las dos cuentas difieren

- GIVEN una operación cuya `TransferInitiation` registró la cuenta X y cuya `CustodyVerification` registró la cuenta Y
- WHEN se revisa la operación
- THEN la divergencia entre la cuenta declarada y la verificada queda visible

#### Scenario: Una copia sin registrar

- GIVEN una operación cuya `TransferInitiation` tiene la cuenta *"sin registrar"* y cuya `CustodyVerification` registró la cuenta X
- WHEN se comparan las dos copias
- THEN no se afirma ninguna divergencia

### Requirement: Al firmarse el contrato se avisa a cada parte por separado

`NegotiationNotifier.contractSigned()` MUST emitir un tipo de aviso por parte en vez de un único tipo compartido. El comprador MUST seguir recibiendo `contrato_firmado`. El vendedor MUST recibir un tipo nuevo, `cesion_pendiente`, que le dice que le toca ceder el control del activo y declararlo desde la operación. El vendedor MUST NOT recibir `contrato_firmado`. El comprador MUST NOT recibir `cesion_pendiente`.

`cesion_pendiente` MUST entrar en `NotificationType` (dominio y Prisma) y en `NotificationTypeDto` mediante una migración aditiva (`ALTER TYPE ... ADD VALUE`) escrita en este mismo cambio, de modo que `make db-reset` produzca el enum completo sin intervención y ninguna migración recree un enum. El aviso al vendedor MUST enviarse aunque su estrategia de activo no enumere ningún paso posterior a la firma.

#### Scenario: El vendedor recibe el aviso nuevo

- GIVEN una operación cuyo contrato tripartito alcanza la firma completa
- WHEN el contrato queda firmado
- THEN el vendedor recibe un aviso `cesion_pendiente`
- AND el vendedor no recibe `contrato_firmado`

#### Scenario: El comprador conserva su aviso

- GIVEN la misma operación
- WHEN el contrato queda firmado
- THEN el comprador recibe `contrato_firmado`
- AND el comprador no recibe `cesion_pendiente`

#### Scenario: Vendedor de un sitio web sin paso enumerado

- GIVEN una operación sobre un listing web cuya estrategia no enumera ningún paso de vendedor posterior a la firma
- WHEN el contrato queda firmado
- THEN el vendedor recibe igual el aviso `cesion_pendiente`

#### Scenario: El enum queda completo tras un reset

- GIVEN una base de datos limpia
- WHEN se corre `make db-reset`
- THEN `cesion_pendiente` existe en el enum `NotificationType` sin intervención manual
- AND ninguna migración recrea un enum

### Requirement: `custodia_pendiente` sigue disparando una sola vez, después de la declaración

El aviso `custodia_pendiente` a los administradores MUST seguir disparando exactamente una vez, desde `InitiateTransferUseCase`, después de registrada la declaración —es decir, al entrar en `transfer_in_progress`—. MUST NOT dispararse mientras la operación está en `contract_signed` y la plataforma está esperando al vendedor.

#### Scenario: Dispara tras la declaración

- GIVEN una operación en `contract_signed`
- WHEN el vendedor inicia la transferencia
- THEN los administradores reciben exactamente un aviso `custodia_pendiente`

#### Scenario: No dispara mientras se espera al vendedor

- GIVEN una operación en `contract_signed` sin declaración registrada
- WHEN el contrato queda firmado y se envían sus avisos
- THEN no se emite ningún aviso `custodia_pendiente`

### Requirement: Las invariantes del escrow que este cambio no altera

El orden asset-first del escrow MUST permanecer intacto: `contract_signed → transfer_in_progress → asset_in_custody → payment_received → completed`, con la custodia antes que el pago. `confirmAssetCustody()` MUST seguir guardando en `transfer_in_progress` y MUST seguir rechazando la custodia sin `isPrimaryOwner: true` atestiguado por un administrador; la `TransferInitiation` del vendedor no la reemplaza. La comisión 5%/5% y el carácter manual de cada constancia MUST permanecer sin cambios.

#### Scenario: La custodia sigue exigiendo propiedad principal

- GIVEN una operación en `transfer_in_progress` con una `TransferInitiation` registrada
- WHEN un administrador confirma la custodia con `isPrimaryOwner: false`
- THEN se rechaza con un error de validación

#### Scenario: El pago sigue después de la custodia

- GIVEN una operación en `transfer_in_progress`, con el activo todavía fuera de custodia
- WHEN se intenta confirmar el pago del comprador
- THEN se rechaza porque el activo no está en custodia

#### Scenario: La declaración no cierra el paso de custodia

- GIVEN una operación en `transfer_in_progress` con `controlCeded: true` registrado
- WHEN se lee la operación
- THEN sigue en `transfer_in_progress` y la confirmación de custodia sigue pendiente

## Notes

- Corrección documental fuera de comportamiento: `CLAUDE.md` deja de listar `payment_pending` como "Known gap" (ya removido del código). No especifica ninguna conducta del sistema.
