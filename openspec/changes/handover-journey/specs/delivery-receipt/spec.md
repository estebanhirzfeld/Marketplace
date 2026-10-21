# Delivery Receipt — Delta (handover-journey)

Entrega de lo no verificable, recepción del comprador y cierre automático.

## ADDED Requirements

### Requirement: El vendedor entrega lo no verificable después del pago

Con el pago confirmado, el vendedor MUST ver los pasos de entrega de su tipo de activo, con
instrucciones, y MUST poder declararlos entregados (`markDelivered`). En un sitio la entrega del
dominio MUST arrancar sola al confirmarse el pago.

#### Scenario: Entrega de un sitio

- GIVEN una operación de un sitio en `payment_received`
- WHEN el vendedor declara entregados el hosting, los archivos y las cuentas
- THEN se registra la entrega y empieza a correr el plazo del comprador, si el dominio ya se entregó

### Requirement: El comprador confirma la recepción o reclama

El comprador MUST poder confirmar la recepción o abrir un reclamo dentro de su plazo. Si no responde,
el job MUST darla por recibida (`autoConfirmReceipt`) y avisarle. Un reclamo abierto MUST congelar la
confirmación automática y el cierre hasta que el admin lo cierre.

#### Scenario: Confirmación del comprador

- GIVEN una operación con todo entregado
- WHEN el comprador confirma la recepción
- THEN la operación se completa sola

#### Scenario: Sin respuesta

- GIVEN una operación con el plazo del comprador vencido y sin reclamo
- WHEN corre el job
- THEN la recepción se da por confirmada, la operación se completa y el comprador recibe el aviso

#### Scenario: Reclamo abierto

- GIVEN una operación con un reclamo `activo_no_entregado` abierto
- WHEN vence el plazo del comprador
- THEN la operación no se completa

#### Scenario: El admin cierra el reclamo con «seguir»

- GIVEN un reclamo abierto
- WHEN el admin lo cierra con «seguir»
- THEN el plazo del comprador vuelve a empezar

### Requirement: `complete()` no recibe casillas

`Operation.complete()` MUST exigir pago confirmado, recepción del comprador y cuenta receptora, y MUST
NOT recibir casillas marcadas por el admin. El formulario de cierre del admin MUST desaparecer.

#### Scenario: Sin recepción

- GIVEN una operación en `payment_received` sin recepción del comprador
- WHEN se intenta completar
- THEN se rechaza

### Requirement: En YouTube el vendedor sale del canal al confirmar la custodia

Confirmar la custodia de un canal MUST exigir que el vendedor ya no tenga acceso. El comprador MUST
confirmarlo de nuevo al recibir.

#### Scenario: Custodia con el vendedor todavía en el canal

- GIVEN un canal donde la plataforma es propietaria principal y el vendedor sigue con acceso
- WHEN el admin intenta confirmar la custodia
- THEN se rechaza con el paso pendiente de sacar al vendedor
