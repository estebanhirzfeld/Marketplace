# Listing Withdrawal — Delta (handover-journey)

Un vendedor puede retirar un activo publicado mientras no tenga una operación firmada.

## ADDED Requirements

### Requirement: Retirar un activo sin operación viva

El vendedor MUST poder retirar un activo publicado cuando no tiene ninguna operación en
`contract_signed` o posterior. El `Listing` MUST pasar a `withdrawn` con `withdrawnAt`. Las ofertas
abiertas MUST cancelarse con aviso a sus compradores.

#### Scenario: Retiro con ofertas abiertas

- GIVEN un activo publicado con dos ofertas en `negotiating`
- WHEN el vendedor lo retira
- THEN el activo queda `withdrawn`
- AND las dos operaciones quedan `cancelled` y sus compradores reciben el aviso

#### Scenario: Retiro con una operación firmada

- GIVEN un activo con una operación en `contract_signed`
- WHEN el vendedor intenta retirarlo
- THEN se rechaza
