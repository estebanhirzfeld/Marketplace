import { IUnitOfWork } from '../../ports/IUnitOfWork';
import { Actor } from '../../ports/Actor';
import { Operation, NegotiatingParty } from '../../entities/Operation';
import { NegotiationNotifier } from '../../services/NegotiationNotifier';
import { NotFoundError } from '../../errors/DomainError';

/**
 * Aceptar una oferta dispara la cascada híbrida del modelo multi-oferta:
 * la operación aceptada pasa a contract_pending, todas las rivales del mismo
 * listing se cancelan, y el listing pasa a in_operation.
 *
 * Las tres cosas van en una sola transacción. El use case no recibe
 * repositorios sueltos: solo el Unit of Work, así que estructuralmente no
 * puede escribir nada por fuera.
 */
export class AcceptOfferUseCase {
    constructor(
        private readonly uow: IUnitOfWork,
        private readonly avisos?: NegotiationNotifier,
    ) {}

    async execute(operationId: string, actor: Actor): Promise<void> {
        const resultado = await this.uow.run(async (repos) => {
            const operation = await repos.operations.findById(operationId);
            if (!operation) {
                throw new NotFoundError('Operación no encontrada');
            }

            // La posición se deriva del actor, no se declara.
            const by = operation.partyFor(actor.id);
            operation.acceptCurrentOffer(by);
            await repos.operations.save(operation);

            // Cascada híbrida: cancelar las demás ofertas del mismo listing.
            const { props } = operation.toSnapshot();
            const listingId = props.listingId.toString();
            const todas = await repos.operations.findByListing(listingId);

            const cancelled: Operation[] = [];
            for (const op of todas) {
                if (op.id.toString() !== operationId && op.status !== 'cancelled') {
                    op.cancel();
                    await repos.operations.save(op);
                    cancelled.push(op);
                }
            }

            const listing = await repos.listings.findById(listingId);
            if (listing && listing.status === 'published') {
                listing.markInOperation();
                await repos.listings.save(listing);
            }

            return { operation, by, cancelled };
        });

        // Los avisos salen DESPUÉS de que la transacción confirmó. Mandarlos
        // adentro significaría avisar de una aceptación que todavía puede
        // revertirse, y no hay forma de retirar un aviso ya enviado.
        await this.avisos?.offerAccepted(resultado.operation, resultado.by as NegotiatingParty);
        await this.avisos?.offersCancelledByCascade(resultado.cancelled);
    }
}
