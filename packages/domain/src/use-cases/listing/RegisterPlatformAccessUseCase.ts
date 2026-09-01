import {
    IListingRepository,
    ICustodyAccountRepository,
} from '../../ports/Repositories';
import { Actor, assertIsAdmin } from '../../ports/Actor';
import { NotFoundError, ValidationError } from '../../errors/DomainError';
import { UniqueEntityID } from '../../value-objects/UniqueEntityID';

export interface RegisterPlatformAccessInput {
    /** Desde cuándo la plataforma figura con acceso, en formato ISO. */
    accessSince: string;
    /** A qué cuenta de custodia se cedió el activo. Obligatorio desde este cambio. */
    custodyAccountId: string;
    notes?: string;
}

/**
 * Un admin deja constancia de que la plataforma obtuvo acceso al activo.
 *
 * Es manual porque no hay alternativa: la API de YouTube no expone si un canal
 * es Cuenta de Marca ni quiénes son sus propietarios, así que ningún software
 * puede comprobar este estado. Lo que sí se deriva de la fecha registrada es
 * cuándo el activo queda efectivamente transferible.
 *
 * Ahora exige nombrar la cuenta de custodia: una constancia que no dice a qué
 * cuenta se cedió el activo deja al vendedor sin saber a quién invitar, que es
 * exactamente el hueco que este cambio cierra. Las reglas de la cuenta —que
 * esté activa y sea del tipo correcto— viven en la entidad `CustodyAccount`;
 * el use case solo trae el agregado.
 */
export class RegisterPlatformAccessUseCase {
    constructor(
        private readonly listingRepo: IListingRepository,
        private readonly custodyRepo: ICustodyAccountRepository,
    ) {}

    async execute(listingId: string, input: RegisterPlatformAccessInput, actor: Actor): Promise<void> {
        assertIsAdmin(actor);

        const listing = await this.listingRepo.findById(listingId);
        if (!listing) {
            throw new NotFoundError('Activo no encontrado');
        }

        const accessSince = new Date(input.accessSince);
        if (Number.isNaN(accessSince.getTime())) {
            throw new ValidationError('La fecha de acceso no es válida.');
        }

        if (!input.custodyAccountId) {
            throw new ValidationError('Indicá a qué cuenta de custodia se cedió el activo.');
        }

        const account = await this.custodyRepo.findById(input.custodyAccountId);
        if (!account) {
            throw new NotFoundError('Cuenta de custodia no encontrada');
        }

        account.assertCanHold(listing.describeAssetType().assetType);
        account.assertIsActive();

        listing.registerPlatformAccess({
            verifiedBy: new UniqueEntityID(actor.id),
            custodyAccountId: account.id,
            accessSince,
            notes: input.notes,
        });

        await this.listingRepo.save(listing);
    }
}

/**
 * Borra la constancia cuando la plataforma perdió el acceso.
 *
 * El vendedor sigue siendo propietario principal durante la espera y puede
 * expulsar a la plataforma sin que ninguna API nos lo avise. Sin esta salida,
 * un listing seguiría anunciándose como transferible después de dejar de serlo.
 */
export class RevokePlatformAccessUseCase {
    constructor(private readonly listingRepo: IListingRepository) {}

    async execute(listingId: string, actor: Actor): Promise<void> {
        assertIsAdmin(actor);

        const listing = await this.listingRepo.findById(listingId);
        if (!listing) {
            throw new NotFoundError('Activo no encontrado');
        }

        listing.revokePlatformAccess();

        await this.listingRepo.save(listing);
    }
}
