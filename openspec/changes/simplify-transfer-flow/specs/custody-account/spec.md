# Custody Account — Delta (simplify-transfer-flow)

Reescribe **un requirement** de la capacidad `custody-account` definida en `asset-custody-identity`. Sigue siendo cierto que `CustodyVerification` congela la cuenta de custodia; lo que se agrega es que ahora hay **dos** copias congeladas de la cuenta sobre una misma operación (`TransferInitiation` y `CustodyVerification`), que pueden diferir legítimamente si el acceso se volvió a registrar en el medio, y que esa divergencia es detectable.

Ningún requirement de `custody-account` queda invalidado.

## MODIFIED Requirements

### Requirement: `CustodyVerification` congela la cuenta de custodia

Al confirmar la custodia, `CustodyVerification` MUST guardar `custodyAccountId` copiado del `platformAccess` vigente del listing. Revocar y volver a registrar el acceso con otra cuenta después MUST NOT alterar el `custodyAccountId` de una `CustodyVerification` ya emitida.

Sobre una misma operación pueden coexistir dos copias congeladas de la cuenta: la de `TransferInitiation`, tomada cuando el vendedor declara la cesión, y la de `CustodyVerification`, tomada cuando la plataforma confirma la custodia. Las dos MUST poder compararse. Pueden diferir legítimamente si el acceso del listing se volvió a registrar entre una y otra, y esa divergencia MUST ser detectable en vez de quedar sin registrar. La divergencia por sí sola MUST NOT bloquear la confirmación de custodia. Si alguna de las dos copias es *"sin registrar"*, NO MUST afirmarse ninguna divergencia.

(Previously: la spec solo describía la copia congelada de `CustodyVerification`; ahora reconoce la segunda copia en `TransferInitiation` y que ambas pueden compararse y divergir de forma detectable.)

#### Scenario: La constancia de custodia registra la cuenta de origen

- GIVEN una operación en `transfer_in_progress` cuyo listing tiene acceso vigente apuntando a la cuenta X
- WHEN un admin confirma la custodia
- THEN la `CustodyVerification` queda con `custodyAccountId` = X

#### Scenario: El listing cambia de cuenta después de la custodia

- GIVEN una operación con `CustodyVerification` que registró la cuenta X
- WHEN más tarde se revoca el acceso y se registra de nuevo apuntando a la cuenta Y
- THEN la `CustodyVerification` de la operación sigue con `custodyAccountId` = X

#### Scenario: La cuenta declarada y la verificada difieren

- GIVEN una operación cuya `TransferInitiation` congeló la cuenta X
- AND cuyo acceso se volvió a registrar apuntando a la cuenta Y antes de la confirmación de custodia
- WHEN un admin confirma la custodia y la `CustodyVerification` queda con la cuenta Y
- THEN la operación puede informar que la cuenta declarada (X) y la verificada (Y) no coinciden
- AND la confirmación de custodia no se bloquea por esa diferencia
