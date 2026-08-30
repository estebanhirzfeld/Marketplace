import { IOperationRepository } from '../../ports/Repositories';
import { Actor } from '../../ports/Actor';
import { Money } from '../../value-objects/Money';
import { NotFoundError } from '../../errors/DomainError';
import { AvisosDeNegociacion } from '../../services/AvisosDeNegociacion';

export interface CounterOfferInput {
    operationId: string;
    price: { cents: number; currency: string };
}

/**
 * El `by` ya no lo declara el llamador: se deriva de la posición del actor en
 * esta operación. Antes, cualquiera podía contraofertar diciendo ser el seller.
 */
export class CounterOfferUseCase {
    constructor(
        private readonly operationRepo: IOperationRepository,
        private readonly avisos?: AvisosDeNegociacion,
    ) {}

    async execute(input: CounterOfferInput, actor: Actor): Promise<void> {
        const operation = await this.operationRepo.findById(input.operationId);
        if (!operation) {
            throw new NotFoundError('Operación no encontrada');
        }

        const by = operation.partyFor(actor.id);

        // Turno, estado y convergencia se validan en la entidad.
        operation.counterOffer(
            Money.fromCents(input.price.cents, input.price.currency),
            by,
        );

        await this.operationRepo.save(operation);
        await this.avisos?.contraofertaHecha(operation);
    }
}
