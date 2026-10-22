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

Ningún documento aportado por las partes MUST tomarse como prueba de acreditación por sí solo. Con un
comprobante rechazado por el vendedor, el comprador MUST poder adjuntar otro o solicitar la revisión de
la plataforma. Mientras dura la revisión, el plazo de pago y la cancelación por plazo MUST quedar
suspendidos, y el activo MUST seguir en custodia: nunca se devuelve al vendedor con una revisión abierta.

La plataforma MUST revisar primero la coherencia del comprobante: monto exacto, fecha posterior a la
custodia, CBU o CVU de destino igual al declarado, CUIT de destino igual al del KYC del vendedor y CUIT de
origen igual al del KYC del comprador. Un comprobante incoherente MUST rechazarse sin pedirle nada al
vendedor. Con uno coherente, la plataforma MUST pedirle al comprador el ID COELSA de la transferencia o su
número de operación, y resolver por el rastreo entre bancos; los movimientos que aporte el vendedor son
información, no prueba. Si el vendedor no responde a tiempo, con aviso por mail y en la app, el pago MUST
darse por acreditado. Sin resolución, el activo MUST seguir en custodia hasta una mediación o resolución
externa. Un mismo comprobante rechazado dos veces MUST pasar solo a revisión.

#### Scenario: El vendedor niega un pago real

- GIVEN un comprobante coherente rechazado por el vendedor
- WHEN el rastreo bancario confirma la acreditación en el CBU del vendedor
- THEN el pago queda confirmado y la entrega sigue, aunque el vendedor insista

#### Scenario: Vence el plazo del comprador durante la revisión

- GIVEN una revisión abierta
- WHEN llega la fecha límite de pago del comprador
- THEN la operación no se cancela y el activo sigue en custodia

#### Scenario: El comprobante no es coherente

- GIVEN un comprobante cuyo CUIT de destino no es el del vendedor
- WHEN la plataforma lo revisa
- THEN lo rechaza sin pedirle nada al vendedor

#### Scenario: El vendedor no responde

- GIVEN una revisión con el comprobante coherente
- WHEN vence el plazo del vendedor después del doble aviso
- THEN el comprobante queda confirmado

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
