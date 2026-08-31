# Fase 7 — Contratos con documento y constancias de verificación

> **Estado**: ✅ Completa
> **Fecha**: Agosto 2026
> **Objetivo**: Que firmar signifique aceptar un texto, y que cada paso donde la plataforma asume riesgo deje constancia de qué se verificó.

---

## El problema

Firmar un contrato era apretar un botón. `Contract.sign()` marcaba una firma como hecha y guardaba la fecha, pero **no existía ningún documento**: no había texto que leer, ni forma de saber después qué había aceptado cada parte.

Lo mismo pasaba con la custodia. `ConfirmCustody` cambiaba el estado de la operación a `asset_in_custody` —el momento en que la plataforma asume el riesgo y le pide el pago al comprador— sin registrar quién había verificado nada ni qué.

Los dos son el mismo defecto: **actos con consecuencias y sin constancia**.

---

## Contratos: el documento se regenera, no se guarda

El texto de cada contrato se arma con los datos reales de la operación y se le calcula una huella SHA-256. Esa huella queda adjunta al contrato, y **cada firma guarda la huella del documento vigente al momento de firmar**.

```typescript
export interface Signature {
    role: PartyRole;
    signed: boolean;
    signedAt?: Date;
    signatureIp?: string;
    /**
     * Hash del documento vigente al momento de firmar. Sin esto, la firma
     * registra que alguien apretó un botón, no qué texto aceptó.
     */
    documentHash?: string;
}
```

El documento **no se almacena**: se regenera en cada consulta y se compara contra la huella firmada. Si algún dato de la operación cambiara después de la firma, la comparación falla y se informa en vez de ocultarse. Guardar una copia habría creado un segundo lugar donde la verdad puede desincronizarse.

`ContractDataBuilder` existe por una razón concreta: el armado de los datos del documento estaba a punto de duplicarse entre firmar y leer, y dos armados que divergen producen huellas distintas para el mismo contrato. Una sola definición.

### Encuadre legal

Las plantillas se adaptaron a la legislación argentina y declaran explícitamente que la firma utilizada **no es firma digital** en el sentido de la Ley 25.506 y no goza de la presunción de autoría del artículo 7. Con firma electrónica, *"en caso de ser desconocida […] corresponde a quien la invoca acreditar su validez"*.

El hash no otorga esa presunción, pero es evidencia técnica de integridad: exactamente la clase de elemento que sirve para acreditar validez cuando el artículo 5 lo exige.

---

## Constancia de custodia

`confirmAssetCustody()` dejó de ser un botón. Ahora exige declarar qué se verificó, y rechaza el registro si la verificación no alcanza:

```typescript
public confirmAssetCustody(datos: CustodyVerificationInput): void {
    if (!datos.isPrimaryOwner) {
        throw new InvalidStateError(
            'La plataforma todavía no es propietaria principal del activo: la custodia no es efectiva y el vendedor aún puede revertirla.'
        );
    }
    // …
}
```

Esa regla salió de la investigación de las APIs, no de una intuición. YouTube exige *"To become primary owner, you must have been an owner for 7 days or more"*. Durante esa ventana la plataforma figura como propietaria pero el vendedor sigue siendo el principal y **conserva la facultad de expulsarla**. Pedirle el pago al comprador ahí lo expondría exactamente al riesgo que el escrow existe para eliminar.

---

## Constancia de acceso y el candado del tripartito

Un tercer registro, esta vez sobre el listing: desde cuándo la plataforma tiene acceso al activo. De esa única fecha se **deriva** cuándo el activo queda transferible, aplicando la espera que declara cada estrategia.

```typescript
public transferableFrom(): Date | undefined {
    const record = this.props.platformAccess;
    if (!record) return undefined;

    const espera = this.props.assetStrategy.transferWaitingDays();
    return new Date(record.accessSince.getTime() + espera * MILISEGUNDOS_POR_DIA);
}
```

La espera vive en `IAssetStrategy` y no en la entidad porque la impone la plataforma del activo: siete días en YouTube, cero en un sitio web.

**El candado va sobre la firma del tripartito**, que es el punto de no retorno: después de firmarlo la cancelación deja de ser legal. Si la plataforma todavía no puede tomar la custodia, nadie debería quedar comprometido.

Los NDA quedaron deliberadamente fuera del candado, con un test que lo fija: obligan a callar, no a comprar, y bloquearlos solo le impediría a un interesado evaluar el activo antes de ofertar.

---

## Un patrón que se repitió tres veces

Las tres constancias tienen la misma forma: **quién verificó, cuándo, y qué encontró**. No es casualidad — es la respuesta a un problema estructural del proyecto.

Buena parte de lo que la plataforma necesita saber no es verificable por software. Que la plataforma tenga el ownership de un canal no lo dice ninguna API. Que el activo esté efectivamente en custodia, tampoco. Cuando no hay forma de comprobar algo automáticamente, la alternativa honesta no es asumirlo: es **atestiguarlo con nombre y fecha**.

Ese patrón se volvió después la base del legajo de la Fase 9.

---

## Lo que se rompió al arreglarlo

Agregar la constancia a `confirmAssetCustody()` puso en rojo ocho tests que confirmaban la custodia sin verificar nada. Eran tests que pasaban describiendo un comportamiento que no queríamos.

Y una revisión de `Contract.sign()` mostró que el seed llevaba tiempo roto: firmaba sin adjuntar documento, lo que desde esta fase es un error de dominio. Se confirmó con `git stash` que la falla venía de antes y se corrigió generando el documento real con el mismo armador que usa la aplicación, para que la huella firmada coincida con la que se regenera.

---

## Estado

| Pieza | Dónde |
|---|---|
| Plantillas y generación | `packages/domain/src/contracts/` |
| Huella del documento | `packages/domain/src/services/DocumentHash.ts` |
| Constancia de custodia | `Operation.confirmAssetCustody()` |
| Constancia de acceso | `Listing.registerPlatformAccess()` |
| Candado del tripartito | `SignContractUseCase` |
