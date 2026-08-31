import { INotificationRepository } from '../../ports/INotifier';
import { Actor } from '../../ports/Actor';
import { ForbiddenError, NotFoundError } from '../../errors/DomainError';

export class MarkNotificationReadUseCase {
    constructor(private readonly repo: INotificationRepository) {}

    async execute(notificationId: string, actor: Actor): Promise<void> {
        const aviso = await this.repo.findById(notificationId);
        if (!aviso) {
            throw new NotFoundError('Aviso no encontrado');
        }

        // El id del aviso es adivinable; sin este chequeo cualquiera podría
        // marcar como leídos los avisos de otra persona.
        if (aviso.userId.toString() !== actor.id) {
            throw new ForbiddenError('Este aviso no es tuyo.');
        }

        aviso.markAsRead();
        await this.repo.save(aviso);
    }
}
