# Fase 13 — La ventana de transferencia registra lo que hizo el vendedor

> **Estado**: ✅ Completa (dos tareas de usuario pendientes — ver el final)
> **Fecha**: Septiembre 2026
> **Objetivo**: Que `initiateTransfer()` deje de ser la única transición del escrow sin constancia, y que el vendedor se entere de que le toca actuar.

---

## El problema

`Operation.initiateTransfer()` no recibía ningún argumento y no registraba nada: comprobaba que el estado fuera `contract_signed` y asignaba el siguiente. Al lado de `confirmAssetCustody(data)`, `confirmBuyerPayment(datos)` y `complete(data)` —las otras tres transiciones que asumen algo sobre el mundo—, era la única que no dejaba nada escrito.

El costo no era solo conceptual. Sin constancia:

1. **La instrucción posterior a la firma era inalcanzable justo cuando aplicaba.** El paso de ceder el control vivía en la pantalla del activo, dentro de la rama que solo se muestra mientras *no* hay acceso registrado — y el acceso es condición previa para firmar, así que para cuando el contrato estaba firmado la instrucción ya había desaparecido.
2. **La pantalla de la operación se contradecía.** Le decía al vendedor que no necesitábamos nada más de él, en el mismo momento en que dibujaba el botón que tenía que apretar.
3. **Nadie le avisaba que le tocaba.** El único aviso al firmar era `contrato_firmado`, con el mismo texto pasivo para las dos partes — exacto para el comprador, falso para el vendedor.

Los tres son el mismo criterio de aceptación que la fase de acceso de plataforma se había fijado y no había cumplido.

---

## La constancia: espejo de `CustodyVerification`

```typescript
export interface TransferInitiation {
    declaredBy: UniqueEntityID;
    declaredAt: Date;
    controlCeded: boolean;
    /** Copia congelada del `custodyAccountId` vigente al declarar. */
    custodyAccountId?: UniqueEntityID;
    notes?: string;
}
```

`initiateTransfer(data)` reemplaza la transición sin argumentos con cuatro guardas, en orden:

```typescript
public initiateTransfer(data: TransferInitiationInput): void {
    if (data.declaredBy) {
        this.assertIsSeller(data.declaredBy.toString());
    }
    if (this.props.status !== 'contract_signed') {
        throw new InvalidStateError('El contrato debe estar firmado para iniciar la transferencia');
    }
    if (!data.declaredBy) {
        throw new ValidationError('Falta registrar quién declaró la cesión.');
    }
    if (data.controlCeded !== true) {
        throw new InvalidStateError(
            'Para iniciar la transferencia tenés que declarar que ya cediste el control del activo.'
        );
    }
    this.props.transferInitiation = { ...data, declaredAt: new Date() };
    this.props.status = 'transfer_in_progress';
}
```

La guarda de pertenencia se comprueba solo si `declaredBy` llegó: el tipo lo declara obligatorio, pero un payload malformado no puede hacer que la entidad reviente con un `TypeError` crudo en vez de responder con el error de dominio que le corresponde a cada situación. Con eso, la guarda de pertenencia sigue yendo antes que la de estado — un tercero no debería poder deducir en qué etapa está una operación ajena por el error que recibe — y la de presencia responde igual cuando el campo obligatorio falta.

`controlCeded: false` se rechaza, no se guarda: una declaración negativa es un vendedor que todavía no terminó, no una transición.

### El congelado de la cuenta

`InitiateTransferUseCase` suma `IListingRepository` y congela `custodyAccountId` desde el `platformAccess` vigente del listing al momento de la declaración — la entidad no busca un `Listing`, así que el use case es quien cruza los dos agregados:

```typescript
const listing = await this.listingRepo.findById(operation.listingId.toString());
if (!listing) throw new NotFoundError('Activo no encontrado');

operation.initiateTransfer({
    declaredBy: new UniqueEntityID(actor.id),
    controlCeded: input.controlCeded,
    custodyAccountId: listing.platformAccess?.custodyAccountId,
    notes: input.notes,
});
```

Con las dos cuentas congeladas — la de `TransferInitiation` al declarar y la de `CustodyVerification` al confirmar — se pueden comparar y una divergencia (el acceso se volvió a registrar en el medio) queda detectable en vez de perderse.

### Alcance agregado: `ConfirmCustodyUseCase` también congela su cuenta

Al escribir esta fase se encontró que `CustodyVerification.custodyAccountId` estaba declarado y el mapper lo leía y lo serializaba, pero **nada lo escribía**: `ConfirmCustodyUseCase` no lo pasaba. Sin esto, la comparación de arriba era imposible — un lado siempre estaba vacío. Se cableó en el mismo cambio, con un test de integración que prueba la ida y vuelta real contra la base: el defecto exacto que lo motivó es que nada lo había probado nunca.

---

## El aviso: un tipo por parte

`NegotiationNotifier.contractSigned()` mandaba `contrato_firmado` a las dos partes con el mismo texto pasivo. Ahora arma dos notificaciones:

```typescript
async contractSigned(operation: Operation): Promise<void> {
    const { props } = operation.toSnapshot();
    await this.enviar([
        Notification.create({ userId: props.buyerId, type: 'contrato_firmado', ... }),
        Notification.create({ userId: props.sellerId, type: 'cesion_pendiente', ... }),
    ]);
}
```

`cesion_pendiente` entró por migración aditiva de enum, **en un commit separado y anterior** al que hace que `contractSigned()` empiece a emitirlo. `NegotiationNotifier.enviar()` traga cualquier error a propósito — un aviso no puede tumbar una venta —, así que si el código emisor hubiera llegado antes que el valor de enum, el fallo habría sido silencioso: el vendedor no se habría enterado, y nadie habría visto el error. El mismo patrón que ya había pasado una vez con `denuncia_recibida`.

---

## El tablero: a quién se está esperando

`contract_signed` contaba como "en curso" pero no tenía categoría propia: ni esperaba a la plataforma, ni tenía entrada en el panel de próximos pasos. Ahora:

```typescript
const ESPERAN_AL_VENDEDOR: OperationStatus[] = ['contract_signed'];

const EN_CURSO: OperationStatus[] = [
    'contract_pending',
    ...ESPERAN_AL_VENDEDOR,
    ...ESPERAN_A_LA_PLATAFORMA,
];
```

`EN_CURSO` sigue contando los mismos cinco estados de siempre; el eje nuevo es *a quién le toca*. `PlatformDashboard.waitingOnSeller` se alimenta con un sexto `findByStatuses` dentro del mismo `Promise.all` que ya existía, y el panel de admin lo muestra como una segunda lista, subordinada a "ESPERANDO A LA PLATAFORMA".

---

## La pantalla: de un botón a un formulario

`TransferInitiationForm` reemplaza al `OperationAction` sin cuerpo: una casilla `controlCeded` que habilita el submit, la instrucción concreta que le exige su tipo de activo (`handoverSteps`, resuelto por `GetOperationDetailsUseCase` con una cascada propia — la cuenta declarada, si no la vigente, si no la primera activa), y notas opcionales.

El caso interesante es el de un listing web: su estrategia no tiene ningún paso con `requiredActor: 'platform'`, así que `handoverSteps` le llega **vacío**. El formulario no trata eso como un caso especial — dibuja la frase genérica, la casilla y el envío, y listo. El texto de la entidad tampoco nombra YouTube: *"Para iniciar la transferencia tenés que declarar que ya cediste el control del activo."*

El bloque de pasos posteriores a la firma en la pantalla del activo (`activos/[id]`) salió del ternario de "todavía sin acceso registrado": ahora se dibuja en las tres ramas, así que no desaparece justo cuando empieza a aplicar. Y el badge de `transfer_in_progress` pasó de `TRANSFIRIENDO` a `VERIFICANDO` — después de este cambio, "la plataforma está haciendo algo" es cierto de ese estado, porque el vendedor ya actuó antes de entrar.

---

## Lo que no cambió, a propósito

- **El valor del enum `transfer_in_progress` se conserva.** El identificador nunca fue la mentira — lo eran los textos. Renombrarlo hubiera costado una recreación de enum con riesgo de aborto sobre el despliegue vivo, para comprar una precisión que ninguna comisión iba a notar.
- **La comisión 5%/5% y el orden asset-first del escrow no se tocan.**
- **La declaración no se verifica con ninguna API.** Es evidencia, no seguro: la plataforma registra quién afirmó qué y cuándo; `confirmAssetCustody()` sigue siendo la comprobación independiente, atestiguada por un administrador.
- **Las operaciones que ya estaban en `transfer_in_progress` no se rellenan.** Quedan con `transferInitiation` en NULL y se muestran como "declaración sin registrar" — fabricar una constancia que nadie firmó sería el defecto, no el arreglo.

## Fuera de alcance, señalado y no resuelto acá

- El defecto de fondo de `WebStrategy` (cero pasos con `requiredActor: 'platform'`) queda abierto como `web-escrow-transfer-steps`.
- El legajo de evidencia todavía no incluye la declaración de cesión.

---

## Migraciones

Dos, independientes y aditivas:

```sql
-- add_cesion_pendiente_notification
ALTER TYPE "NotificationType" ADD VALUE 'cesion_pendiente';

-- add_transfer_initiation
ALTER TABLE "operations" ADD COLUMN "transferInitiation" JSONB;
```

Ninguna reescribe ni invalida una fila existente. No se elimina ningún valor de enum, así que no hay riesgo de aborto.

---

## Pendiente del usuario

Dos tareas quedan fuera del alcance de un agente de IA:

1. **`make db-reset`** — Prisma bloquea el reseteo de la base para agentes de IA sin consentimiento explícito. Aplica las dos migraciones nuevas sin intervención adicional una vez confirmado.
2. **Walkthrough manual** — confirmar en la aplicación corriendo: (a) un vendedor de YouTube declara la cesión y ve su paso concreto; (b) un vendedor de un listing web declara con la lista vacía; (c) un admin confirma custodia y puede leer las dos cuentas congeladas una al lado de la otra; (d) el vendedor recibe `cesion_pendiente` y el comprador `contrato_firmado`; (e) el tablero separa `contract_signed` de las esperas a la plataforma.
