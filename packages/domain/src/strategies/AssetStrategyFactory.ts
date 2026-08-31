import { ASSET_NICHES, AssetNiche, AssetType } from '@marketplace/shared-types';
import { AssetTypeDescriptor, IAssetStrategy } from './IAssetStrategy';
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
/**
 * Lo que sabe de sí mismo cada tipo de activo que la plataforma acepta.
 *
 * Se arma con valores mínimos porque el descriptor no depende de los datos del
 * activo sino de su tipo: describe la forma, no el contenido. Sirve para las
 * pantallas que todavía no tienen un activo —el formulario de publicar, los
 * filtros del mercado— y para no repetir el descriptor en cada fila de una
 * grilla.
 *
 * Recorre el enum en vez de una lista escrita a mano: agregar un tipo de
 * activo no debería exigir acordarse de sumarlo también acá.
 */
export function describeAssetTypes(): AssetTypeDescriptor[] {
    return Object.values(AssetType).map((assetType) =>
        createAssetStrategy(assetType, MUESTRA[assetType]).describe(),
    );
}

/** Lo mínimo que cada estrategia exige para construirse. */
const MUESTRA: Record<AssetType, AssetData> = {
    [AssetType.YOUTUBE]: {
        monthlyRevenueUsdCents: 0,
        subscribers: 0,
        isMonetized: false,
    },
    [AssetType.WEB]: {
        monthlyRevenueUsdCents: 0,
        domainAuthority: 0,
    },
};

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
                name: textoOpcional(assetData, 'name', ''),
                niche: rubro(assetData),
            });

        case AssetType.WEB:
            return new WebStrategy(
                dinero(assetData, 'monthlyRevenueUsdCents'),
                entero(assetData, 'domainAuthority'),
                textoOpcional(assetData, 'domain', ''),
                rubro(assetData),
                textoOpcional(assetData, 'name', ''),
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

/**
 * El rubro se valida contra la lista cerrada porque se puede filtrar por él:
 * un valor libre haría que ese filtro no encuentre nada sin explicar por qué.
 * Ausente cae en `other`, que es lo que tienen las publicaciones anteriores a
 * que el campo existiera.
 */
function rubro(data: AssetData): AssetNiche {
    const value = textoOpcional(data, 'niche', AssetNiche.OTHER);
    if (!ASSET_NICHES.includes(value as AssetNiche)) {
        throw new ValidationError(`Rubro desconocido: ${value}`);
    }
    return value as AssetNiche;
}

/** Money valida que sean centavos enteros y lanza ValidationError por su cuenta. */
function dinero(data: AssetData, field: string): Money {
    const cents = readNumber(data, field);
    const currency = textoOpcional(data, 'currency', 'USD');
    return Money.fromCents(cents, currency);
}
