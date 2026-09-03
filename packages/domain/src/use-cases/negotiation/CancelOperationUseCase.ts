import { IUnitOfWork } from '../../ports/IUnitOfWork';
import { Actor } from '../../ports/Actor';
import { NotFoundError } from '../../errors/DomainError';

/**
 * Cancelar una operación.
 *
 * Si la operación ya había sido aceptada, el activo está fuera del mercado:
 * cancelarla tiene que devolverlo. Antes no lo hacía, así que un activo cuya
 * única operación se caía quedaba en `in_operation` para siempre — sin recibir
 * ofertas y sin que su dueño pudiera reactivarlo.
 *
 * El activo vuelve solo si no queda ninguna otra operación viva sobre él. En
 * el modelo multi-oferta eso normalmente se cumple —aceptar una cancela las
 * rivales—, pero la comprobación es lo que hace que el orden de las
 * cancelaciones no importe.
 *
 * Las dos escrituras van en una transacción: un activo devuelto al mercado con
 * su operación todavía viva es exactamente el estado que el modelo prohíbe.
 */
export class CancelOperationUseCase {
    constructor(private readonly uow: IUnitOfWork) {}

    async execute(operationId: string, actor: Actor): Promise<void> {
        await this.uow.run(async (repos) => {
            const operation = await repos.operations.findById(operationId);
            if (!operation) {
                throw new NotFoundError('Operación no encontrada');
            }

            // Cualquiera de las dos partes puede cancelar; un tercero no.
            operation.partyFor(actor.id);

            // La validación de estado cancelable vive en la entidad.
            operation.cancel();
            await repos.operations.save(operation);

            const listingId = operation.toSnapshot().props.listingId.toString();
            const listing = await repos.listings.findById(listingId);
            if (!listing || listing.status !== 'in_operation') return;

            const hermanas = await repos.operations.findByListing(listingId);
            const quedaAlgunaViva = hermanas.some(
                (op) =>
                    op.id.toString() !== operationId &&
                    op.status !== 'cancelled' &&
                    op.status !== 'completed',
            );
            if (quedaAlgunaViva) return;

            listing.returnToMarket();
            await repos.listings.save(listing);
        });
    }
}
