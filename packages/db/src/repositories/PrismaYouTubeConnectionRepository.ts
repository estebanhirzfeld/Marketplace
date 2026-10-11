import { IYouTubeConnectionRepository } from "@marketplace/domain/src/ports/Repositories";
import { YouTubeConnection } from "@marketplace/domain/src/entities/YouTubeConnection";
import { prisma } from "../client";
import { YouTubeConnectionMapper } from "../mappers/YouTubeConnectionMapper";

export class PrismaYouTubeConnectionRepository implements IYouTubeConnectionRepository {
    constructor(private readonly db = prisma) {}

    async findBySellerAndChannel(sellerId: string, channelId: string): Promise<YouTubeConnection | null> {
        const row = await this.db.youTubeConnection.findUnique({
            where: { sellerId_channelId: { sellerId, channelId } },
        });
        return row ? YouTubeConnectionMapper.toDomain(row) : null;
    }

    async findBySeller(sellerId: string): Promise<YouTubeConnection[]> {
        const rows = await this.db.youTubeConnection.findMany({
            where: { sellerId },
            orderBy: { connectedAt: "desc" },
        });
        return rows.map(YouTubeConnectionMapper.toDomain);
    }

    /**
     * Upsert por `(sellerId, channelId)`, no por `id`: conectar de nuevo el mismo
     * canal desde una entidad con otro id tiene que pisar la fila anterior en
     * vez de chocar con el índice único.
     */
    async save(connection: YouTubeConnection): Promise<void> {
        const data = YouTubeConnectionMapper.toPersistence(connection);

        await this.db.youTubeConnection.upsert({
            where: { sellerId_channelId: { sellerId: data.sellerId, channelId: data.channelId } },
            create: data,
            update: {
                channelTitle: data.channelTitle,
                grantedScopes: data.grantedScopes,
                refreshTokenCipher: data.refreshTokenCipher,
                status: data.status,
                connectedAt: data.connectedAt,
                lastReadAt: data.lastReadAt,
                lastSnapshot: data.lastSnapshot,
            },
        });
    }
}
