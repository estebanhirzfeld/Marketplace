import { ICustodyAccountRepository } from '../ports/Repositories';
import { Listing } from '../entities/Listing';
import { DomainName } from '../value-objects/DomainName';
import { UniqueEntityID } from '../value-objects/UniqueEntityID';
import { ValidationError } from '../errors/DomainError';
import { AssetType } from '@marketplace/shared-types';

/** Un sitio web: el activo cuya custodia ocurre durante la operación y no al publicar. */
export function isWebListing(listing: Listing): boolean {
    return listing.describeAssetType().assetType === AssetType.WEB;
}

/**
 * El dominio publicado de un sitio, ya normalizado. Rechaza lo que no es un
 * sitio o no tiene el dominio cargado.
 */
export function websiteDomainOf(listing: Listing): DomainName {
    const { assetType, assetData } = listing.assetDataFor(true);
    if (assetType !== AssetType.WEB) {
        throw new ValidationError('Este activo no es un sitio web.');
    }

    const domain = assetData.domain;
    if (typeof domain !== 'string' || domain.trim() === '') {
        throw new ValidationError('Este activo no tiene cargado el dominio.');
    }

    return DomainName.parse(domain);
}

/**
 * La cuenta de custodia que se congela en la constancia de una operación.
 *
 * Sale del `platformAccess` vigente del listing. Un sitio web puede no tener
 * `platformAccess`: su custodia ocurre en la operación, cuando el dominio llega
 * a la cuenta del registrador, no al publicar. En ese caso se usa la primera
 * cuenta de custodia activa de tipo web —el mismo criterio con que la pantalla
 * nombra la cuenta—, o ninguna si no hay. Con otros activos no se busca nada:
 * sin `platformAccess` la constancia no nombra cuenta.
 */
export async function resolveCustodyAccountId(
    listing: Listing,
    custodyRepo?: ICustodyAccountRepository,
): Promise<UniqueEntityID | undefined> {
    const vigente = listing.platformAccess?.custodyAccountId;
    if (vigente) return vigente;

    if (!custodyRepo || !isWebListing(listing)) return undefined;

    const activas = await custodyRepo.findActive(AssetType.WEB);
    return activas[0]?.id;
}
