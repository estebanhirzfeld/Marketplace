import { Listing } from '../entities/Listing';

/**
 * Consulta de los activos publicados sobre un canal de YouTube.
 *
 * Puerto aparte de `IListingRepository` a propósito: el repositorio de
 * listings tiene muchos dobles tipados y esta pregunta solo la hace el alta
 * desde una conexión. El adaptador la implementa sobre `channelUrl`, que es
 * donde `assetData` guarda la identidad del canal.
 */
export interface IYouTubeChannelListingFinder {
    /**
     * Todos los listings de cualquier vendedor y estado cuyo `channelUrl` apunta
     * a este canal. Decidir cuáles están vigentes es del caso de uso.
     */
    findByChannelId(channelId: string): Promise<Listing[]>;
}
