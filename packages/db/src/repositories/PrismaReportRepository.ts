import { IReportRepository } from "@marketplace/domain/src/ports/Repositories";
import { Report } from "@marketplace/domain/src/entities/Report";
import { prisma } from "../client";
import { ReportMapper } from "../mappers/ReportMapper";

export class PrismaReportRepository implements IReportRepository {
    constructor(private readonly db = prisma) {}

    async findById(id: string): Promise<Report | null> {
        const row = await this.db.report.findUnique({ where: { id } });
        return row ? ReportMapper.toDomain(row) : null;
    }

    /** Las dos puntas: la plataforma le muestra al denunciado su denuncia. */
    async findByUser(userId: string): Promise<Report[]> {
        const rows = await this.db.report.findMany({
            where: { OR: [{ reportedById: userId }, { reportedUserId: userId }] },
            orderBy: { createdAt: "desc" },
        });
        return rows.map(ReportMapper.toDomain);
    }

    async findByOperation(operationId: string): Promise<Report[]> {
        const rows = await this.db.report.findMany({
            where: { operationId },
            orderBy: { createdAt: "desc" },
        });
        return rows.map(ReportMapper.toDomain);
    }

    async save(report: Report): Promise<void> {
        const data = ReportMapper.toPersistence(report);

        await this.db.report.upsert({
            where: { id: data.id },
            create: data,
            update: data,
        });
    }
}
