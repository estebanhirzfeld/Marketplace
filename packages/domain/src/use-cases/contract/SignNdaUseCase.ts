import { IContractRepository, IListingRepository, IUserRepository } from '../../ports/Repositories';
import { Actor } from '../../ports/Actor';
import { Contract } from '../../entities/Contract';
import { UniqueEntityID } from '../../value-objects/UniqueEntityID';
import { NotFoundError } from '../../errors/DomainError';
import { generateDocument } from '../../contracts/ContractGenerator';
import { ContractDataBuilder } from '../../contracts/ContractDataBuilder';

/**
 * Firma del NDA que desbloquea los datos confidenciales de un listing blind.
 *
 * Tres cambios respecto de la versión anterior:
 *
 * 1. El firmante sale del actor. Antes venía como `buyerId` en los parámetros,
 *    así que cualquiera podía firmar un NDA a nombre de otra persona.
 * 2. Resuelve el TODO que preguntaba por qué siempre se creaba un buyer_nda:
 *    el tipo se deriva de la relación con el listing. El dueño firma el NDA de
 *    seller, cualquier otro el de buyer.
 * 3. La plataforma firma automáticamente. Sin esto el NDA nunca quedaba
 *    completo y GetListingDetails seguía ocultando los datos para siempre,
 *    porque desbloquea exigiendo `isFullySigned()`.
 */
export class SignNdaUseCase {
    constructor(
        private readonly contractRepo: IContractRepository,
        private readonly listingRepo: IListingRepository,
        private readonly userRepo: IUserRepository,
        private readonly armador: ContractDataBuilder,
    ) {}

    async execute(listingId: string, ipAddress: string, actor: Actor): Promise<Contract> {
        const listing = await this.listingRepo.findById(listingId);
        if (!listing) {
            throw new NotFoundError('Activo no encontrado');
        }

        // Firmar es un acto con valor legal: exige identidad verificada.
        const user = await this.userRepo.findById(actor.id);
        if (!user) {
            throw new NotFoundError('Usuario no encontrado');
        }
        user.assertCanSign();

        const esDuenio = listing.isOwnedBy(actor.id);

        let nda = await this.contractRepo.findByListingAndSigner(listingId, actor.id);

        if (!nda) {
            const listingRef = new UniqueEntityID(listingId);
            const signerRef = new UniqueEntityID(actor.id);

            nda = esDuenio
                ? Contract.createSellerNda(listingRef, signerRef)
                : Contract.createBuyerNda(listingRef, signerRef);
        }

        // El documento se genera y se adjunta antes de firmar: la entidad
        // rechaza una firma sobre un contrato sin documento.
        if (!nda.documentHash) {
            const { hash } = await generateDocument(await this.armador.para(nda));
            nda.attachDocument(hash);
        }

        // La entidad valida si este rol ya firmó.
        nda.sign(esDuenio ? 'seller' : 'buyer', ipAddress);
        nda.signAsPlatform();

        await this.contractRepo.save(nda);

        return nda;
    }
}
