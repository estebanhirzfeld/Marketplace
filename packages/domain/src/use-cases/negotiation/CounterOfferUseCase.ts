import { IOperationRepository } from '../../ports/Repositories';
import { Money } from '../../value-objects/Money';
import { NegotiatingParty } from '../../entities/Operation';

export interface CounterOfferInput {
    operationId: string;
    price: { cents: number; currency: string };
    by: NegotiatingParty;
}

export class CounterOfferUseCase {
    constructor(
        private readonly operationRepo: IOperationRepository,
    ) {}

    async execute(input: CounterOfferInput): Promise<void> {
        const operation = await this.operationRepo.findById(input.operationId);
        if (!operation) {
            throw new Error('Operación no encontrada');
        }

        // Validación de turno y estado vive en la entidad
        operation.counterOffer(
            Money.fromCents(input.price.cents, input.price.currency),
            input.by,
        );

        await this.operationRepo.save(operation);
    }
}
