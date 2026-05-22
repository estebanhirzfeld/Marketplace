import { IContractRepository, IListingRepository } from '../../ports/Repositories';
import { Contract } from '../../entities/Contract';
import { UniqueEntityID } from '../../value-objects/UniqueEntityID';

export class SignNdaUseCase {
    constructor(
        private readonly contractRepo: IContractRepository,
        private readonly listingRepo: IListingRepository,
    ) {}

    async execute(listingId: string, buyerId: string, ipAddress: string): Promise<Contract> {
        // 1. Verificar que el listing existe
        const listing = await this.listingRepo.findById(listingId);
        if (!listing) {
            throw new Error('Listing no encontrado');
        }

        // 2. Buscar si ya existe un NDA para este buyer/listing
        let nda = await this.contractRepo.findByListingAndSigner(listingId, buyerId);

        // 3. Crear si no existe
        if (!nda) {
            nda = Contract.createBuyerNda(
                new UniqueEntityID(listingId),
                new UniqueEntityID(buyerId),
            );
        }

        // 4. Firmar como buyer (la entidad valida si ya firmó)
        nda.sign('buyer', ipAddress);

        // 5. Persistir
        await this.contractRepo.save(nda);

        return nda;
    }
}
