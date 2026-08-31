import { IUnitOfWork } from '../../ports/IUnitOfWork';
import { Actor } from '../../ports/Actor';
import { Operation, NegotiatingParty } from '../../entities/Operation';
import { Contract } from '../../entities/Contract';
import { NegotiationNotifier } from '../../services/NegotiationNotifier';
import { NotFoundError } from '../../errors/DomainError';

/**
 * Aceptar una oferta dispara la cascada híbrida del modelo multi-oferta:
 * la operación aceptada pasa a contract_pending, todas las rivales del mismo
 * listing se cancelan, y el listing pasa a in_operation.
 *
 * También queda creado el contrato tripartito. Es lo único que puede sacar a
 * la operación de `contract_pending`, y sin él las dos partes veían "falta que
 * firmen" sin ningún lugar donde firmar: la operación quedaba detenida para
 * siempre. Se crea acá y no cuando alguien intenta firmar porque las dos
 * partes tienen que estar mirando el mismo documento — si lo creara el primero
 * en entrar, el texto dependería de quién llegó antes.
 *
 * Todo va en una sola transacción. El use case no recibe repositorios sueltos:
 * solo el Unit of Work, así que estructuralmente no puede escribir nada por
 * fuera.
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

            // El documento que las partes van a firmar. Se consulta antes de
            // crearlo porque la base tiene una única fila por operación y tipo,
            // y un reintento no debería chocar contra esa restricción.
            const existentes = await repos.contracts.findByOperation(operationId);
            if (!existentes.some((c) => c.type === 'tripartite')) {
                await repos.contracts.save(
                    Contract.createTripartite(props.listingId, operation.id),
                );
            }
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
