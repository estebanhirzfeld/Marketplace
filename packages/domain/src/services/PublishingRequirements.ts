import { ISellerPaymentAccountRepository, IUserRepository } from '../ports/Repositories';
import { Actor } from '../ports/Actor';
import { InvalidStateError, NotFoundError } from '../errors/DomainError';

/**
 * Lo que se le exige a un vendedor para exponer un activo al mercado, sea por
 * revisión o por publicación directa. Vive en un solo lugar para que las dos
 * puertas no puedan divergir.
 *
 * El estado de KYC se lee del repositorio y no del Actor: un token emitido
 * antes de la verificación cargaría el flag desactualizado.
 */
export class PublishingRequirements {
    constructor(
        private readonly userRepo: IUserRepository,
        /**
         * Si se provee, publicar exige haber vinculado Mercado Pago. Es
         * opcional porque la exigencia se enciende por configuración: sin la
         * pantalla de vinculación un vendedor no tendría cómo cumplirla.
         */
        private readonly paymentAccounts?: ISellerPaymentAccountRepository,
    ) {}

    async assertMetBy(actor: Actor): Promise<void> {
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
    }
}
