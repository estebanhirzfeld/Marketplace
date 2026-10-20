import { ITransferStepProgressRepository } from "@marketplace/domain/src/ports/Repositories";
import { TransferStepProgress, TransferStepScope } from "@marketplace/domain/src/entities/TransferStepProgress";
import { prisma } from "../client";
import { TransferStepProgressMapper } from "../mappers/TransferStepProgressMapper";

export class PrismaTransferStepProgressRepository implements ITransferStepProgressRepository {
    constructor(private readonly db = prisma) {}

    async findByScope(scope: TransferStepScope, scopeId: string): Promise<TransferStepProgress[]> {
        const rows = await this.db.transferStepProgress.findMany({
            where: { scope, scopeId },
            orderBy: { startedAt: "asc" },
        });
        return rows.map(TransferStepProgressMapper.toDomain);
    }

    async find(scope: TransferStepScope, scopeId: string, stepKey: string): Promise<TransferStepProgress | null> {
        const row = await this.db.transferStepProgress.findUnique({
            where: { scope_scopeId_stepKey: { scope, scopeId, stepKey } },
        });
        return row ? TransferStepProgressMapper.toDomain(row) : null;
    }

    /** En curso, o vencido sin escalar: lo que el job periódico todavía tiene que atender. */
    async findOpen(): Promise<TransferStepProgress[]> {
        const rows = await this.db.transferStepProgress.findMany({
            where: {
                OR: [
                    { status: { in: ["pending", "waiting"] } },
                    { status: "expired", escalatedAt: null },
                ],
            },
            orderBy: { startedAt: "asc" },
        });
        return rows.map(TransferStepProgressMapper.toDomain);
    }

    /**
     * Upsert por `(scope, scopeId, stepKey)`, no por `id`: volver a guardar el
     * paso desde una entidad con otro id tiene que pisar la fila anterior en
     * vez de chocar con el índice único. El `id` y `createdAt` de la fila
     * original se conservan.
     */
    async save(progress: TransferStepProgress): Promise<void> {
        const data = TransferStepProgressMapper.toPersistence(progress);
        const { id: _id, createdAt: _createdAt, scope, scopeId, stepKey, ...changes } = data;

        await this.db.transferStepProgress.upsert({
            where: { scope_scopeId_stepKey: { scope, scopeId, stepKey } },
            create: data,
            update: changes,
        });
    }
}
