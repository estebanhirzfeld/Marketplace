import {
    IContractRepository,
    IListingRepository,
    IOperationRepository,
} from '../../ports/Repositories';
import { Actor } from '../../ports/Actor';
import { Operation } from '../../entities/Operation';
import { ConfidentialAccess } from '../../services/ConfidentialAccess';

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
    /**
     * Cómo se llama el activo. Ausente para quien no tiene acceso a los datos
     * reservados — un comprador que todavía no firmó el acuerdo ve el rubro y
     * el tipo, que es con lo que el mercado lo anuncia.
     */
    name?: string;
}

/** Las operaciones donde el actor es parte, compre o venda. */
export class GetMyOperationsUseCase {
    constructor(
        private readonly operationRepo: IOperationRepository,
        private readonly listingRepo: IListingRepository,
        private readonly contractRepo: IContractRepository,
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

        // Quién puede ver los datos reservados se resuelve una vez por activo y
        // no una por operación: son varias operaciones sobre los mismos pocos
        // activos, y la respuesta solo depende del activo y de quién mira.
        const acceso = new ConfidentialAccess(this.contractRepo);
        const permitido = new Map(
            await Promise.all(
                ids.map(async (id) => {
                    const listing = activos.get(id);
                    return [id, listing ? await acceso.allowed(listing, actor) : false] as const;
                }),
            ),
        );

        return operaciones.map((operation) => {
            const listingId = operation.listingId.toString();
            const listing = activos.get(listingId);
            if (!listing) return { operation };

            const { assetType, assetData } = listing.assetDataFor(permitido.get(listingId) ?? false);
            const name = typeof assetData.name === 'string' ? assetData.name : '';

            return {
                operation,
                assetType,
                niche: typeof assetData.niche === 'string' ? assetData.niche : undefined,
                name: name || undefined,
            };
        });
    }
}
