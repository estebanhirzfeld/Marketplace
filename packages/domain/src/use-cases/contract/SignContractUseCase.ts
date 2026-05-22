import { IContractRepository, IOperationRepository } from '../../ports/Repositories';
import { PartyRole } from '../../entities/Contract';

export class SignContractUseCase {
    constructor(
        private readonly contractRepo: IContractRepository,
        private readonly operationRepo: IOperationRepository,
    ) {}

    async execute(contractId: string, role: PartyRole, ipAddress: string): Promise<void> {
        // 1. Buscar el contrato
        const contract = await this.contractRepo.findById(contractId);
        if (!contract) {
            throw new Error('Contrato no encontrado');
        }

        // 2. Firmar (la entidad valida rol y duplicación)
        contract.sign(role, ipAddress);
        await this.contractRepo.save(contract);

        // 3. Si el contrato tripartito está completamente firmado → transicionar operación
        if (contract.type === 'tripartite' && contract.isFullySigned() && contract.operationId) {
            const operation = await this.operationRepo.findById(contract.operationId.toString());
            if (operation && operation.status === 'contract_pending') {
                operation.signContract();
                await this.operationRepo.save(operation);
            }
        }
    }
}
