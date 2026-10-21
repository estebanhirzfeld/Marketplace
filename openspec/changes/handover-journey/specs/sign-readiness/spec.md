# Sign Readiness — Delta (handover-journey)

Antes de firmar el tripartito, el activo tiene que poder pasar a custodia sin esperas. Lo define cada
estrategia.

## ADDED Requirements

### Requirement: Cada estrategia decide si el activo está listo para firmar

`IAssetStrategy.transferReadiness(facts)` MUST devolver si el activo está listo y, si no lo está, una
instrucción para el vendedor. MUST ser una función pura: los hechos los trae un puerto.

#### Scenario: Canal con la plataforma como administradora hace siete días

- GIVEN un canal de YouTube cuyo acceso de la plataforma como administradora se registró hace 7 días
- WHEN se calcula si está listo para firmar
- THEN está listo

#### Scenario: Canal con la espera de siete días sin cumplir

- GIVEN un canal cuyo acceso se registró hace 3 días
- WHEN se calcula si está listo para firmar
- THEN no está listo, y la instrucción dice cuándo se cumple la espera

#### Scenario: Sitio en Hostinger, activo y lejos de vencer

- GIVEN un sitio cuyo dominio, según RDAP, está en Hostinger, activo y vence en más de 45 días
- WHEN se calcula si está listo para firmar
- THEN está listo, sin acceso de la plataforma registrado

#### Scenario: Sitio en otro registrador

- GIVEN un sitio cuyo dominio está en otro registrador
- WHEN se calcula si está listo para firmar
- THEN no está listo, y la instrucción explica cómo mudarlo a Hostinger con el código EPP y que el
  dominio queda bloqueado 60 días para otro registrador, no para la plataforma

#### Scenario: Sitio a punto de vencer

- GIVEN un sitio cuyo dominio vence en 30 días
- WHEN se calcula si está listo para firmar
- THEN no está listo, y la instrucción pide renovarlo

### Requirement: La firma del tripartito exige el activo listo

`SignContractUseCase` MUST rechazar la firma del tripartito cuando el activo no está listo, con la
instrucción de la estrategia. MUST NOT exigir `platformAccess` a un sitio.

#### Scenario: Firma de un sitio sin acceso de la plataforma

- GIVEN un sitio listo para firmar y sin `platformAccess`
- WHEN la última parte firma el tripartito
- THEN el contrato queda firmado y la operación pasa a `contract_signed`

#### Scenario: Firma trabada

- GIVEN un canal que no está listo para firmar
- WHEN una parte intenta firmar el tripartito
- THEN la firma se rechaza con la instrucción de la estrategia

#### Scenario: El registro no responde

- GIVEN un sitio cuyo dominio no se puede consultar por RDAP
- WHEN una parte intenta firmar el tripartito
- THEN la firma se rechaza con un mensaje para volver a intentar, sin dar el activo por listo

### Requirement: Un sitio no pide acceso de la plataforma

Aceptar una oferta por un sitio MUST NOT avisar `acceso_pendiente`. Un sitio MUST NOT aparecer en la
bandeja de accesos ni mostrar «Transferencia inmediata».

#### Scenario: Oferta aceptada por un sitio

- GIVEN una oferta por un sitio
- WHEN el vendedor la acepta
- THEN ningún admin recibe `acceso_pendiente`

#### Scenario: Oferta aceptada por un canal

- GIVEN una oferta por un canal sin acceso de la plataforma
- WHEN el vendedor la acepta
- THEN los admins reciben `acceso_pendiente`, como hoy
