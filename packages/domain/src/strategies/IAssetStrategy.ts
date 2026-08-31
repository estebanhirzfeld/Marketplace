import { Money } from '../value-objects/Money';
import { VerificationSource } from '../entities/Listing';
import { AssetType } from '@marketplace/shared-types';

export type MetricKey = 'followers' | 'revenue' | 'domainAuthority' | 'sessions' | 'subscribers' | 'engagement';

export interface TransferStep {
    id: string;
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
    requiredActor: 'seller' | 'buyer' | 'platform';
    automated: boolean;
}

/** Cómo hay que interpretar el valor de un campo. El formato lo pone la vista. */
export type AssetFieldKind = 'money' | 'number' | 'percentage' | 'text' | 'boolean' | 'niche';

export interface AssetFieldDescriptor {
    /** La clave tal como sale en `assetData`. */
    key: string;
    /** Con qué nombre mostrarlo. */
    label: string;
    kind: AssetFieldKind;
    /** Si identifica al activo y por lo tanto queda detrás del NDA. */
    confidential: boolean;
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

export interface IAssetStrategy {
    /**
     * Lo que este tipo de activo sabe de sí mismo, para que nadie más tenga
     * que preguntarlo ni deducirlo.
     */
    describe(): AssetTypeDescriptor;

    /**
     * Calcula el precio estimado basado en las métricas del activo
     */
    calculateEstimatedPrice(): Money;

    /**
     * Retorna las métricas que son verificables por API de forma automatizada
     */
    getVerifiableMetrics(): MetricKey[];

    /**
     * Retorna los pasos necesarios para transferir este tipo de activo
     */
    getTransferSteps(): TransferStep[];

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
