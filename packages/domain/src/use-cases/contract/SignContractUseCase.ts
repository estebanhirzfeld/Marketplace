import {
    IContractRepository,
    IListingRepository,
    IOperationRepository,
    IUserRepository,
} from '../../ports/Repositories';
import { generateDocument } from '../../contracts/ContractGenerator';
import { ContractDataBuilder } from '../../contracts/ContractDataBuilder';
import { Actor } from '../../ports/Actor';
import { NotFoundError, InvalidStateError } from '../../errors/DomainError';
import { NegotiationNotifier } from '../../services/NegotiationNotifier';

/**
 * Firma del contrato tripartito que cierra la venta.
 *
 * El cambio central de la fase: el parámetro `role` desapareció. Antes el
 * llamador elegía con qué rol firmaba, incluido `platform` — cualquiera podía
 * firmar por la plataforma. Ahora el rol se deriva de la posición del actor en
 * la operación, y la plataforma firma sola.
 */
export class SignContractUseCase {
    constructor(
        private readonly contractRepo: IContractRepository,
        private readonly operationRepo: IOperationRepository,
        private readonly userRepo: IUserRepository,
        private readonly listingRepo: IListingRepository,
        private readonly armador: ContractDataBuilder,
        private readonly avisos?: NegotiationNotifier,
    ) {}

    async execute(contractId: string, ipAddress: string, actor: Actor): Promise<void> {
        const contract = await this.contractRepo.findById(contractId);
        if (!contract) {
            throw new NotFoundError('Contrato no encontrado');
        }

        if (!contract.operationId) {
            throw new InvalidStateError('Este contrato no está asociado a una operación.');
        }

        const operation = await this.operationRepo.findById(contract.operationId.toString());
        if (!operation) {
            throw new NotFoundError('Operación no encontrada');
        }

        // Firmar es un acto con valor legal: exige identidad verificada.
        const user = await this.userRepo.findById(actor.id);
        if (!user) {
            throw new NotFoundError('Usuario no encontrado');
        }
        user.assertCanSign();

        // El rol se deriva; lanza ForbiddenError si el actor no es parte.
        const role = operation.partyFor(actor.id);

        // El tripartito es el punto de no retorno: después de firmarlo la
        // cancelación deja de ser legal. Si la plataforma todavía no puede
        // tomar la custodia del activo, nadie debería quedar comprometido.
        // Los NDA no pasan por acá a propósito: obligan a callar, no a comprar.
        if (contract.type === 'tripartite') {
            const listing = await this.listingRepo.findById(operation.listingId.toString());
            if (!listing) {
                throw new NotFoundError('Activo no encontrado');
            }
            listing.assertCanBeTransferred();
        }

        // Sin documento no hay nada que firmar. Se arma con los datos reales
        // de la operación, así que el texto es reproducible desde la base.
        if (!contract.documentHash) {
            const { hash } = await generateDocument(await this.armador.para(contract));
            contract.attachDocument(hash);
        }

        contract.sign(role, ipAddress);

        // Un tripartito lo firman buyer y seller en dos pasos separados. La
        // plataforma se suma en el primero de ellos, así que hay que preguntar
        // antes: firmar dos veces con el mismo rol es un error de dominio.
        if (!contract.hasSignedBy('platform')) {
            contract.signAsPlatform();
        }

        await this.contractRepo.save(contract);

        // Con las tres firmas completas, la operación avanza sola.
        if (contract.isFullySigned() && operation.status === 'contract_pending') {
            operation.signContract();
            await this.operationRepo.save(operation);
            await this.avisos?.contractSigned(operation);
        }
    }
}
