# Diseño: el rol que sostiene la plataforma

Cambio chico en superficie de código y grande en lo que corrige. El modelo ya sostenía la historia de las dos etapas; faltaba registrar el rol, pedir el mínimo, y decirlo.

## 1. `PlatformHeldRole` y dónde vive

```ts
/**
 * Con qué rol figura la plataforma sobre el activo.
 *
 * No es lo mismo tener acceso que tener control, y esa diferencia es la
 * propuesta de valor entera: como administrador el plazo de Google corre
 * igual pero no podemos eliminar el canal ni quitar al vendedor, así que él
 * puede publicar y recibir ofertas sin ceder nada.
 */
export type PlatformHeldRole = 'manager' | 'owner';
```

En `PlatformAccessRecord`, junto a `custodyAccountId`:

```ts
    /**
     * Opcional en el tipo —no en el registro nuevo— porque las constancias
     * anteriores a este cambio no lo tienen. Se rehidratan sin rol y se
     * muestran como "rol sin registrar": rellenarlas con un valor plausible
     * sería afirmar algo que nadie atestiguó.
     */
    heldRole?: PlatformHeldRole;
```

`PlatformAccessInput` lo pide obligatorio. `registerPlatformAccess()` valida su presencia con el mismo criterio que ya usa para `verifiedBy`.

**Sin migración.** Vive dentro de la columna Json `platformAccess`. Es la diferencia con `custodyAccountId`, que salió a columna para tener integridad referencial contra `custody_accounts`; acá no hay tabla a la que apuntar.

**Alternativa rechazada** — derivar el rol en vez de guardarlo: imposible. Ninguna API expone qué rol tenemos sobre un canal, y esa imposibilidad es la razón de ser de la constancia.

## 2. `handoverSteps()` deja de cortar y empieza a filtrar

Hoy:

```ts
const corte = pasos.findIndex((p) => p.requiredActor !== 'seller');
return corte === -1 ? pasos : pasos.slice(0, corte);
```

El corte se había escrito asumiendo que los pasos del vendedor van todos al principio. Con el paso de promoción eso deja de ser cierto, y el corte lo dejaría invisible — el vendedor no vería el momento en que sí cede el control, que es justo lo que hay que mostrarle.

**Filtrar por actor sería peor.** Una prueba existente lo dice y tiene razón: un sitio web tiene pasos del vendedor *después* del comprador —migrar el hosting, ceder las cuentas afiliadas— que son parte de la entrega al comprador, no de la cesión a la plataforma. Filtrar por rol se los pondría al vendedor en la cara mientras todavía está publicando.

La línea correcta no es quién actúa sino **dónde entra el comprador por primera vez**. Todo lo anterior a eso es meter el activo en custodia; todo lo posterior es entregárselo al comprador.

```ts
public handoverSteps(context?: TransferContext): TransferStep[] {
    const pasos = this.props.assetStrategy.getTransferSteps(context);

    // El comprador marca la frontera: antes de que él aparezca, lo que pasa es
    // que el activo entra en custodia; después, que sale hacia él. Cortar por
    // el primer paso ajeno al vendedor dejaría afuera su promoción a
    // propietario principal, que ocurre entre dos pasos nuestros. Filtrar por
    // rol le pediría de entrada cosas que son de la entrega, como migrar el
    // hosting de un sitio.
    const entraElComprador = pasos.findIndex((p) => p.requiredActor === 'buyer');
    const custodia = entraElComprador === -1 ? pasos : pasos.slice(0, entraElComprador);

    return custodia.filter((p) => p.requiredActor === 'seller');
}
```

Para un canal devuelve los tres pasos iniciales más la promoción; para un sitio sigue devolviendo solo la entrega del código de autorización, igual que hoy.

**El momento no viaja en el paso.** Un `stage` en `TransferStep` sería la estrategia opinando sobre operaciones, que no conoce. La pantalla ya sabe si hay contrato firmado, así que agrupa por posición: los pasos anteriores al primero de la plataforma son "ahora", los posteriores son "cuando haya trato". Es una decisión de presentación y vive en la vista.

**Alternativa rechazada** — un método aparte `laterHandoverSteps()`: dos métodos para una lista que la vista igual necesita entera, y con el riesgo de que una pantalla llame a uno y se olvide del otro.

## 3. Los pasos de `YouTubeStrategy`

Se modifica el paso de invitación y se inserta uno nuevo después de la verificación de la plataforma. Los identificadores de paso son posicionales y solo se usan como clave de render —lo verificamos al agregar el opt-out de permisos— así que renumerar es seguro.

| Posición | Actor | Cambio |
|---|---|---|
| 1 | seller | sin cambio |
| 2 | seller | sin cambio (opt-out de permisos de canal) |
| 3 | seller | **cambia**: administrador en vez de propietario, con el alcance |
| 4 | platform | sin cambio |
| 5 | platform | **cambia**: pasa a informativo, sin afirmar que la plataforma se convierte sola |
| **6** | **seller** | **nuevo**: promover a propietario principal, con contrato firmado |
| 7–10 | buyer / platform | renumerados |

El texto exacto está en la propuesta. Lo que importa del diseño: la instrucción del paso 3 enumera **lo que no podemos hacer**, no solo lo que pedimos. Una promesa en negativo es verificable por el vendedor en la interfaz de Google; una en positivo le pide que nos crea.

## 4. El selector de rol en `PlatformAccessForm`

**Se asume administrador y solo se marca la excepción.** Una casilla "quedamos como propietarios" desmarcada por defecto, no un selector con dos opciones equivalentes.

El caso normal es administrador; propietario existe solo para constancias sobre activos donde el vendedor ya nos promovió, o donde el registrador no admite roles. Un selector neutro presentaría como equivalentes dos opciones que no lo son, y el valor por defecto es la decisión de diseño: el mínimo privilegio tiene que ser el camino de menor resistencia.

## 5. El panel del vendedor

El identificador de la cuenta ya llega: `asset-custody-identity` lo hizo viajar en el descriptor de pasos. Lo que falta es **jerarquía visual** — hoy queda embebido en una oración y hay que buscarlo.

Pasa a mostrarse como dato destacado, en monoespaciada, separado del texto, con el rol al lado. Debajo, la lista de lo que no podemos hacer.

Cuando no hay cuenta activa para ese tipo de activo, el panel dice que todavía no podemos recibirlo, en vez de renderizar un instructivo inaplicable. Hoy eso no puede pasar porque la semilla crea dos cuentas, pero un entorno recién levantado sin sembrar sí lo vería.

## 6. Los avisos de las estrategias

`YouTubeStrategy.describe().waitingNotice` pasa a nombrar "administrador o propietario". Es la corrección más chica del cambio y la que más importa: hoy el aviso contradice al paso que se le pide al vendedor.

`WebStrategy.describe().waitingNotice` deja de ser `undefined`. Que no haya espera para *transferir* no significa que no haya nada que avisar: el bloqueo de 60 días entre registradores es una limitación real sobre algo que el comprador acaba de comprar.

## 7. Pruebas

| Qué | Dónde | Capa |
|---|---|---|
| `registerPlatformAccess` exige rol; constancia vieja sin rol sigue válida; el plazo no depende del rol | `tests/PlatformHandover.test.ts` | dominio puro |
| `handoverSteps()` devuelve pasos del vendedor posteriores a los de la plataforma | `tests/PlatformHandover.test.ts` | dominio puro |
| El paso de invitación pide administrador y nombra el alcance; el paso de promoción existe con `requiredActor: 'seller'` | `tests/strategies/TransferSteps.test.ts` | dominio puro |
| Los avisos de plazo de los dos tipos | `tests/AssetTypeDescriptor.test.ts` | dominio puro |
| El rol sobrevive la vuelta por la base y una constancia sin rol se rehidrata | `packages/db/tests/integration.test.ts` | base real |

La prueba de `handoverSteps()` es la que más importa: es el único cambio de comportamiento, y su modo de fallar es silencioso — un paso que no se muestra no rompe nada, solo desinforma.

## 8. Lo que este cambio no toca

`assertCanBeTransferred()`, `confirmAssetCustody()`, `complete()`, la comisión, el orden del escrow, el alta de cuentas de custodia y los pasos de custodia faltantes de `WebStrategy`.
