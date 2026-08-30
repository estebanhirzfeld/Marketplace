import { Money } from '../value-objects/Money';
import { AssetType } from '@marketplace/shared-types';

export type MetricKey = 'followers' | 'revenue' | 'domainAuthority' | 'sessions' | 'subscribers' | 'engagement';

export interface TransferStep {
    id: string;
    description: string;
    requiredActor: 'seller' | 'buyer' | 'platform';
    automated: boolean;
}

export interface IAssetStrategy {
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
