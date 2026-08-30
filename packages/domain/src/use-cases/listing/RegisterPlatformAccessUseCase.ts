import { IListingRepository } from '../../ports/Repositories';
import { Actor, assertIsAdmin } from '../../ports/Actor';
import { NotFoundError, ValidationError } from '../../errors/DomainError';
import { UniqueEntityID } from '../../value-objects/UniqueEntityID';

export interface RegisterPlatformAccessInput {
    /** Desde cuándo la plataforma figura con acceso, en formato ISO. */
    accessSince: string;
    notes?: string;
}

/**
 * Un admin deja constancia de que la plataforma obtuvo acceso al activo.
 *
 * Es manual porque no hay alternativa: la API de YouTube no expone si un canal
 * es Cuenta de Marca ni quiénes son sus propietarios, así que ningún software
 * puede comprobar este estado. Lo que sí se deriva de la fecha registrada es
 * cuándo el activo queda efectivamente transferible.
 */
export class RegisterPlatformAccessUseCase {
    constructor(private readonly listingRepo: IListingRepository) {}

    async execute(listingId: string, input: RegisterPlatformAccessInput, actor: Actor): Promise<void> {
        assertIsAdmin(actor);

        const listing = await this.listingRepo.findById(listingId);
        if (!listing) {
            throw new NotFoundError('Listing no encontrado');
        }

        const accessSince = new Date(input.accessSince);
        if (Number.isNaN(accessSince.getTime())) {
            throw new ValidationError('La fecha de acceso no es válida.');
        }

        listing.registerPlatformAccess({
            verifiedBy: new UniqueEntityID(actor.id),
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
            throw new NotFoundError('Listing no encontrado');
        }

        listing.revokePlatformAccess();

        await this.listingRepo.save(listing);
    }
}
