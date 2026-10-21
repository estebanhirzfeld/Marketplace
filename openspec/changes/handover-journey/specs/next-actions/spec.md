# Next Actions — Delta (handover-journey)

Una sola próxima acción por rol, calculada en un solo lugar.

## ADDED Requirements

### Requirement: A lo sumo un rol tiene acción en cada momento

`NextActions` MUST devolver, para una operación, un rol y un instante, la acción de ese rol (texto,
botón y plazo) o a quién se está esperando. En cada combinación de estado y tipo de activo, a lo sumo
un rol MUST tener acción, o los tres MUST estar esperando a la plataforma.

#### Scenario: Contrato firmado de un sitio

- GIVEN una operación de un sitio en `contract_signed` sin cuenta receptora declarada
- WHEN se calcula la próxima acción de cada rol
- THEN el comprador tiene que declarar el mail de su cuenta de Hostinger, con su plazo
- AND el vendedor y el admin esperan al comprador

#### Scenario: Activo en custodia sin medio de pago

- GIVEN una operación en `asset_in_custody` sin ningún medio de pago disponible
- WHEN se calcula la próxima acción
- THEN el comprador espera a la plataforma, sin plazo corriendo
- AND el admin tiene que habilitar un medio de pago
- AND ningún texto le pide al comprador abrir un reclamo

#### Scenario: Tabla completa

- GIVEN cada estado de `Operation` y cada tipo de activo
- WHEN se calcula la próxima acción de comprador, vendedor y admin
- THEN se cumple que a lo sumo un rol tiene acción, o todos esperan a la plataforma

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
