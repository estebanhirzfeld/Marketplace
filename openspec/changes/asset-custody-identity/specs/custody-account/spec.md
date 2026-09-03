# Custody Account Specification

## Purpose

Define `CustodyAccount`: la identidad real (cuenta de Google, cuenta de registrador) que sostiene uno o más activos en custodia de la plataforma. Cubre su ciclo de vida (alta, edición, desactivación), la consulta de qué activos sostiene en este momento, y su vínculo obligatorio con la constancia de acceso del listing (`PlatformAccessRecord`) y con `CustodyVerification`.

## Requirements

### Requirement: Alta de una cuenta de custodia

Un administrador MUST poder crear una `CustodyAccount` con `label`, `identifier`, `assetType` (un valor de `AssetType`) e `isActive`. Una cuenta nueva MUST nacer activa. La operación MUST ser exclusiva de un actor con rol ADMIN. Una misma cuenta MUST poder sostener varios activos a la vez.

#### Scenario: Un admin da de alta una cuenta
- GIVEN un actor con rol ADMIN
- WHEN crea una cuenta con label "Custodia YouTube 1", identifier "custodia1@gmail.com" y assetType youtube
- THEN la cuenta queda persistida con isActive = true

#### Scenario: Identifier vacío
- GIVEN un actor ADMIN
- WHEN intenta crear una cuenta sin identifier
- THEN se rechaza con un error de validación y no se persiste nada

#### Scenario: assetType ausente o no reconocido
- GIVEN un actor ADMIN
- WHEN intenta crear una cuenta con un assetType que no pertenece a `AssetType`
- THEN se rechaza con un error de validación

#### Scenario: Actor sin rol de administrador
- GIVEN un actor con rol BUYER o SELLER
- WHEN intenta crear una cuenta de custodia
- THEN se rechaza con ForbiddenError

### Requirement: Edición de una cuenta de custodia

Un administrador MUST poder modificar `label` e `identifier` de una cuenta existente. El `assetType` MUST NOT poder cambiarse mientras la cuenta sostenga al menos un activo. Editar el `identifier` MUST NOT alterar ningún identificador ya congelado en una constancia emitida.

#### Scenario: Un admin corrige el label
- GIVEN una cuenta existente y un actor ADMIN
- WHEN cambia el label
- THEN la cuenta persiste con el nuevo label

#### Scenario: Cambiar el assetType de una cuenta que sostiene activos
- GIVEN una cuenta cuyo identificador figura en el `platformAccess` vigente de un listing
- WHEN un admin intenta cambiar su assetType
- THEN se rechaza con un error de estado

#### Scenario: Actor no administrador
- GIVEN un actor BUYER o SELLER
- WHEN intenta editar una cuenta
- THEN se rechaza con ForbiddenError

### Requirement: Desactivación de una cuenta de custodia

Un administrador MUST poder desactivar (`isActive = false`) y reactivar una cuenta. Una cuenta MUST NOT eliminarse: las constancias que la referencian tienen que seguir resolviéndose. Una cuenta inactiva MUST NOT poder asignarse en un nuevo `registerPlatformAccess`. Desactivar una cuenta que todavía sostiene activos MUST estar permitido; la consulta de activos sostenidos MUST seguir devolviéndolos.

#### Scenario: Desactivar una cuenta sin activos
- GIVEN una cuenta activa que no sostiene ningún activo
- WHEN un admin la desactiva
- THEN la cuenta persiste con isActive = false

#### Scenario: Desactivar una cuenta que sostiene activos
- GIVEN una cuenta activa referenciada por el `platformAccess` de dos listings
- WHEN un admin la desactiva
- THEN la cuenta queda inactiva
- AND la consulta de activos sostenidos sigue devolviendo esos dos listings

#### Scenario: Asignar una cuenta inactiva a un acceso nuevo
- GIVEN una cuenta con isActive = false
- WHEN un admin registra el acceso de un listing nombrando esa cuenta
- THEN se rechaza con un error de estado

#### Scenario: Reactivar una cuenta
- GIVEN una cuenta inactiva
- WHEN un admin la reactiva
- THEN la cuenta persiste con isActive = true y vuelve a poder asignarse

### Requirement: Consulta de los activos que sostiene una cuenta

El sistema MUST poder responder qué listings tienen, en este momento, un `platformAccess` vigente cuyo `custodyAccountId` apunta a una cuenta dada. Un acceso revocado MUST dejar de contar. La consulta MUST ser exclusiva de un actor ADMIN.

#### Scenario: La cuenta sostiene varios activos
- GIVEN dos listings con acceso vigente apuntando a la cuenta X y uno apuntando a la cuenta Y
- WHEN un admin consulta los activos de la cuenta X
- THEN obtiene exactamente esos dos listings

#### Scenario: Un listing revoca el acceso
- GIVEN un listing cuyo acceso apuntaba a la cuenta X
- WHEN se revoca su `platformAccess`
- THEN deja de aparecer en la consulta de la cuenta X

#### Scenario: Actor no administrador
- GIVEN un actor BUYER o SELLER
- WHEN consulta los activos de una cuenta
- THEN se rechaza con ForbiddenError

### Requirement: El registro de acceso exige una cuenta de custodia compatible

`registerPlatformAccess` MUST exigir el identificador de una `CustodyAccount`. Registrar acceso sin nombrar una cuenta MUST rechazarse. La cuenta MUST estar activa y su `assetType` MUST coincidir con el del activo del listing. La constancia resultante (`PlatformAccessRecord`) MUST guardar `custodyAccountId`.

#### Scenario: Registro con una cuenta activa y compatible
- GIVEN un listing de un canal de YouTube y una cuenta de custodia activa de assetType youtube
- WHEN un admin registra el acceso nombrando esa cuenta
- THEN la constancia queda con `custodyAccountId` apuntando a esa cuenta

#### Scenario: Registro sin nombrar cuenta
- GIVEN un listing sin cuenta de custodia indicada
- WHEN un admin intenta registrar el acceso
- THEN se rechaza con un error de validación

#### Scenario: assetType incompatible
- GIVEN un listing de un canal de YouTube y una cuenta de custodia de assetType web
- WHEN un admin registra el acceso nombrando esa cuenta
- THEN se rechaza con un error de estado

#### Scenario: Cuenta inactiva
- GIVEN una cuenta de custodia desactivada
- WHEN un admin registra el acceso de un listing nombrando esa cuenta
- THEN se rechaza con un error de estado

### Requirement: `CustodyVerification` congela la cuenta de custodia

Al confirmar la custodia, `CustodyVerification` MUST guardar `custodyAccountId` copiado del `platformAccess` vigente del listing. Revocar y volver a registrar el acceso con otra cuenta después MUST NOT alterar el `custodyAccountId` de una `CustodyVerification` ya emitida.

#### Scenario: La constancia de custodia registra la cuenta de origen
- GIVEN una operación en transfer_in_progress cuyo listing tiene acceso vigente apuntando a la cuenta X
- WHEN un admin confirma la custodia
- THEN la `CustodyVerification` queda con `custodyAccountId` = X

#### Scenario: El listing cambia de cuenta después de la custodia
- GIVEN una operación con `CustodyVerification` que registró la cuenta X
- WHEN más tarde se revoca el acceso y se registra de nuevo apuntando a la cuenta Y
- THEN la `CustodyVerification` de la operación sigue con `custodyAccountId` = X

### Requirement: Constancias de acceso previas sin cuenta asignada

Las constancias `PlatformAccessRecord` ya registradas antes de este cambio MUST seguir siendo válidas con `custodyAccountId` nulo y MUST presentarse como "cuenta sin asignar". El cambio MUST NOT reasignarlas automáticamente a ninguna cuenta. La exigencia de nombrar una cuenta MUST aplicarse solo a registros nuevos y re-registros.

#### Scenario: Un listing con acceso previo sin cuenta
- GIVEN un `platformAccess` registrado antes de este cambio, con `custodyAccountId` nulo
- WHEN un admin consulta ese listing
- THEN el acceso figura como válido y con la cuenta de custodia "sin asignar"

#### Scenario: Re-registrar un acceso previo
- GIVEN ese mismo listing
- WHEN un admin vuelve a registrar el acceso
- THEN se le exige nombrar una cuenta de custodia activa y compatible
