import {
    INotificationRepository,
    INotifier,
} from "@marketplace/domain/src/ports/INotifier";
import { Notification } from "@marketplace/domain/src/entities/Notification";
import { NotificationMapper } from "../mappers/NotificationMapper";
import { prisma, PrismaLike } from "../client";

type ConNotificaciones = PrismaLike & {
    notification: {
        findMany: (args: unknown) => Promise<unknown[]>;
        findUnique: (args: unknown) => Promise<unknown>;
        count: (args: unknown) => Promise<number>;
        upsert: (args: unknown) => Promise<unknown>;
        createMany: (args: unknown) => Promise<unknown>;
    };
};

/**
 * Persiste los avisos y también implementa el puerto `INotifier`: por ahora
 * "notificar" es guardar en la bandeja de la aplicación. Cuando haya email,
 * se escribe otro adaptador y se compone, sin tocar ningún use case.
 */
export class PrismaNotificationRepository implements INotificationRepository, INotifier {
    constructor(private readonly db: ConNotificaciones = prisma as ConNotificaciones) {}

    async findByUser(userId: string, soloNoLeidas = false): Promise<Notification[]> {
        const rows = (await this.db.notification.findMany({
            where: { userId, ...(soloNoLeidas ? { readAt: null } : {}) },
            orderBy: { createdAt: "desc" },
            take: 50,
        })) as Parameters<typeof NotificationMapper.toDomain>[0][];

        return rows.map(NotificationMapper.toDomain);
    }

    async findById(id: string): Promise<Notification | null> {
        const raw = (await this.db.notification.findUnique({ where: { id } })) as
            | Parameters<typeof NotificationMapper.toDomain>[0]
            | null;
        return raw ? NotificationMapper.toDomain(raw) : null;
    }

    async contarNoLeidas(userId: string): Promise<number> {
        return this.db.notification.count({ where: { userId, readAt: null } });
    }

    async save(notificacion: Notification): Promise<void> {
        const data = NotificationMapper.toPersistence(notificacion);
        await this.db.notification.upsert({ where: { id: data.id }, create: data, update: data });
    }

    async saveMany(notificaciones: Notification[]): Promise<void> {
        if (notificaciones.length === 0) return;
        await this.db.notification.createMany({
            data: notificaciones.map(NotificationMapper.toPersistence),
        });
    }

    /** Implementación de INotifier: hoy, guardar en la bandeja. */
    async notificar(notificaciones: Notification[]): Promise<void> {
        await this.saveMany(notificaciones);
    }
}
