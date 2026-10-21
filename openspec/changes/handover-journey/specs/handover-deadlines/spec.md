# Handover Deadlines — Delta (handover-journey)

Plazos que destraban una operación trabada, con su aviso, y devolución del activo.

## ADDED Requirements

### Requirement: Los plazos se calculan desde los hitos y se configuran en un solo lugar

`HandoverDeadlines` MUST calcular cada plazo desde el hito de la operación que lo ancla, con estos
valores por defecto: el vendedor 10 días desde la firma para ceder; el comprador 5 días hábiles desde la
custodia para pagar; el vendedor 5 días desde el pago para entregar lo no verificable; el comprador 3
días desde la última entrega para confirmar; el vendedor 2 días hábiles para confirmar que le llegó su
transferencia. Los días hábiles MUST excluir sábados, domingos y los feriados configurados.

#### Scenario: Plazo de pago en días hábiles

- GIVEN un activo en custodia desde un viernes y un feriado el martes siguiente
- WHEN se calcula el plazo de pago
- THEN los cinco días hábiles son lunes, miércoles, jueves, viernes y el lunes siguiente
- AND el plazo vence al terminar ese segundo lunes

#### Scenario: El plazo de pago se pausa

- GIVEN un comprobante en revisión o un pago de Mercado Pago pendiente
- WHEN el job revisa el plazo de pago
- THEN el plazo no vence mientras dure la revisión

#### Scenario: Sin medio de pago, el plazo no corre

- GIVEN una operación en custodia sin ningún medio de pago disponible
- WHEN el job revisa el plazo de pago
- THEN el plazo no vence y los admins reciben un aviso

### Requirement: Vencido el plazo del vendedor, la operación se cancela

Si el vendedor no cedió el activo dentro de su plazo, el job MUST volver a consultar al registrador (en
un sitio) y, si sigue sin ceder, cancelar la operación con motivo `seller_deadline`, avisar a las dos
partes y devolver el `Listing` a `published`. Un recordatorio MUST salir antes del vencimiento.

#### Scenario: Vendedor que no cede

- GIVEN una operación en `contract_signed` firmada hace 10 días y sin cesión
- WHEN corre el job
- THEN la operación queda `cancelled` con motivo `seller_deadline`
- AND comprador y vendedor reciben el aviso
- AND el activo vuelve a estar publicado

#### Scenario: El dominio llegó a último momento

- GIVEN un sitio con el plazo del vendedor vencido, pero con el dominio ya activo en la cuenta de la
  plataforma
- WHEN corre el job
- THEN la operación no se cancela y la custodia se confirma

#### Scenario: El job corre dos veces

- GIVEN una operación ya cancelada por plazo
- WHEN el job corre otra vez
- THEN no cambia nada ni repite avisos

### Requirement: Vencido el plazo de pago, la operación se cancela y el activo vuelve al vendedor

Si el comprador no pagó dentro de su plazo con el activo en custodia, el job MUST cancelar la operación
con motivo `buyer_deadline` y dejar pendiente la devolución del activo. En un sitio la devolución MUST
hacerse por traslado saliente al `sellerSourceIdentity`; en YouTube la hace el admin. Confirmada la
devolución, el `Listing` MUST volver a `published`.

#### Scenario: Comprador que no paga un sitio

- GIVEN un sitio en custodia con el plazo de pago vencido
- WHEN corre el job
- THEN la operación queda `cancelled` con motivo `buyer_deadline` y devolución pendiente
- AND se inicia el traslado saliente al mail de Hostinger del vendedor
- AND cuando el traslado se completa, el activo vuelve a estar publicado

#### Scenario: Cancelación a mano después de firmar

- GIVEN una operación en `asset_in_custody`
- WHEN una parte intenta cancelarla a mano
- THEN se rechaza, como hoy: solo un plazo vencido cancela después de firmar

### Requirement: Una declaración de cesión falsa vuelve la operación atrás

Si el admin encuentra falsa la declaración de cesión del vendedor, `rejectTransfer` MUST volver la
operación a `contract_signed`, con el plazo del vendedor intacto.

#### Scenario: Cesión rechazada

- GIVEN una operación en `transfer_in_progress`
- WHEN el admin rechaza la cesión
- THEN la operación vuelve a `contract_signed` y el vendedor recibe el motivo
