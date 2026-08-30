import { AssetType } from '@marketplace/shared-types';
import { IAssetStrategy } from './IAssetStrategy';
import { YouTubeStrategy } from './YouTubeStrategy';
import { WebStrategy } from './WebStrategy';
import { Money } from '../value-objects/Money';
import { ValidationError } from '../errors/DomainError';

type AssetData = Record<string, unknown>;

/**
 * Reconstruye una IAssetStrategy desde su forma serializada.
 *
 * Es la contraparte exacta de `IAssetStrategy.toJSON()`, y por eso vive en el
 * dominio: saber qué tipos de activo existen y cómo se arman es una regla de
 * negocio, no un detalle de persistencia. Antes este mapeo estaba únicamente
 * dentro de `ListingMapper` en packages/db, lo que dejaba a la capa HTTP sin
 * forma de crear un listing.
 *
 * Valida en serio porque recibe datos de dos orígenes con distinta confianza:
 * filas propias de la base y bodies de requests ajenos. Validar los dos cuesta
 * poco y evita tener dos caminos con distinto rigor.
 */
export function createAssetStrategy(assetType: string, assetData: AssetData): IAssetStrategy {
    switch (assetType) {
        case AssetType.YOUTUBE:
            return new YouTubeStrategy({
                monthlyRevenueUsd: dinero(assetData, 'monthlyRevenueUsdCents'),
                subscribers: entero(assetData, 'subscribers'),
                isMonetized: readBoolean(assetData, 'isMonetized'),
                growthFactor: numeroOpcional(assetData, 'growthFactor', 1.0),
                audienceTopCountry: textoOpcional(assetData, 'audienceTopCountry', 'AR'),
                hasNoFaceContent: booleanoOpcional(assetData, 'hasNoFaceContent', false),
                channelUrl: textoOpcional(assetData, 'channelUrl', ''),
            });

        case AssetType.WEB:
            return new WebStrategy(
                dinero(assetData, 'monthlyRevenueUsdCents'),
                entero(assetData, 'domainAuthority'),
                textoOpcional(assetData, 'domain', ''),
            );


        default:
            throw new ValidationError(`Tipo de activo desconocido: ${assetType}`);
    }
}

// ── Lectores validados ───────────────────────────────────
// Cada uno falla con el nombre del campo, para que el error diga qué corregir.

function readNumber(data: AssetData, field: string): number {
    const value = data[field];
    if (typeof value !== 'number' || Number.isNaN(value)) {
        throw new ValidationError(`El campo "${field}" debe ser un número.`);
    }
    return value;
}

function entero(data: AssetData, field: string): number {
    const value = readNumber(data, field);
    if (!Number.isInteger(value)) {
        throw new ValidationError(`El campo "${field}" debe ser un número entero.`);
    }
    return value;
}

function readBoolean(data: AssetData, field: string): boolean {
    const value = data[field];
    if (typeof value !== 'boolean') {
        throw new ValidationError(`El campo "${field}" debe ser true o false.`);
    }
    return value;
}

function numeroOpcional(data: AssetData, field: string, porDefecto: number): number {
    return data[field] === undefined || data[field] === null
        ? porDefecto
        : readNumber(data, field);
}

function booleanoOpcional(data: AssetData, field: string, porDefecto: boolean): boolean {
    return data[field] === undefined || data[field] === null
        ? porDefecto
        : readBoolean(data, field);
}

function textoOpcional(data: AssetData, field: string, porDefecto: string): string {
    const value = data[field];
    if (value === undefined || value === null) return porDefecto;
    if (typeof value !== 'string') {
        throw new ValidationError(`El campo "${field}" debe ser texto.`);
    }
    return value;
}

/** Money valida que sean centavos enteros y lanza ValidationError por su cuenta. */
function dinero(data: AssetData, field: string): Money {
    const cents = readNumber(data, field);
    const currency = textoOpcional(data, 'currency', 'USD');
    return Money.fromCents(cents, currency);
}
