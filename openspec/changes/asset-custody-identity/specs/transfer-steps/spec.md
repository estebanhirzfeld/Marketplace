# Transfer Steps Specification

## Purpose

Define `IAssetStrategy.getTransferSteps(context?: TransferContext)` parametrizado para nombrar cuentas concretas sin conocerlas en el código de una estrategia, y el paso faltante del vendedor de YouTube: salir de los permisos de canal de YouTube Studio antes de invitar a la plataforma.

## Requirements

### Requirement: Pasos de traspaso parametrizados por contexto

`getTransferSteps` MUST aceptar un `TransferContext` opcional con `custodyAccountIdentifier?` y `recipientIdentifier?`. Sin contexto, MUST devolver la variante genérica actual, sin nombrar ninguna cuenta. Con `custodyAccountIdentifier`, el paso en el que el vendedor invita a la plataforma MUST nombrar ese identificador. Con `recipientIdentifier`, el paso en el que se invita al comprador MUST nombrarlo. Ningún identificador de cuenta concreto MUST estar escrito en el código de una estrategia.

#### Scenario: YouTube sin contexto
- GIVEN la estrategia de un canal de YouTube
- WHEN se piden los pasos sin contexto
- THEN el paso de invitación a la plataforma usa una redacción genérica y no contiene ningún identificador de cuenta

#### Scenario: YouTube con identificador de custodia
- GIVEN la estrategia de un canal de YouTube
- WHEN se piden los pasos con `custodyAccountIdentifier` = "custodia1@gmail.com"
- THEN el paso en que el vendedor invita a la plataforma contiene "custodia1@gmail.com"

#### Scenario: YouTube con identificador del comprador
- GIVEN la estrategia de un canal de YouTube
- WHEN se piden los pasos con `recipientIdentifier` = "comprador@gmail.com"
- THEN el paso en que se invita al comprador contiene "comprador@gmail.com"

#### Scenario: Web acepta el contexto sin romperse
- GIVEN la estrategia de un sitio web
- WHEN se piden los pasos con o sin contexto
- THEN devuelve su lista de pasos sin error (la variante web no se amplía en este cambio)

### Requirement: Paso de salida de los permisos de canal de YouTube Studio

`YouTubeStrategy.getTransferSteps()` MUST incluir un paso con `requiredActor` = `seller` que le pida al vendedor salir de los permisos de canal de YouTube Studio, ubicado ANTES del paso en que invita a la plataforma. `WebStrategy` MUST NOT incluir ningún paso relacionado con permisos de canal.

#### Scenario: El opt-out aparece antes de la invitación
- GIVEN los pasos de traspaso de un canal de YouTube
- WHEN se recorren en orden
- THEN el paso de salir de los permisos de canal aparece con requiredActor seller y en una posición anterior a la del paso de invitación a la plataforma

#### Scenario: El opt-out es un paso del vendedor
- GIVEN un listing de un canal de YouTube
- WHEN el vendedor consulta `Listing.handoverSteps()`
- THEN la lista incluye el paso de salir de los permisos de canal

#### Scenario: Un sitio web no tiene ese paso
- GIVEN los pasos de traspaso de un sitio web
- WHEN se recorren
- THEN ninguno menciona permisos de canal

### Requirement: El vendedor ve el identificador concreto de la cuenta a invitar

Cuando el listing de la operación tiene un `platformAccess` con una `CustodyAccount` asignada, la vista de pasos del vendedor MUST construir el `TransferContext` con el `identifier` de esa cuenta, de modo que el paso de invitación nombre la cuenta concreta. Sin `platformAccess`, MUST usar la variante genérica. La consulta de los pasos de un listing MUST estar restringida a su vendedor (`assertOwnedBy`) o a un administrador.

#### Scenario: Con cuenta asignada
- GIVEN un listing con `platformAccess` apuntando a una cuenta activa cuyo identifier es "custodia1@gmail.com"
- WHEN su vendedor consulta los pasos de traspaso
- THEN el paso de invitación nombra "custodia1@gmail.com"

#### Scenario: Sin cuenta asignada
- GIVEN un listing sin `platformAccess`
- WHEN su vendedor consulta los pasos de traspaso
- THEN el paso de invitación usa la redacción genérica

#### Scenario: Un tercero consulta los pasos
- GIVEN un usuario que no es el vendedor del listing ni administrador
- WHEN consulta los pasos de traspaso de ese listing
- THEN se rechaza con ForbiddenError

## Out of Scope

Lo siguiente NO se especifica en este cambio:

- **Corregir un destino receptor equivocado después de la entrega.** Si el comprador declaró mal su cuenta y la `DeliveryVerification` ya se emitió, se resuelve fuera del sistema. Entra en un cambio posterior si aparece el caso real.
- **La contradicción del escrow de sitios web.** `WebStrategy.getTransferSteps()` no tiene ningún paso de plataforma mientras `Listing.assertCanBeTransferred()` exige `platformAccess` para todo listing. Es un defecto anterior; se corrige en el cambio aparte `web-escrow-transfer-steps`, que exige investigar el traspaso real de dominios (código EPP, bloqueo ICANN de 60 días).
- **Aprovisionar varias cuentas de custodia automáticamente o asignar cuentas a administradores concretos.** El modelo admite varias filas; pasar de una a dos es insertar una fila, no un cambio de spec.
- **Guardar credenciales, segundo factor o correos de recuperación de una cuenta de custodia.** Solo se guarda su `identifier`.
- **Variables de entorno para la identidad de custodia.**
- **Verificar la titularidad del activo por API** (`channels.list` con `mine=true`, `auditDetails`). La constancia sigue siendo atestiguada por una persona.
