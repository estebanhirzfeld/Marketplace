# Platform Dashboard — Delta (simplify-transfer-flow)

Agrega al tablero de la plataforma el eje *a quién se está esperando*, para que `contract_signed` deje de confundirse con las etapas que esperan a la plataforma.

## ADDED Requirements

### Requirement: El tablero distingue las esperas al vendedor de las esperas a la plataforma

El tablero MUST exponer `contract_signed` como una etapa donde **se está esperando al vendedor**, distinta de las etapas que esperan a la plataforma (`transfer_in_progress`, `asset_in_custody`, `payment_received`). `contract_signed` MUST seguir contándose como operación en curso; lo que se agrega es el eje de quién debe hacer el próximo movimiento, no un reparto distinto de "en curso". Hay precedente de esta forma en el mismo use case: `trabadasPorAcceso` ya separa esperas por su causa.

#### Scenario: `contract_signed` se muestra como espera al vendedor

- GIVEN operaciones en `contract_signed` y en `transfer_in_progress`
- WHEN un administrador carga el tablero
- THEN `contract_signed` figura bajo "se espera al vendedor"
- AND `transfer_in_progress` figura bajo "se espera a la plataforma"

#### Scenario: `contract_signed` sigue contando como en curso

- GIVEN una operación en `contract_signed`
- WHEN el tablero cuenta las operaciones en curso
- THEN la operación sigue incluida

### Requirement: `contract_signed` no se agrupa con las esperas a la plataforma

`contract_signed` MUST NOT agruparse con las etapas que esperan a la plataforma, porque la plataforma no puede destrabarlo: solo avisar.

#### Scenario: No aparece entre las esperas a la plataforma

- GIVEN una operación en `contract_signed`
- WHEN el tablero lista las operaciones que esperan a la plataforma
- THEN la operación no está entre ellas

### Requirement: El próximo paso de `contract_signed` se nombra como una espera, no como una acción de la plataforma

La lista de próximo paso del tablero (`PROXIMO_PASO`) MUST tener una entrada para `contract_signed` que la describa como una espera nombrada al vendedor —del tenor de *"Esperando que el vendedor ceda el control y lo declare"*— y no como una acción pendiente de la plataforma.

#### Scenario: El texto de próximo paso nombra al vendedor

- GIVEN una operación en `contract_signed`
- WHEN un administrador carga el tablero
- THEN su texto de próximo paso nombra la espera al vendedor
- AND no describe una acción de la plataforma
