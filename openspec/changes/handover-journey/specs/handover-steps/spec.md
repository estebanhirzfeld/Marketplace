# Handover Steps — Delta (handover-journey)

Todos los pasos del traspaso se muestran, para los dos tipos, cada uno con su dueño.

## MODIFIED Requirements

### Requirement: Cada paso declara su dueño, su comprobación, su etapa y lo que traba

Todo `TransferStep` MUST declarar `requiredActor`, `check`, `stage` (`listing`, `custody`, `payment`,
`delivery` o `closing`) y `gate` cuando traba algo (`sign`, `custody`, `payment`, `receipt` o
`complete`). Un paso que hace una persona MUST tener instrucción. `stage` reemplaza `phase`.

#### Scenario: Toda estrategia cumple el contrato de pasos

- GIVEN cada estrategia registrada
- WHEN se piden sus pasos de traspaso
- THEN cada paso tiene `requiredActor`, `check` y `stage`
- AND cada paso con `requiredActor` distinto de `platform` y `check` distinto de `automatic` tiene
  instrucción

### Requirement: `Listing.handoverSteps()` no descarta pasos

`Listing.handoverSteps()` MUST devolver todos los pasos de la estrategia, ordenados por etapa.

#### Scenario: El comprador de un canal ve sus pasos

- GIVEN una operación de un canal de YouTube con el activo en custodia
- WHEN el comprador abre la operación
- THEN ve los pasos de pagar, aceptar la invitación y asegurar sus accesos

#### Scenario: El sitio muestra sus pasos de entrega

- GIVEN una operación de un sitio con el pago confirmado
- WHEN el vendedor abre la operación
- THEN ve los pasos de entrega de hosting, archivos, código, base de datos y cuentas, con instrucciones
