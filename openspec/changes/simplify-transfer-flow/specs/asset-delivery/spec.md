# Asset Delivery — Delta (simplify-transfer-flow)

Reescribe **un escenario** de la capacidad `asset-delivery` definida en `asset-custody-identity`. El requirement no cambia y sigue valiendo: la identidad receptora no bloquea ninguna transición anterior a `complete()`. Lo que cambia es que el escenario subespecificaba su propia precondición — ahora que `initiateTransfer` exige una constancia del vendedor, el `WHEN se inicia la transferencia` necesita decir que esa declaración ocurrió.

Ningún requirement de `asset-delivery` queda invalidado.

## MODIFIED Requirements

### Requirement: La identidad receptora es una tarea pendiente no bloqueante

Mientras no esté declarada, el sistema MUST exponer la identidad receptora como tarea pendiente del comprador desde `contract_pending`. Esa tarea MUST NOT bloquear ninguna transición anterior a `complete()`. Desde `asset_in_custody` la tarea MUST señalarse como urgente, porque a partir de ahí demora la propia entrega del comprador. Una vez declarada, la tarea MUST desaparecer. Es el mismo patrón que las verificaciones pendientes del vendedor y los pasos de ACCESO DE LA PLATAFORMA.

(Previously: el escenario "Avanza sin la identidad declarada" hacía transicionar la operación con un `WHEN se inicia la transferencia` sin argumento; ahora nombra la declaración de cesión del vendedor que `initiateTransfer` exige.)

#### Scenario: Avanza sin la identidad declarada

- GIVEN una operación en `contract_signed` sin identidad receptora, cuyo vendedor ya declaró la cesión del control
- WHEN se inicia la transferencia con esa declaración
- THEN la operación pasa a `transfer_in_progress`
- AND la tarea de declarar la identidad figura como pendiente para el comprador

#### Scenario: La urgencia escala en custodia

- GIVEN una operación en `asset_in_custody` sin identidad receptora
- WHEN el comprador consulta sus tareas pendientes
- THEN la tarea de declarar la identidad figura como pendiente y urgente

#### Scenario: Tarea resuelta

- GIVEN una operación con identidad receptora ya declarada
- WHEN el comprador consulta sus tareas pendientes
- THEN la tarea de declarar la identidad no figura

## Notes

- El escenario "El comprador la cambia" (`asset-custody-identity/specs/asset-delivery/spec.md:33-36`) nombra `transfer_in_progress` pero **no se ve afectado**: el estado sigue existiendo y el reemplazo de la identidad declarada sin constancia de entrega se comporta igual. No se reescribe.
