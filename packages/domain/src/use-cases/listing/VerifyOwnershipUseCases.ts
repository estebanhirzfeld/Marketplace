import { IListingRepository } from '../../ports/Repositories';
import { IYouTubeChannelReader } from '../../ports/IYouTubeChannelReader';
import { IAdSenseReader, IYouTubeOwnershipReader } from '../../ports/IOwnershipReaders';
import { Actor } from '../../ports/Actor';
import { YouTubeChannelRef } from '../../value-objects/YouTubeChannelRef';
import { Listing, OwnershipVerification } from '../../entities/Listing';
import { ForbiddenError, NotFoundError, ValidationError } from '../../errors/DomainError';
import { AssetType, UserRole } from '@marketplace/shared-types';

/**
 * Solo el vendedor del activo o un admin. La comprobación revela el
 * identificador canónico del activo, que en un listing blind es justamente el
 * dato reservado.
 */
function assertPuedeVerificar(listing: Listing, actor: Actor): void {
    if (actor.role !== UserRole.ADMIN && !listing.isOwnedBy(actor.id)) {
        throw new ForbiddenError('Solo el vendedor o la plataforma pueden verificar este activo.');
    }
}

async function cargar(repo: IListingRepository, listingId: string, actor: Actor): Promise<Listing> {
    const listing = await repo.findById(listingId);
    if (!listing) {
        throw new NotFoundError('Activo no encontrado');
    }
    assertPuedeVerificar(listing, actor);
    return listing;
}

/**
 * Comprueba que el vendedor controla el canal que publicó.
 *
 * Es la verificación que elimina el fraude principal de este mercado: vender
 * un canal ajeno. A diferencia de las métricas, acá no se contrasta un número
 * declarado contra otro informado — se le pregunta a Google qué canales
 * controla quien acaba de autorizar, y se busca el publicado entre ellos.
 *
 * La dirección publicada puede ser un handle y la respuesta trae IDs, así que
 * primero se resuelve el handle a su identificador canónico. Comparar handles
 * sería frágil: se pueden cambiar.
 */
export class VerifyChannelOwnershipUseCase {
    constructor(
        private readonly listingRepo: IListingRepository,
        private readonly ownershipReader: IYouTubeOwnershipReader,
        private readonly channelReader: IYouTubeChannelReader,
    ) {}

    async execute(listingId: string, grant: string, actor: Actor): Promise<OwnershipVerification> {
        const listing = await cargar(this.listingRepo, listingId, actor);

        const { assetType, assetData } = listing.assetDataFor(true);
        if (assetType !== AssetType.YOUTUBE) {
            throw new ValidationError('Este activo no es un canal de YouTube.');
        }

        const declarada = assetData.channelUrl;
        if (typeof declarada !== 'string' || declarada.trim() === '') {
            throw new ValidationError('Este activo no tiene cargada la dirección del canal.');
        }

        // Un handle se puede cambiar; el ID no. Se compara por ID.
        const ref = YouTubeChannelRef.parse(declarada);
        const publicado = await this.channelReader.read(ref);
        if (!publicado) {
            throw new NotFoundError('No encontramos en YouTube el canal que publicaste.');
        }

        const propios = await this.ownershipReader.channelsOf(grant);
        const encontrado = propios.find((c) => c.channelId === publicado.channelId);

        if (!encontrado) {
            throw new ForbiddenError(
                'La cuenta de Google con la que ingresaste no controla el canal publicado. ' +
                'Revisá que hayas elegido la cuenta correcta: si el canal es una Cuenta de Marca, ' +
                'tenés que seleccionarla al iniciar sesión.',
            );
        }

        listing.registerOwnershipVerification({
            verifiedBy: listing.sellerId,
            assetId: publicado.channelId,
            source: 'youtube',
        });

        await this.listingRepo.save(listing);

        return listing.ownershipVerification!;
    }
}

/**
 * Comprueba el ingreso de un sitio web contra AdSense.
 *
 * Es la única de las verificaciones que alcanza el dato que fija el precio, y
 * por eso vale más que todas las demás juntas: el ingreso lo informa Google,
 * no el vendedor. En YouTube esto no tiene equivalente —las propiedades de
 * YouTube quedaron fuera de los reportes de la API de AdSense—, así que la
 * asimetría entre los dos tipos de activo es real y conviene mostrarla.
 *
 * Que la cuenta reporte ese dominio prueba dos cosas de una: que el vendedor
 * controla la cuenta que cobra, y que ese sitio es el que genera el ingreso.
 */
export class VerifyWebsiteRevenueUseCase {
    constructor(
        private readonly listingRepo: IListingRepository,
        private readonly adsense: IAdSenseReader,
    ) {}

    async execute(listingId: string, grant: string, actor: Actor): Promise<OwnershipVerification> {
        const listing = await cargar(this.listingRepo, listingId, actor);

        const { assetType, assetData } = listing.assetDataFor(true);
        if (assetType !== AssetType.WEB) {
            throw new ValidationError('Este activo no es un sitio web.');
        }

        const domain = assetData.domain;
        if (typeof domain !== 'string' || domain.trim() === '') {
            throw new ValidationError('Este activo no tiene cargado el dominio.');
        }

        const ingreso = await this.adsense.monthlyEarningsFor(grant, domain.trim());
        if (!ingreso) {
            throw new ForbiddenError(
                'Esa cuenta de AdSense no reporta ingresos para este dominio. ' +
                'Ingresá con la cuenta que monetiza el sitio.',
            );
        }

        listing.registerOwnershipVerification({
            verifiedBy: listing.sellerId,
            assetId: domain.trim(),
            source: 'adsense',
            monthlyRevenueCents: ingreso.earningsCents,
        });

        await this.listingRepo.save(listing);

        return listing.ownershipVerification!;
    }
}
