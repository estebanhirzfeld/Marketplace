import { UserRole } from '@marketplace/shared-types';
import { IYouTubeConnectionRepository } from '../../ports/Repositories';
import { Actor } from '../../ports/Actor';
import { ForbiddenError } from '../../errors/DomainError';
import { YouTubeConnectionSummary, summarizeConnection } from './ConnectYouTubeChannelUseCase';

/**
 * Los canales que el vendedor tiene conectados, para elegir cuál publicar.
 * Devuelve resúmenes: ni el token ni los permisos salen de acá.
 */
export class ListYouTubeConnectionsUseCase {
    constructor(private readonly connections: IYouTubeConnectionRepository) {}

    async execute(actor: Actor): Promise<YouTubeConnectionSummary[]> {
        if (actor.role === UserRole.ADMIN) {
            throw new ForbiddenError('Un administrador no tiene canales conectados.');
        }

        const connections = await this.connections.findBySeller(actor.id);
        return connections.filter((connection) => connection.isActive()).map(summarizeConnection);
    }
}
