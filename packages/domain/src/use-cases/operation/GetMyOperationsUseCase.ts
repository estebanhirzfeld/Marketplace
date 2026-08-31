import { IListingRepository, IOperationRepository } from '../../ports/Repositories';
import { Actor } from '../../ports/Actor';
import { Operation } from '../../entities/Operation';

/**
 * Una operación con lo mínimo para poder nombrarla en una lista.
 *
 * El tipo y el rubro son campos que la strategy declara públicos —los mismos
 * que el mercado muestra sin pedir NDA—, así que acompañarlos acá no revela la
 * identidad del activo: no dice qué canal ni qué dominio es.
 *
 * Vienen sueltos y no dentro de la operación porque no le pertenecen: la
 * operación es un acuerdo entre dos partes sobre un activo, y el activo se
 * describe a sí mismo.
 */
export interface MyOperationView {
    operation: Operation;
    /** Ausentes si el activo ya no está: la operación sigue siendo válida. */
    assetType?: string;
    niche?: string;
}

/** Las operaciones donde el actor es parte, compre o venda. */
export class GetMyOperationsUseCase {
    constructor(
        private readonly operationRepo: IOperationRepository,
        private readonly listingRepo: IListingRepository,
    ) {}

    async execute(actor: Actor): Promise<MyOperationView[]> {
        const operaciones = await this.operationRepo.findByParty(actor.id);

        // Los activos se piden en paralelo: son lecturas independientes y la
        // lista es corta. Varias operaciones pueden apuntar al mismo activo,
        // así que se resuelve una sola vez por id.
        const ids = [...new Set(operaciones.map((op) => op.listingId.toString()))];
        const activos = new Map(
            await Promise.all(
                ids.map(async (id) => [id, await this.listingRepo.findById(id)] as const),
            ),
        );

        return operaciones.map((operation) => {
            const listing = activos.get(operation.listingId.toString());
            if (!listing) return { operation };

            // `false` porque esto es una lista: alcanza con lo público, y así
            // no hay forma de que un dato reservado se escape por acá.
            const { assetType, assetData } = listing.assetDataFor(false);

            return {
                operation,
                assetType,
                niche: typeof assetData.niche === 'string' ? assetData.niche : undefined,
            };
        });
    }
}
