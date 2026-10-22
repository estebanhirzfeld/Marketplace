# Split Bank Transfer — Delta (handover-journey)

La transferencia bancaria se divide como el split: cada parte recibe lo suyo, con comprobante.

## ADDED Requirements

### Requirement: El vendedor declara su cuenta bancaria para cobrar

El vendedor MUST poder declarar, por moneda, un CBU de 22 dígitos o un alias y el titular. La cuenta
MUST mostrarse al comprador recién con el activo en custodia.

#### Scenario: CBU inválido

- GIVEN un vendedor que declara un CBU de 20 dígitos
- WHEN guarda la cuenta
- THEN se rechaza con un mensaje que pide los 22 dígitos

#### Scenario: Cuenta oculta antes de la custodia

- GIVEN una operación en `contract_signed`
- WHEN el comprador abre la operación
- THEN no ve la cuenta bancaria del vendedor

### Requirement: El comprador paga en dos transferencias y sube dos comprobantes

Con el activo en custodia y la transferencia habilitada, el comprador MUST ver dos destinos con sus
montos: `sellerReceives` a la cuenta del vendedor y `platformEarns` a la de la plataforma. MUST poder
subir un comprobante por destino, imagen o PDF, arrastrándolo o desde el teléfono.

#### Scenario: Montos por destino

- GIVEN una operación con precio final de 1000 USD
- WHEN el comprador elige transferencia
- THEN ve 950 USD a la cuenta del vendedor y 100 USD a la de la plataforma

#### Scenario: Archivo no admitido

- GIVEN un comprobante con formato distinto de imagen o PDF, o más grande que el límite
- WHEN el comprador lo sube
- THEN se rechaza con el motivo

### Requirement: Cada destinatario confirma su comprobante

El vendedor MUST confirmar o rechazar el comprobante de su transferencia; el admin, el de la comisión.
Rechazar MUST exigir un motivo y avisar al comprador. Si el vendedor no responde en 2 días hábiles, el
admin MUST poder decidir con el comprobante a la vista. Con los dos comprobantes confirmados,
`confirmBuyerPayment` MUST pasar la operación a `payment_received`.

#### Scenario: Los dos confirmados

- GIVEN los dos comprobantes subidos
- WHEN el vendedor confirma el suyo y el admin el de la comisión
- THEN la operación pasa a `payment_received`

#### Scenario: Uno rechazado

- GIVEN los dos comprobantes subidos
- WHEN el vendedor rechaza el suyo con un motivo
- THEN la operación sigue en `asset_in_custody` y el comprador recibe el motivo

#### Scenario: El split de Mercado Pago no cambia

- GIVEN un pago aprobado por Mercado Pago
- WHEN llega el webhook
- THEN la operación pasa a `payment_received` sin comprobantes

### Requirement: Revisión de la plataforma sobre un comprobante rechazado

Con un comprobante rechazado por el vendedor, el comprador MUST poder adjuntar otro o solicitar la
revisión de la plataforma; mientras dura la revisión, el plazo de pago MUST quedar suspendido. La
plataforma MUST revisar primero la coherencia del comprobante (monto, destino, fecha posterior a la
custodia y número de operación del banco) y rechazarlo si no la tiene. Si la tiene, MUST pedirle al
vendedor los movimientos de su cuenta del día, con 2 días hábiles de plazo y el aviso de que su silencio
da el pago por acreditado. Un mismo comprobante rechazado dos veces MUST pasar solo a revisión.

#### Scenario: El vendedor muestra que no llegó

- GIVEN una revisión con el comprobante coherente y los movimientos del vendedor sin el crédito
- WHEN la plataforma resuelve
- THEN el comprobante queda rechazado y el plazo de pago del comprador se reanuda

#### Scenario: El vendedor no responde

- GIVEN una revisión con el comprobante coherente
- WHEN vencen los 2 días hábiles sin movimientos del vendedor
- THEN el comprobante queda confirmado

#### Scenario: El comprobante no es coherente

- GIVEN una revisión de un comprobante con otro monto o destino
- WHEN la plataforma lo revisa
- THEN lo rechaza sin pedirle nada al vendedor

### Requirement: Subir un comprobante desde el teléfono sin sesión

La página MUST mostrar un QR con un enlace de un solo uso para subir el comprobante desde el teléfono
sin iniciar sesión. El token MUST ser aleatorio, guardarse como hash, vencer en minutos, servir para una
sola operación y un solo destino, y limitar los intentos.

#### Scenario: Token usado

- GIVEN un token con el que ya se subió un comprobante
- WHEN se intenta subir otro con el mismo token
- THEN se rechaza

#### Scenario: Token vencido

- GIVEN un token emitido hace más de su vigencia
- WHEN se intenta subir con él
- THEN se rechaza y la página pide generar otro QR

#### Scenario: Token de otra operación

- GIVEN un token emitido para otra operación
- WHEN se usa en esta
- THEN se rechaza sin revelar si la operación existe
