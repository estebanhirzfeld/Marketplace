# Especificación: el rol que sostiene la plataforma

Define qué rol se le pide al vendedor sobre su activo, cuándo se le pide, qué se registra al respecto, y qué se le promete y qué no.

## Requirement: la constancia registra con qué rol quedó la plataforma

`PlatformAccessRecord` MUST incluir `heldRole: PlatformHeldRole` con valores `'manager' | 'owner'`. Registrar un acceso nuevo MUST exigirlo. El tipo MUST admitirlo ausente, porque las constancias anteriores a este cambio no lo tienen: se rehidratan sin rol y MUST mostrarse como "rol sin registrar". NO MUST rellenarse con un valor por defecto — afirmar un rol que nadie atestiguó sería inventar una constancia, el mismo criterio con el que se resolvió `custodyAccountId`.

`assertCanBeTransferred()` NO MUST mirar el rol. El plazo se cuenta desde `accessSince` porque la regla de Google no distingue entre administrador y propietario a los efectos de los siete días.

#### Scenario: registrar acceso sin rol se rechaza
- GIVEN un activo publicado y una cuenta de custodia activa
- WHEN un admin registra el acceso sin indicar el rol
- THEN se rechaza con un error de validación

#### Scenario: una constancia anterior al cambio sigue siendo válida
- GIVEN un activo cuya constancia se registró antes de este cambio y no tiene rol
- WHEN se lee el activo
- THEN la constancia sigue siendo válida, el plazo se calcula igual, y el rol se informa como no registrado

#### Scenario: el plazo no depende del rol
- GIVEN dos activos con acceso registrado hace ocho días, uno como administrador y otro como propietario
- WHEN se consulta si pueden transferirse
- THEN los dos pueden

## Requirement: al vendedor se le piden permisos mínimos

Para un canal de YouTube, el paso de invitación MUST pedir el rol de **administrador**, no el de propietario. La instrucción MUST decir explícitamente qué NO puede hacer la plataforma con ese rol: no puede eliminar el canal, no puede quitar al vendedor, no puede transferir el activo.

Fundamento, citado en `docs/investigacion-integraciones.md` §1: la antigüedad como administrador cuenta para los siete días, y un administrador no puede eliminar el canal ni quitar propietarios. Pedir propietario es pedir más poder del necesario, y es justamente el que el vendedor teme ceder.

#### Scenario: el paso de invitación nombra el rol mínimo y su alcance
- GIVEN un activo de tipo canal con una cuenta de custodia asignada
- WHEN se consultan sus pasos de cesión
- THEN el paso de invitación pide administrador, nombra el identificador concreto de la cuenta, y enumera lo que la plataforma no puede hacer

#### Scenario: la instrucción no promete lo que no se puede sostener
- GIVEN un activo de tipo sitio web
- WHEN se consultan sus pasos de cesión
- THEN ninguno promete acceso limitado, porque en dominios no existe un equivalente estándar

## Requirement: el vendedor cede el control en un paso posterior y visible

MUST existir un paso cuyo `requiredActor` es `'seller'` y que ocurre **después** de pasos de la plataforma: promover a la plataforma de administrador a propietario principal, con el contrato ya firmado.

Ese paso MUST ser visible para el vendedor **desde el principio**, no solo cuando le toque. La promesa del producto es que no cede control *ahora*; eso solo tranquiliza si puede ver cuándo sí lo va a ceder. Ocultarlo lo convertiría en una sorpresa tardía, que es exactamente la desconfianza que el producto intenta eliminar.

#### Scenario: el vendedor ve el camino completo antes de empezar
- GIVEN un activo sin acceso registrado
- WHEN el vendedor consulta qué tiene que hacer
- THEN ve tanto los pasos inmediatos como el de promoción posterior, distinguidos por momento

#### Scenario: los pasos del vendedor no se cortan en el primero ajeno
- GIVEN una lista de pasos donde hay pasos del vendedor después de pasos de la plataforma
- WHEN se consultan los pasos del vendedor
- THEN se devuelven todos los suyos, no solo el tramo inicial

## Requirement: el vendedor ve a qué cuenta concreta tiene que invitar

El panel donde el vendedor cede el acceso MUST mostrar el identificador de la cuenta de custodia de forma destacada, sin obligarlo a buscarlo en otra pantalla. Sin ese dato el instructivo es inaplicable: le dice que invite "a la plataforma" sin decirle a quién.

Cuando no haya cuenta de custodia activa para ese tipo de activo, el panel MUST decirlo en vez de mostrar un instructivo que no se puede seguir.

#### Scenario: sin cuenta activa el panel lo dice
- GIVEN un tipo de activo sin ninguna cuenta de custodia activa
- WHEN el vendedor abre el panel de acceso
- THEN se le informa que todavía no podemos recibir el activo, en vez de pedirle que invite a nadie

## Requirement: el enunciado del plazo es el real, no uno más angosto

`waitingNotice` de YouTube MUST enunciar que el plazo admite **administrador o propietario**. Hoy dice "haber sido propietario", que es más angosto que la regla y contradice el paso que se le pide al vendedor.

#### Scenario: el aviso del plazo coincide con lo que se pide
- GIVEN un activo de tipo canal
- WHEN se lee el aviso sobre el plazo de espera
- THEN menciona que alcanza con ser administrador durante siete días

## Requirement: al comprador de un dominio se le informa el bloqueo de 60 días

`waitingNotice` de sitio web MUST dejar de ser `undefined` y MUST informar que un cambio de titular activa un bloqueo de 60 días para mover el dominio a otro registrador. MUST aclarar que no afecta la propiedad.

MUST existir además un paso previo del vendedor: eximirse del bloqueo antes de ceder el dominio, si su registrador lo permite. Después de iniciado el bloqueo ya no se puede.

#### Scenario: el comprador de un sitio se entera de la limitación
- GIVEN un activo de tipo sitio web
- WHEN se lee su aviso de plazo
- THEN informa el bloqueo de 60 días entre registradores y aclara que la propiedad no se ve afectada

## Fuera de esta especificación

- El guion de defensa `guion_pitch_final.md`.
- Los pasos de custodia faltantes de `WebStrategy` (`web-escrow-transfer-steps`).
- El alta y la administración de cuentas de custodia, ya especificados en `asset-custody-identity`.
- Cualquier cambio a la comisión, al orden del escrow o al carácter manual de las constancias.
