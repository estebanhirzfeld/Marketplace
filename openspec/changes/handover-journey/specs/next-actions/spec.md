# Next Actions — Delta (handover-journey)

Una sola próxima acción por rol, calculada en un solo lugar.

## ADDED Requirements

### Requirement: A lo sumo un rol tiene acción en cada momento

`NextActions` MUST devolver, para una operación, la acción de cada rol (qué acción, si traba la
operación y su plazo) o a quién está esperando. En cada combinación de estado y tipo de activo, a lo
sumo un rol MUST trabar la operación, o los tres MUST estar esperando a la plataforma o a un plazo.
Hay dos excepciones, por la misma razón: ninguna parte necesita a la otra para hacer lo suyo. La
firma del tripartito, que las dos partes traban a la vez. Y la transferencia dividida: con los
comprobantes subidos, el vendedor confirma el suyo, la plataforma el de la comisión y el comprador
reemplaza el que le rechazaron, cada uno por su lado. La declaración de la cuenta receptora del comprador, con el precio
acordado, es una tarea que no traba nada mientras espera a otro rol, y pasa a trabar cuando hace
falta para entregar. Los textos los arma cada pantalla a partir de la acción.

#### Scenario: Contrato firmado de un sitio

- GIVEN una operación de un sitio en `contract_signed` sin cuenta receptora declarada
- WHEN se calcula la próxima acción de cada rol
- THEN el vendedor tiene que iniciar el traslado del dominio, con su plazo desde la firma
- AND el admin espera al vendedor
- AND el comprador puede declarar el mail de su cuenta de Hostinger sin trabar nada

#### Scenario: Pago confirmado de un sitio sin cuenta receptora

- GIVEN una operación de un sitio en `payment_received` sin cuenta receptora declarada
- WHEN se calcula la próxima acción de cada rol
- THEN el comprador traba la operación: tiene que declarar el mail de su cuenta de Hostinger

#### Scenario: Activo en custodia sin medio de pago

- GIVEN una operación en `asset_in_custody` sin ningún medio de pago disponible
- WHEN se calcula la próxima acción
- THEN el comprador espera a la plataforma, sin plazo corriendo
- AND el admin tiene que habilitar un medio de pago
- AND ningún texto le pide al comprador abrir un reclamo

#### Scenario: Comprobantes de la transferencia en revisión

- GIVEN una operación en `asset_in_custody` con el comprobante del vendedor rechazado y el de la
  comisión pendiente
- WHEN se calcula la próxima acción de cada rol
- THEN el comprador tiene que subir otro comprobante, dentro de su plazo para pagar
- AND el admin tiene que confirmar el de la comisión
- AND el vendedor espera, sin acción

#### Scenario: Activo en custodia sin dónde cobrar

- GIVEN una operación en `asset_in_custody` donde ningún medio está disponible porque el vendedor
  no vinculó Mercado Pago o no declaró su cuenta bancaria
- WHEN se calcula la próxima acción
- THEN el vendedor tiene que decir dónde cobra, y los demás lo esperan

#### Scenario: Tabla completa

- GIVEN cada estado de `Operation` y cada tipo de activo
- WHEN se calcula la próxima acción de comprador, vendedor y admin
- THEN se cumple que a lo sumo un rol tiene acción, o todos esperan a la plataforma, salvo las dos
  excepciones de arriba

### Requirement: La línea de tiempo es la misma para los tres roles

`NextActions` MUST devolver una línea de tiempo de etapas con su estado (hecha, en curso, pendiente) y
su fecha, idéntica para comprador, vendedor y admin.

#### Scenario: Tres roles, una línea de tiempo

- GIVEN una operación en `payment_received`
- WHEN se calcula la línea de tiempo para cada rol
- THEN las tres son iguales

### Requirement: La página de la operación y el panel del admin leen de `NextActions`

La página de la operación MUST mostrar «Tu próximo paso» y la línea de tiempo desde `NextActions`. El
panel del admin MUST agrupar las operaciones por a quién le toca, con la misma fuente.

#### Scenario: Página y panel coinciden

- GIVEN una operación donde le toca al vendedor
- WHEN el admin abre su panel
- THEN la operación figura entre las que esperan al vendedor
