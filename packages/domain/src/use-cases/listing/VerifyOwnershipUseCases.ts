import { IListingRepository } from '../../ports/Repositories';
import { IYouTubeChannelReader } from '../../ports/IYouTubeChannelReader';
import {
    IAdSenseReader,
    IDnsResolver,
    IOwnershipChallengeIssuer,
    IYouTubeOwnershipReader,
} from '../../ports/IOwnershipReaders';
import { Actor } from '../../ports/Actor';
import { YouTubeChannelRef } from '../../value-objects/YouTubeChannelRef';
import { DomainName } from '../../value-objects/DomainName';
import { UniqueEntityID } from '../../value-objects/UniqueEntityID';
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

        const domain = siteDomain(listing).value;

        const ingreso = await this.adsense.monthlyEarningsFor(grant, domain);
        if (!ingreso) {
            throw new ForbiddenError(
                'Esa cuenta de AdSense no reporta ingresos para este dominio. ' +
                'Ingresá con la cuenta que monetiza el sitio.',
            );
        }

        listing.registerOwnershipVerification({
            verifiedBy: listing.sellerId,
            assetId: domain,
            source: 'adsense',
            monthlyRevenueCents: ingreso.earningsCents,
        });

        await this.listingRepo.save(listing);

        return listing.ownershipVerification!;
    }
}

/** El dominio publicado de un sitio, ya normalizado. Rechaza lo que no es un sitio. */
function siteDomain(listing: Listing): DomainName {
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

export interface DomainOwnershipChallenge {
    domain: string;
    /**
     * Dónde se carga el registro: `@` si el dominio es la raíz de una zona
     * (tiene servidores de nombres propios) o el nombre completo si es un
     * subdominio, porque el TXT va justo en el nombre que se verifica.
     */
    host: string;
    /** El valor completo del registro TXT. */
    value: string;
    /** Servidores de nombres del dominio, para que la pantalla deduzca el proveedor. */
    nameservers: string[];
}

/**
 * Le dice al vendedor qué registro TXT cargar para demostrar que controla el
 * dominio del sitio.
 *
 * Poder editar el DNS de un dominio es lo que distingue a quien lo controla de
 * quien solo conoce su nombre. El valor se deriva del listing y del dominio, así
 * que pedirlo no escribe nada.
 */
export class GetDomainOwnershipChallengeUseCase {
    constructor(
        private readonly listingRepo: IListingRepository,
        private readonly issuer: IOwnershipChallengeIssuer,
        private readonly resolver: IDnsResolver,
    ) {}

    async execute(listingId: string, actor: Actor): Promise<DomainOwnershipChallenge> {
        const listing = await cargar(this.listingRepo, listingId, actor);
        const domain = siteDomain(listing).value;
        const nameservers = await this.resolver.nameserversOf(domain);

        return {
            domain,
            // Sin servidores de nombres propios no es la raíz de una zona.
            host: nameservers.length > 0 ? '@' : domain,
            value: this.issuer.tokenFor(listing.id.toString(), domain),
            nameservers,
        };
    }
}

/**
 * Comprueba que el registro TXT expected ya está publicado en el DNS del
 * dominio del sitio.
 *
 * Que todavía no esté no es un error: el vendedor lo carga y la propagación
 * tarda, así que la respuesta es `verified: false` y la pantalla sigue
 * esperando. Esto prueba control del DNS, no quién figura como titular del
 * dominio en el registrador.
 *
 * Es idempotente: con una constancia por DNS del mismo dominio no vuelve a
 * consultar ni a guardar. Revocar la constancia si el registro se borra queda
 * fuera de este caso de uso.
 */
export class VerifyDomainOwnershipUseCase {
    constructor(
        private readonly listingRepo: IListingRepository,
        private readonly issuer: IOwnershipChallengeIssuer,
        private readonly resolver: IDnsResolver,
    ) {}

    async execute(listingId: string, actor: Actor): Promise<{ verified: boolean }> {
        const listing = await cargar(this.listingRepo, listingId, actor);
        const domain = siteDomain(listing).value;

        if (isAlreadyVerified(listing, domain)) {
            return { verified: true };
        }

        const expected = this.issuer.tokenFor(listing.id.toString(), domain);
        const published = await this.resolver.txtRecordsOf(domain);
        if (!published.some((record) => record.trim() === expected)) {
            return { verified: false };
        }

        listing.registerOwnershipVerification({
            verifiedBy: listing.sellerId,
            assetId: domain,
            source: 'dns',
        });

        await this.listingRepo.save(listing);

        return { verified: true };
    }
}

/**
 * Si el dominio ya tiene una constancia de titularidad, sea por DNS o por
 * AdSense, no hay nada que comprobar. Pisar la de AdSense perdería los
 * ingresos verificados que trae.
 */
function isAlreadyVerified(listing: Listing, domain: string): boolean {
    const previous = listing.ownershipVerification;
    if (previous?.source !== 'dns' && previous?.source !== 'adsense') {
        return false;
    }

    try {
        return DomainName.parse(previous.assetId).value === domain;
    } catch {
        return false;
    }
}
