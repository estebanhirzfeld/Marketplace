# Asset Delivery Specification

## Purpose

Define la identidad receptora que el comprador declara en una operación (`Operation.recipientIdentity`) y la constancia de entrega (`DeliveryVerification`), simétrica a `CustodyVerification`, que `Operation.complete()` exige para cerrar. La identidad receptora se trata como tarea pendiente del comprador: disponible temprano, exigible solo al cierre.

## Requirements

### Requirement: El comprador declara su identidad receptora

El comprador de la operación MUST poder declarar `recipientIdentity` (el identificador de la cuenta donde quiere recibir el activo) desde que la operación está en `contract_pending` y mientras siga viva. Declararla antes (`offer_sent`, `negotiating`) MUST rechazarse. Solo el comprador de esa operación puede declararla (`partyFor(actor) === 'buyer'`); el vendedor y un administrador MUST NOT. El comprador MUST poder reemplazarla mientras no exista una `DeliveryVerification`.

#### Scenario: Declaración en contract_pending
- GIVEN una operación en contract_pending
- WHEN el comprador declara su identidad receptora
- THEN queda guardada en la operación

#### Scenario: Declaración demasiado temprana
- GIVEN una operación en offer_sent o negotiating
- WHEN el comprador intenta declarar su identidad receptora
- THEN se rechaza con un error de estado

#### Scenario: Declaración en custodia
- GIVEN una operación en asset_in_custody sin identidad declarada
- WHEN el comprador declara su identidad receptora
- THEN queda guardada

#### Scenario: El vendedor o un admin intentan declararla
- GIVEN una operación en contract_signed
- WHEN el vendedor o un administrador intentan declarar la identidad receptora
- THEN se rechaza con ForbiddenError

#### Scenario: El comprador la cambia
- GIVEN una operación en transfer_in_progress con una identidad ya declarada y sin constancia de entrega
- WHEN el comprador declara una identidad distinta
- THEN reemplaza a la anterior

#### Scenario: Operación cerrada o cancelada
- GIVEN una operación cancelada o completed
- WHEN el comprador intenta declarar o cambiar la identidad receptora
- THEN se rechaza con un error de estado

### Requirement: La identidad receptora es una tarea pendiente no bloqueante

Mientras no esté declarada, el sistema MUST exponer la identidad receptora como tarea pendiente del comprador desde `contract_pending`. Esa tarea MUST NOT bloquear ninguna transición anterior a `complete()`. Desde `asset_in_custody` la tarea MUST señalarse como urgente, porque a partir de ahí demora la propia entrega del comprador. Una vez declarada, la tarea MUST desaparecer. Es el mismo patrón que las verificaciones pendientes del vendedor y los pasos de ACCESO DE LA PLATAFORMA.

#### Scenario: Avanza sin la identidad declarada
- GIVEN una operación en contract_signed sin identidad receptora
- WHEN se inicia la transferencia
- THEN la operación pasa a transfer_in_progress
- AND la tarea de declarar la identidad figura como pendiente para el comprador

#### Scenario: La urgencia escala en custodia
- GIVEN una operación en asset_in_custody sin identidad receptora
- WHEN el comprador consulta sus tareas pendientes
- THEN la tarea de declarar la identidad figura como pendiente y urgente

#### Scenario: Tarea resuelta
- GIVEN una operación con identidad receptora ya declarada
- WHEN el comprador consulta sus tareas pendientes
- THEN la tarea de declarar la identidad no figura

### Requirement: Constancia de entrega (`DeliveryVerification`)

`DeliveryVerification` MUST ser simétrica a `CustodyVerification` y registrar `verifiedBy`, `verifiedAt` (la pone la entidad), `deliveredToIdentifier` (copia congelada del identificador al que efectivamente se entregó), `isPrimaryOwner`, `accessSecured` y `notes?`. Registrarla MUST ser exclusivo de un actor ADMIN y solo MUST aceptarse con la operación en `payment_received`. Al registrarla, `deliveredToIdentifier` MUST congelarse a partir de la `recipientIdentity` vigente; cambios posteriores de la declarada MUST NOT alterarla. `isPrimaryOwner` es también lo que atestigua la segunda espera de siete días, sin necesidad de un temporizador nuevo.

#### Scenario: Registro de la constancia de entrega
- GIVEN una operación en payment_received con identidad receptora declarada
- WHEN un admin registra la entrega con isPrimaryOwner = true y accessSecured = true
- THEN la operación guarda la `DeliveryVerification` con `deliveredToIdentifier` copiado de la identidad declarada

#### Scenario: Actor no administrador
- GIVEN una operación en payment_received
- WHEN un actor BUYER o SELLER intenta registrar la entrega
- THEN se rechaza con ForbiddenError

#### Scenario: Estado incorrecto
- GIVEN una operación en asset_in_custody
- WHEN un admin intenta registrar la entrega
- THEN se rechaza con un error de estado

#### Scenario: La identidad declarada cambia después de la constancia
- GIVEN una operación con `DeliveryVerification` cuyo `deliveredToIdentifier` es "a@gmail.com"
- WHEN la `recipientIdentity` declarada se cambia a "b@gmail.com"
- THEN el `deliveredToIdentifier` de la constancia sigue siendo "a@gmail.com"

### Requirement: `complete()` exige destino y constancia de entrega

`Operation.complete()` MUST rechazar cerrar si no hay `recipientIdentity` declarada. MUST rechazar cerrar sin una `DeliveryVerification` cuyos `isPrimaryOwner` y `accessSecured` sean ambos true, igual que `confirmAssetCustody()` exige propiedad principal y accesos asegurados. Con ambas condiciones satisfechas y la operación en `payment_received`, `complete()` MUST pasar la operación a `completed` y fijar `completedAt`.

#### Scenario: Cierre completo
- GIVEN una operación en payment_received, con identidad receptora declarada y una `DeliveryVerification` con isPrimaryOwner y accessSecured en true
- WHEN se completa la operación
- THEN pasa a completed y se fija completedAt

#### Scenario: Cierre sin identidad receptora
- GIVEN una operación en payment_received sin `recipientIdentity`
- WHEN se intenta completar
- THEN se rechaza con un error de estado

#### Scenario: Cierre sin constancia de entrega
- GIVEN una operación en payment_received con identidad declarada pero sin `DeliveryVerification`
- WHEN se intenta completar
- THEN se rechaza con un error de estado

#### Scenario: Constancia de entrega sin propiedad principal
- GIVEN una operación en payment_received con una `DeliveryVerification` cuyo isPrimaryOwner es false
- WHEN se intenta completar
- THEN se rechaza con un error de estado
