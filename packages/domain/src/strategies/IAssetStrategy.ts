import { Money } from '../value-objects/Money';

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
    toJSON(): { assetType: string; assetData: Record<string, any> };
}
