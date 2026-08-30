import { IContractRepository, IOperationRepository } from '../../ports/Repositories';
import { Actor } from '../../ports/Actor';
import { ContractDataBuilder } from '../../contracts/ContractDataBuilder';
import { generateDocument } from '../../contracts/ContractGenerator';
import { ContractType } from '../../entities/Contract';
import { ForbiddenError, NotFoundError } from '../../errors/DomainError';
import { UserRole } from '@marketplace/shared-types';

export interface ContractDocument {
    contractId: string;
    type: ContractType;
    text: string;
    /** Huella del texto que se acaba de regenerar. */
    hash: string;
    /** La huella guardada al momento de firmar, si el contrato ya tiene una. */
    signedHash?: string;
    /**
     * `false` significa que el texto regenerado no es el que se firmó: algún
     * dato de la operación cambió después. Se informa en vez de ocultarse.
     */
    matches: boolean;
    signed: boolean;
}

/**
 * Devuelve el documento de un contrato para que las partes puedan leerlo.
 *
 * Sin esto el documento se generaba, se hasheaba y nadie lo veía nunca. Firmar
 * algo que no se puede leer es apenas mejor que firmar nada.
 *
 * El texto se regenera en cada consulta en lugar de guardarse, y se compara
 * contra la huella firmada. Esa comparación es la que da valor al mecanismo:
 * si algún dato cambió después de la firma, se ve.
 */
export class GetContractDocumentUseCase {
    constructor(
        private readonly contractRepo: IContractRepository,
        private readonly operationRepo: IOperationRepository,
        private readonly armador: ContractDataBuilder,
    ) {}

    async execute(contractId: string, actor: Actor): Promise<ContractDocument> {
        const contract = await this.contractRepo.findById(contractId);
        if (!contract) {
            throw new NotFoundError('Contrato no encontrado');
        }

        await this.assertPuedeLeer(contract, actor);

        const data = await this.armador.para(contract);
        const { text, hash } = await generateDocument(data);

        const signedHash = contract.documentHash;

        return {
            contractId: contract.id.toString(),
            type: contract.type,
            text,
            hash,
            signedHash,
            // Sin documento adjunto todavía no hay nada contra qué comparar.
            matches: signedHash === undefined || signedHash === hash,
            signed: contract.signatures.some((s) => s.signed),
        };
    }

    /**
     * Un NDA lo lee su firmante; un tripartito, las partes de la operación.
     * Un admin siempre, porque la plataforma es parte de los tres.
     */
    private async assertPuedeLeer(
        contract: Awaited<ReturnType<IContractRepository['findById']>> & object,
        actor: Actor,
    ): Promise<void> {
        if (actor.role === UserRole.ADMIN) return;

        if (contract.type === 'tripartite') {
            if (!contract.operationId) {
                throw new ForbiddenError('Este contrato no es tuyo.');
            }
            const operation = await this.operationRepo.findById(contract.operationId.toString());
            if (!operation) {
                throw new NotFoundError('Operación no encontrada');
            }
            // Lanza ForbiddenError si el actor no es parte.
            operation.partyFor(actor.id);
            return;
        }

        if (contract.signerId?.toString() !== actor.id) {
            throw new ForbiddenError('Este acuerdo no es tuyo.');
        }
    }
}
