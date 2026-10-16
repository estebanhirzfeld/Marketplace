import type { Notification as PrismaNotification } from "../../generated/prisma/client";
import {
    Notification,
    NotificationProps,
    NotificationType,
} from "@marketplace/domain/src/entities/Notification";
import { UniqueEntityID } from "@marketplace/domain/src/value-objects/UniqueEntityID";
import { centsToColumnOrNull, columnToCentsOrUndefined } from "./moneyColumns";

export class NotificationMapper {
    public static toDomain(raw: PrismaNotification): Notification {
        const props: NotificationProps = {
            userId: new UniqueEntityID(raw.userId),
            type: raw.type as NotificationType,
            operationId: raw.operationId ? new UniqueEntityID(raw.operationId) : undefined,
            listingId: raw.listingId ? new UniqueEntityID(raw.listingId) : undefined,
            amountCents: columnToCentsOrUndefined(raw.amountCents),
            currency: raw.currency ?? undefined,
            occursAt: raw.occursAt ?? undefined,
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
            amountCents: centsToColumnOrNull(props.amountCents),
            currency: props.currency ?? null,
            occursAt: props.occursAt ?? null,
            readAt: props.readAt ?? null,
            createdAt,
        };
    }
}
