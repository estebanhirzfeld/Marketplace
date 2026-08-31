import { INotificationRepository } from '../../ports/INotifier';
import { Actor } from '../../ports/Actor';
import { Notification } from '../../entities/Notification';

/** La bandeja del actor. Consulta por su id, así que no puede leer la de otro. */
export class GetMyNotificationsUseCase {
    constructor(private readonly repo: INotificationRepository) {}

    async execute(actor: Actor, onlyUnread = false): Promise<Notification[]> {
        return this.repo.findByUser(actor.id, onlyUnread);
    }
}
