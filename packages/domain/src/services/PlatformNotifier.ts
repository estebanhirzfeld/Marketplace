import { INotifier } from '../ports/INotifier';
import { IUserRepository } from '../ports/Repositories';
import { Notification, NotificationType } from '../entities/Notification';
import { Listing } from '../entities/Listing';
import { Operation } from '../entities/Operation';
import { UserRole } from '@marketplace/shared-types';

/**
 * Los avisos que le tocan a la plataforma.
 *
 * Van aparte de `NegotiationNotifier` porque el destinatario se resuelve
 * distinto: los avisos entre partes salen de la operación —el comprador, el
 * vendedor— y estos hay que ir a buscarlos, porque "la plataforma" no es un
 * usuario sino un rol. Un aviso apunta siempre a una persona, así que cada
 * evento se abre en uno por administrador.
 *
 * Sin esto la campana de un administrador estaba vacía por construcción: no
 * había forma de nombrarlo como destinatario, y una operación podía quedarse
 * días detenida esperando un movimiento suyo sin que nadie se lo dijera. El
 * panel lo mostraba, pero solo si se le ocurría entrar a mirarlo.
 *
 * Ningún método propaga errores, por la misma razón que el otro notificador:
 * que un aviso no salga es molesto; que se caiga una venta porque el aviso no
 * salió es inaceptable.
 */
export class PlatformNotifier {
    constructor(
        private readonly notifier: INotifier,
        private readonly userRepo: IUserRepository,
    ) {}

    /** Un activo entró en la cola de revisión. */
    async listingSubmitted(listing: Listing): Promise<void> {
        await this.avisar('revision_pendiente', { listingId: listing.id });
    }

    /**
     * Una operación quedó esperando la constancia de acceso al activo.
     *
     * Es el caso que más duele: las partes acordaron el precio y no pueden
     * firmar hasta que la plataforma deje constancia de que puede tomar la
     * custodia. Nadie más puede desbloquearlo.
     */
    async platformAccessNeeded(operation: Operation): Promise<void> {
        const { props } = operation.toSnapshot();
        await this.avisar('acceso_pendiente', {
            operationId: operation.id,
            listingId: props.listingId,
        });
    }

    /** El vendedor cedió el activo: hay que verificarlo y declarar la custodia. */
    async custodyNeeded(operation: Operation): Promise<void> {
        const { props } = operation.toSnapshot();
        await this.avisar('custodia_pendiente', {
            operationId: operation.id,
            listingId: props.listingId,
        });
    }

    /** Entró el pago: falta entregar el activo, liquidar y cerrar. */
    async payoutNeeded(operation: Operation): Promise<void> {
        const { props } = operation.toSnapshot();
        await this.avisar('liquidacion_pendiente', {
            operationId: operation.id,
            listingId: props.listingId,
            amountCents: operation.sellerReceives?.getCents(),
            currency: operation.sellerReceives?.getCurrency(),
        });
    }

    private async avisar(
        type: NotificationType,
        datos: Omit<Parameters<typeof Notification.create>[0], 'userId' | 'type'>,
    ): Promise<void> {
        try {
            const admins = await this.userRepo.findByRole(UserRole.ADMIN);

            // Uno por administrador, en una sola escritura: el aviso apunta a
            // una persona, pero el evento es de la plataforma.
            await this.notifier.notify(
                admins.map((admin) => Notification.create({ ...datos, userId: admin.id, type })),
            );
        } catch {
            // Ver el comentario de la clase: un aviso perdido no puede tumbar
            // la operación que lo originó.
        }
    }
}
