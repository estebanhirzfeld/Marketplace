import {
    IListingRepository,
    ISellerPaymentAccountRepository,
    IUserRepository,
} from '../../ports/Repositories';
import { Actor } from '../../ports/Actor';
import { PlatformNotifier } from '../../services/PlatformNotifier';
import { PublishingRequirements } from '../../services/PublishingRequirements';
import { NotFoundError } from '../../errors/DomainError';
import { assertSalesOpen } from '../../services/AssetSalesPause';

/**
 * Publicar es un acto con valor legal: expone el activo de una persona real al
 * mercado. Por eso exige KYC además de ser dueño del listing.
 *
 * El estado de KYC se lee del repositorio y no del Actor: un token emitido
 * antes de la verificación cargaría el flag desactualizado.
 */
export class SubmitListingForReviewUseCase {
    private readonly requirements: PublishingRequirements;

    constructor(
        private readonly listingRepo: IListingRepository,
        userRepo: IUserRepository,
        private readonly avisosDePlataforma?: PlatformNotifier,
        /** Si se provee, publicar exige Mercado Pago vinculado. Ver `PublishingRequirements`. */
        paymentAccounts?: ISellerPaymentAccountRepository,
        /** Tipos cuya venta está en pausa: un borrador ya cargado tampoco se envía. */
        private readonly pausedAssetTypes: ReadonlySet<string> = new Set(),
    ) {
        this.requirements = new PublishingRequirements(userRepo, paymentAccounts);
    }

    async execute(listingId: string, actor: Actor): Promise<void> {
        const listing = await this.listingRepo.findById(listingId);
        if (!listing) {
            throw new NotFoundError('Activo no encontrado');
        }

        listing.assertOwnedBy(actor.id);
        assertSalesOpen(listing.assetDataFor(true).assetType, this.pausedAssetTypes);

        await this.requirements.assertMetBy(actor);

        // La validación de estado vive en la entidad (Tell, Don't Ask)
        listing.submitForReview();

        await this.listingRepo.save(listing);

        // La cola de revisión existía y nadie avisaba que había algo en ella:
        // un activo enviado esperaba a que a un admin se le ocurriera entrar.
        await this.avisosDePlataforma?.listingSubmitted(listing);
    }
}
