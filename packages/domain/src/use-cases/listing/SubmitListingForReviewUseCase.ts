import {
    IListingRepository,
    ISellerPaymentAccountRepository,
    IUserRepository,
} from '../../ports/Repositories';
import { Actor } from '../../ports/Actor';
import { PlatformNotifier } from '../../services/PlatformNotifier';
import { InvalidStateError, NotFoundError } from '../../errors/DomainError';

/**
 * Publicar es un acto con valor legal: expone el activo de una persona real al
 * mercado. Por eso exige KYC además de ser dueño del listing.
 *
 * El estado de KYC se lee del repositorio y no del Actor: un token emitido
 * antes de la verificación cargaría el flag desactualizado.
 */
export class SubmitListingForReviewUseCase {
    constructor(
        private readonly listingRepo: IListingRepository,
        private readonly userRepo: IUserRepository,
        private readonly avisosDePlataforma?: PlatformNotifier,
        /**
         * Si se provee, publicar exige haber vinculado Mercado Pago. Es
         * opcional porque la exigencia se enciende por configuración: sin la
         * pantalla de vinculación un vendedor no tendría cómo cumplirla.
         */
        private readonly paymentAccounts?: ISellerPaymentAccountRepository,
    ) {}

    async execute(listingId: string, actor: Actor): Promise<void> {
        const listing = await this.listingRepo.findById(listingId);
        if (!listing) {
            throw new NotFoundError('Activo no encontrado');
        }

        listing.assertOwnedBy(actor.id);

        const user = await this.userRepo.findById(actor.id);
        if (!user) {
            throw new NotFoundError('Usuario no encontrado');
        }
        user.assertCanSign();

        // Cualquier cuenta vinculada alcanza, aunque su token esté vencido:
        // solo la ausencia bloquea. El refresco es asunto del cobro. Se
        // pregunta por la existencia, sin descifrar los tokens: con la clave
        // rotada o una fila corrupta, leer la cuenta lanzaría un error
        // genérico en lugar de dejar publicar a un vendedor vinculado.
        if (this.paymentAccounts) {
            const vinculada = await this.paymentAccounts.existsByUserId(actor.id);
            if (!vinculada) {
                throw new InvalidStateError(
                    'Para publicar tenés que vincular tu cuenta de Mercado Pago: ahí recibís el cobro de tus ventas.',
                );
            }
        }

        // La validación de estado vive en la entidad (Tell, Don't Ask)
        listing.submitForReview();

        await this.listingRepo.save(listing);

        // La cola de revisión existía y nadie avisaba que había algo en ella:
        // un activo enviado esperaba a que a un admin se le ocurriera entrar.
        await this.avisosDePlataforma?.listingSubmitted(listing);
    }
}
