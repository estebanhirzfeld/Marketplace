import { Notification } from '../entities/Notification';

/**
 * Puerto de avisos.
 *
 * Reemplaza al bus de eventos que estaba a medio construir en `events/`. Con
 * nueve avisos en todo el sistema, un dispatcher con registro de handlers era
 * más maquinaria que la que el problema pide; agregar email más adelante es
 * escribir otro adaptador, sin tocar ningún use case.
 *
 * `notificar` no debe hacer fallar la operación que lo llama: que un aviso no
 * salga es molesto, que se caiga una venta por eso es inaceptable.
 */
export interface INotifier {
    notify(notifications: Notification[]): Promise<void>;
}

export interface INotificationRepository {
    findByUser(userId: string, onlyUnread?: boolean): Promise<Notification[]>;
    findById(id: string): Promise<Notification | null>;
    countUnread(userId: string): Promise<number>;
    save(notification: Notification): Promise<void>;
    saveMany(notifications: Notification[]): Promise<void>;
}
