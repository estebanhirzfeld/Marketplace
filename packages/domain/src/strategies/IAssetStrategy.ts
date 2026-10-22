import { Money } from '../value-objects/Money';
import { DomainName } from '../value-objects/DomainName';
import { VerificationSource } from '../entities/Listing';
import { DomainRegistryRecord } from '../ports/IDomainRegistryLookup';
import { AssetType } from '@marketplace/shared-types';

/**
 * Los hechos con los que una estrategia decide si el activo está listo para
 * firmar. Los trae quien llama: la estrategia no consulta nada.
 */
export interface TransferReadinessFacts {
    now: Date;
    /** Desde cuándo la plataforma tiene acceso al activo, si lo tiene. */
    platformAccessSince?: Date;
    /**
     * Lo que dice el registro del dominio. `undefined` si no hubo dominio que
     * consultar; `null` si el registro no lo conoce.
     */
    domainRegistry?: DomainRegistryRecord | null;
}

/** Si el activo puede pasar a custodia sin esperas y, si no, qué hacer. */
export type TransferReadiness = { ready: true } | { ready: false; instruction: string };

export type MetricKey = 'followers' | 'revenue' | 'sessions' | 'subscribers' | 'engagement';

/** Un enlace directo a la pantalla donde se hace el paso. */
export interface TransferStepLink {
    label: string;
    href: string;
}

/**
 * En qué momento de la vida del activo le toca el paso al vendedor.
 *
 * - `listing`: mientras está publicado. Es lo único que se le explica antes de
 *   que haya un comprador: sumarnos con permisos mínimos, sin ceder control.
 * - `operation`: con una venta en curso, el contrato firmado y la espera de la
 *   plataforma del activo cumplida. Es cuando recién tiene sentido pedirle que
 *   quite su acceso directo o que nos ceda la titularidad.
 */
export type TransferPhase = 'listing' | 'operation';

/**
 * En qué tramo del escrow cae un paso, en orden: mientras está publicado, la
 * custodia, el pago, la entrega al comprador y el cierre. La fase de las
 * pantallas se deriva de acá: `listing` es la publicación, lo demás es la
 * operación.
 */
export type TransferStage = 'listing' | 'custody' | 'payment' | 'delivery' | 'closing';

/** El orden de las etapas, para ordenar los pasos. */
export const TRANSFER_STAGE_ORDER: readonly TransferStage[] = ['listing', 'custody', 'payment', 'delivery', 'closing'];

/**
 * Lo que un paso traba mientras no se cumple: la firma del tripartito, la
 * custodia, el pago, la recepción del comprador o el cierre. Ausente en los
 * pasos informativos.
 */
export type TransferGate = 'sign' | 'custody' | 'payment' | 'receipt' | 'complete';

/**
 * Quién da fe de que un paso se cumplió.
 *
 * - `automatic`: lo comprueba el sistema solo, con una señal externa o el paso
 *   del tiempo.
 * - `declared`: lo declara la parte que lo hace y el admin lo respalda.
 * - `admin`: lo hace y lo atestigua una persona de la plataforma.
 */
export type TransferStepCheck = 'automatic' | 'declared' | 'admin';

export interface TransferStep {
    id: string;
    /**
     * Clave estable del paso, única dentro de la estrategia. A diferencia de
     * `id`, que es posicional, no cambia si se agrega o se mueve un paso: es lo
     * que permite guardar el progreso de cada uno.
     */
    key: string;
    /** En qué tramo del escrow cae. Lo declara todo paso, de cualquier parte. */
    stage: TransferStage;
    /** Lo que el paso traba mientras no se cumple. */
    gate?: TransferGate;
    /** Qué pasa en este paso, contado en tercera persona. */
    description: string;
    /**
     * El mismo paso dicho a quien lo tiene que hacer.
     *
     * La descripción sirve para leer el recorrido de afuera —es la que ve la
     * plataforma cuando atestigua lo que el vendedor cumplió— pero decirle a
     * alguien "el vendedor invita a la plataforma" cuando ese alguien ES el
     * vendedor es hablarle de un tercero. Se escribe, no se deriva: conjugar
     * a mano un texto ajeno sale mal.
     */
    instruction?: string;
    /** Título corto del paso, para el carrusel de instrucciones. */
    title?: string;
    /**
     * El detalle de `instruction` en viñetas cortas, de a una idea. Existe para
     * que el paso no sea una pared de texto: `instruction` queda en una oración
     * y todo lo demás —avisos incluidos— viaja acá.
     */
    details?: string[];
    /** Enlaces directos a las pantallas de la plataforma del activo. */
    links?: TransferStepLink[];
    requiredActor: 'seller' | 'buyer' | 'platform';
    /** Quién da fe de que el paso se cumplió. */
    check: TransferStepCheck;
}

/**
 * Los identificadores concretos que los pasos de traspaso pueden nombrar.
 *
 * Ninguna cuenta queda escrita en una estrategia: la estrategia sabe CÓMO se
 * dice el paso en su plataforma, y quien la llama sabe QUIÉN es. Todo es
 * opcional porque el catálogo muestra los pasos antes de que exista ninguna
 * operación, y ahí la variante genérica es la correcta.
 */
export interface TransferContext {
    /** La cuenta de custodia que el vendedor tiene que invitar. */
    custodyAccountIdentifier?: string;
    /** La cuenta receptora que el comprador declaró en la operación. */
    recipientIdentifier?: string;
}

/** Cómo hay que interpretar el valor de un campo. El formato lo pone la vista. */
export type AssetFieldKind = 'money' | 'number' | 'percentage' | 'text' | 'boolean' | 'niche' | 'date';

export interface AssetFieldDescriptor {
    /** La clave tal como sale en `assetData`. */
    key: string;
    /** Con qué nombre mostrarlo. */
    label: string;
    kind: AssetFieldKind;
    /** Si identifica al activo y por lo tanto queda detrás del NDA. */
    confidential: boolean;
    /** Dato de la valuación que las vistas no muestran a vendedores ni compradores. */
    internal?: boolean;
}

/**
 * Lo que un tipo de activo sabe de sí mismo.
 *
 * Existe porque la interfaz venía preguntando "¿de qué tipo sos?" y decidiendo
 * por su cuenta —qué etiqueta poner, contra qué fuente comprobar la
 * titularidad, cuántos días esperar—, y esas decisiones ya vivían acá. El
 * resultado de esa duplicación fue un cartel que le anunciaba a un sitio web
 * que "YouTube exige esperar siete días".
 *
 * Lo que viaja es semántica: claves, tipos de dato, cuál campo identifica al
 * activo, y los textos que solo este tipo puede escribir sobre sí mismo. Cómo
 * se dibuja eso —colores, orden, separadores de miles— sigue siendo de la
 * vista, así que el dominio no se entera de que existe una pantalla.
 */
export interface AssetTypeDescriptor {
    assetType: AssetType;
    /** El tipo, nombrado para una persona: "Canal de YouTube", "Sitio web". */
    label: string;
    /** El dato que identifica al activo. Siempre reservado, por definición. */
    identityField: AssetFieldDescriptor;
    /** Todos los campos de `assetData`, en orden de presentación. */
    fields: AssetFieldDescriptor[];
    /** Qué campos públicos resumen el activo en una tarjeta, en orden. */
    summaryMetricKeys: string[];
    /** Contra qué fuente se comprueba la titularidad. */
    ownershipSource: VerificationSource;
    /** El mismo valor que `transferWaitingDays()`, para viajar en el descriptor. */
    transferWaitingDays: number;
    /** El mismo valor que `requiresPlatformAccess()`, para viajar en el descriptor. */
    requiresPlatformAccess: boolean;
    /**
     * Por qué la cesión del acceso la registra una persona y no un programa.
     * Cada plataforma tiene su propio motivo y sus propias palabras.
     */
    handoverNotice: string;
    /**
     * Por qué hay que esperar antes de poder transferir. Ausente cuando no hay
     * espera: un activo que se transfiere de inmediato no tiene nada que
     * justificar, y un texto genérico ahí sería relleno.
     */
    waitingNotice?: string;
    /**
     * Qué pasa con el ingreso declarado: si alguna fuente lo comprueba o si
     * queda como declaración jurada. Es la asimetría entre los tipos de activo
     * y hay que poder contarla sin que la pantalla sepa cuál es cuál.
     */
    revenueNotice: string;
}

/**
 * Largo máximo de la cuenta receptora, en caracteres.
 *
 * Es el límite de una dirección de correo según la RFC 5321, y el mismo que ya
 * declara el esquema de la ruta que recibe el dato. Vive acá para que el
 * dominio lo imponga por su cuenta y no dependa de que alguien se acuerde de
 * repetirlo en cada capa de transporte.
 */
export const MAX_RECIPIENT_IDENTIFIER_LENGTH = 320;

export interface IAssetStrategy {
    /**
     * Lo que este tipo de activo sabe de sí mismo, para que nadie más tenga
     * que preguntarlo ni deducirlo.
     */
    describe(): AssetTypeDescriptor;

    /**
     * Comprueba la cuenta donde el comprador quiere recibir el activo y la
     * devuelve normalizada. Lanza `ValidationError` si no sirve.
     *
     * El dato no es el mismo en todos los tipos de activo: para un canal es la
     * cuenta de Google que va a recibir la invitación, y ahí exigir el formato
     * de una dirección de correo es correcto; para un dominio es el usuario del
     * registrador, que cambia de proveedor a proveedor y no tiene forma
     * canónica que se pueda comprobar. Por eso lo decide cada estrategia.
     *
     * Importa que sea estricto donde se puede: el identificador se copia tal
     * cual a la constancia de entrega cuando la operación se cierra, y ahí ya
     * no se corrige.
     */
    normalizeRecipientIdentifier(identifier: string): string;

    /**
     * Calcula el precio estimado basado en las métricas del activo
     */
    calculateEstimatedPrice(): Money;

    /**
     * Retorna las métricas que son verificables por API de forma automatizada
     */
    getVerifiableMetrics(): MetricKey[];

    /**
     * Retorna los pasos necesarios para transferir este tipo de activo.
     *
     * Con `context`, los pasos que nombran una cuenta —la invitación del
     * vendedor a la custodia, la invitación de la plataforma al comprador— usan
     * el identificador concreto. Sin `context`, la variante genérica del
     * catálogo.
     */
    getTransferSteps(context?: TransferContext): TransferStep[];

    /**
     * Días que deben pasar entre que la plataforma obtiene acceso al activo y
     * que puede tomar la custodia efectiva.
     *
     * La espera la impone la plataforma del activo, no nosotros: YouTube exige
     * haber sido propietario 7 días o más antes de permitir el cambio de
     * propietario principal. Un sitio web no tiene ninguna ventana.
     */
    transferWaitingDays(): number;

    /**
     * Si el activo puede pasar a custodia sin esperas: es la condición para
     * firmar el tripartito, porque después de firmar nadie se puede bajar.
     * Pura: los hechos los trae quien llama.
     */
    transferReadiness(facts: TransferReadinessFacts): TransferReadiness;

    /**
     * Si la custodia depende de un acceso que la plataforma registra antes de
     * firmar. Un canal sí; un sitio entra en custodia por un traslado durante
     * la operación.
     */
    requiresPlatformAccess(): boolean;

    /** El dominio a consultar en el registro público antes de firmar, si hay uno. */
    registryDomain(): DomainName | undefined;

    /**
     * Retorna los nombres de los atributos que se pueden mostrar públicamente (pre-NDA)
     */
    getPublicFields(): string[];

    /**
     * Retorna los nombres de los atributos que requieren NDA para ser vistos
     */
    getConfidentialFields(): string[];

    /**
     * Serializa la estrategia para persistencia
     */
    toJSON(): { assetType: AssetType; assetData: Record<string, any> };
}
