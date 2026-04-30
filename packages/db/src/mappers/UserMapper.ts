import type { User as PrismaUser } from "../../generated/prisma";
import { User, UserProps } from "@marketplace/domain/src/entities/User";
import { UniqueEntityID } from "@marketplace/domain/src/value-objects/UniqueEntityID";
import { Email } from "@marketplace/domain/src/value-objects/Email";
import { UserRole } from "@marketplace/shared-types";

export class UserMapper {
    public static toDomain(raw: PrismaUser): User {
        const props: UserProps = {
            email: Email.create(raw.email),
            fullName: raw.fullName,
            phone: raw.phone ?? undefined,
            country: raw.country ?? undefined,
            dni: raw.dni ?? undefined,
            role: raw.role as UserRole,
            isKycVerified: raw.isKycVerified,
        };

        return User.reconstitute(
            props,
            new UniqueEntityID(raw.id),
            raw.createdAt
        );
    }

    public static toPersistence(user: User) {
        const { id, createdAt, props } = user.toSnapshot();

        return {
            id,
            email: props.email.getValue(),
            fullName: props.fullName,
            phone: props.phone ?? null,
            country: props.country ?? null,
            dni: props.dni ?? null,
            role: props.role,
            isKycVerified: props.isKycVerified,
            createdAt,
        };
    }
}
