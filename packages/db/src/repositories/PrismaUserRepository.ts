import { IUserRepository } from "@marketplace/domain/src/ports/Repositories";
import { User } from "@marketplace/domain/src/entities/User";
import { UserMapper } from "../mappers/UserMapper";
import { prisma } from "../client";

export class PrismaUserRepository implements IUserRepository {
    async findById(id: string): Promise<User | null> {
        const raw = await prisma.user.findUnique({ where: { id } });
        return raw ? UserMapper.toDomain(raw) : null;
    }

    async findByEmail(email: string): Promise<User | null> {
        const raw = await prisma.user.findUnique({ where: { email } });
        return raw ? UserMapper.toDomain(raw) : null;
    }

    async save(user: User): Promise<void> {
        const data = UserMapper.toPersistence(user);

        await prisma.user.upsert({
            where: { id: data.id },
            create: data,
            update: data,
        });
    }
}
