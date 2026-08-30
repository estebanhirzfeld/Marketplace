import type { Notification as PrismaNotification } from "../../generated/prisma/client";
import {
    Notification,
    NotificationProps,
    NotificationType,
} from "@marketplace/domain/src/entities/Notification";
import { UniqueEntityID } from "@marketplace/domain/src/value-objects/UniqueEntityID";

export class NotificationMapper {
    public static toDomain(raw: PrismaNotification): Notification {
        const props: NotificationProps = {
            userId: new UniqueEntityID(raw.userId),
            type: raw.type as NotificationType,
            operationId: raw.operationId ? new UniqueEntityID(raw.operationId) : undefined,
            listingId: raw.listingId ? new UniqueEntityID(raw.listingId) : undefined,
            amountCents: raw.amountCents ?? undefined,
            currency: raw.currency ?? undefined,
            readAt: raw.readAt ?? undefined,
        };

        return Notification.reconstitute(props, new UniqueEntityID(raw.id), raw.createdAt);
    }

    public static toPersistence(n: Notification) {
        const { id, createdAt, props } = n.toSnapshot();

        return {
            id,
            userId: props.userId.toString(),
            type: props.type,
            operationId: props.operationId?.toString() ?? null,
            listingId: props.listingId?.toString() ?? null,
            amountCents: props.amountCents ?? null,
            currency: props.currency ?? null,
            readAt: props.readAt ?? null,
            createdAt,
        };
    }
}
