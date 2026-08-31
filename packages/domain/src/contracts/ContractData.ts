import { ContractType } from '../entities/Contract';

/**
 * Los datos con los que se arma un contrato.
 *
 * Todo sale de la operación, el listing y los usuarios: no hay nada que
 * alguien tipee a mano, así que el documento es reproducible. Regenerarlo con
 * los mismos datos tiene que dar exactamente el mismo texto y el mismo hash.
 */
export interface ContractParty {
    name: string;
    dni: string;
    address?: string;
    email: string;
}

export interface ContractPlatformData {
    legalName: string;
    cuit: string;
    address: string;
    email: string;
}

export interface ContractAssetData {
    type: string;
    description: string;
}

export interface ContractPriceData {
    /** Precio acordado, en centavos. */
    finalCents: number;
    buyerPaysCents: number;
    sellerReceivesCents: number;
    totalCommissionCents: number;
    currency: string;
}

export interface ContractData {
    type: ContractType;
    reference: string;
    date: Date;
    platform: ContractPlatformData;
    seller?: ContractParty;
    buyer?: ContractParty;
    asset: ContractAssetData;
    price?: ContractPriceData;
}

/**
 * Datos de la plataforma pendientes de completar.
 *
 * Son marcadores explícitos y no valores inventados: un contrato con una razón
 * social falsa es peor que uno que dice claramente qué falta.
 */
export const PLATFORM_PENDING: ContractPlatformData = {
    legalName: '[RAZÓN SOCIAL DE LA PLATAFORMA]',
    cuit: '[CUIT]',
    address: '[DOMICILIO LEGAL]',
    email: '[EMAIL DE CONTACTO]',
};
