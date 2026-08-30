import { AssetType } from '@marketplace/shared-types';
import { IAssetStrategy } from './IAssetStrategy';
import { YouTubeStrategy } from './YouTubeStrategy';
import { WebStrategy } from './WebStrategy';
import { SocialStrategy } from './SocialStrategy';
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
                isMonetized: booleano(assetData, 'isMonetized'),
                growthFactor: numeroOpcional(assetData, 'growthFactor', 1.0),
                audienceTopCountry: textoOpcional(assetData, 'audienceTopCountry', 'AR'),
                hasNoFaceContent: booleanoOpcional(assetData, 'hasNoFaceContent', false),
            });

        case AssetType.WEB:
            return new WebStrategy(
                dinero(assetData, 'monthlyRevenueUsdCents'),
                entero(assetData, 'domainAuthority'),
            );

        case AssetType.INSTAGRAM:
        case AssetType.TIKTOK:
            return new SocialStrategy(
                entero(assetData, 'followers'),
                numero(assetData, 'engagementRate'),
                assetType === AssetType.INSTAGRAM ? AssetType.INSTAGRAM : AssetType.TIKTOK,
            );

        default:
            throw new ValidationError(`Tipo de activo desconocido: ${assetType}`);
    }
}

// ── Lectores validados ───────────────────────────────────
// Cada uno falla con el nombre del campo, para que el error diga qué corregir.

function numero(data: AssetData, campo: string): number {
    const valor = data[campo];
    if (typeof valor !== 'number' || Number.isNaN(valor)) {
        throw new ValidationError(`El campo "${campo}" debe ser un número.`);
    }
    return valor;
}

function entero(data: AssetData, campo: string): number {
    const valor = numero(data, campo);
    if (!Number.isInteger(valor)) {
        throw new ValidationError(`El campo "${campo}" debe ser un número entero.`);
    }
    return valor;
}

function booleano(data: AssetData, campo: string): boolean {
    const valor = data[campo];
    if (typeof valor !== 'boolean') {
        throw new ValidationError(`El campo "${campo}" debe ser true o false.`);
    }
    return valor;
}

function numeroOpcional(data: AssetData, campo: string, porDefecto: number): number {
    return data[campo] === undefined || data[campo] === null
        ? porDefecto
        : numero(data, campo);
}

function booleanoOpcional(data: AssetData, campo: string, porDefecto: boolean): boolean {
    return data[campo] === undefined || data[campo] === null
        ? porDefecto
        : booleano(data, campo);
}

function textoOpcional(data: AssetData, campo: string, porDefecto: string): string {
    const valor = data[campo];
    if (valor === undefined || valor === null) return porDefecto;
    if (typeof valor !== 'string') {
        throw new ValidationError(`El campo "${campo}" debe ser texto.`);
    }
    return valor;
}

/** Money valida que sean centavos enteros y lanza ValidationError por su cuenta. */
function dinero(data: AssetData, campo: string): Money {
    const cents = numero(data, campo);
    const currency = textoOpcional(data, 'currency', 'USD');
    return Money.fromCents(cents, currency);
}
