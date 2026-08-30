import { IUserRepository } from "@marketplace/domain/src/ports/Repositories";
import { User } from "@marketplace/domain/src/entities/User";
import { UserMapper } from "../mappers/UserMapper";
import { prisma, PrismaLike } from "../client";

export class PrismaUserRepository implements IUserRepository {
    /**
     * El cliente se inyecta para que el Unit of Work pueda pasar el cliente
     * transaccional. Por defecto usa el singleton, que es lo correcto para
     * una lectura o una escritura suelta.
     */
    constructor(private readonly db: PrismaLike = prisma) {}

    async findById(id: string): Promise<User | null> {
        const raw = await this.db.user.findUnique({ where: { id } });
        return raw ? UserMapper.toDomain(raw) : null;
    }

    async findByEmail(email: string): Promise<User | null> {
        const raw = await this.db.user.findUnique({ where: { email } });
        return raw ? UserMapper.toDomain(raw) : null;
    }

    async save(user: User): Promise<void> {
        const data = UserMapper.toPersistence(user);

        await this.db.user.upsert({
            where: { id: data.id },
            create: data,
            update: data,
        });
    }
}
