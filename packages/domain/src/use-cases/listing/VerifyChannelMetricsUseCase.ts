import { IListingRepository } from '../../ports/Repositories';
import { IYouTubeChannelReader } from '../../ports/IYouTubeChannelReader';
import { Actor } from '../../ports/Actor';
import { YouTubeChannelRef } from '../../value-objects/YouTubeChannelRef';
import { subscribersAreConsistent } from '../../services/YouTubeMetrics';
import { ForbiddenError, NotFoundError, ValidationError } from '../../errors/DomainError';
import { AssetType, UserRole } from '@marketplace/shared-types';

export interface ChannelMetricsReport {
    channelId: string;
    title: string;
    declaredSubscribers: number;
    /** Ausente si el canal oculta su número de suscriptores. */
    reportedSubscribers?: number;
    /**
     * `undefined` cuando no hay con qué comparar. No es lo mismo que `false`:
     * un canal que oculta sus suscriptores no está mintiendo.
     */
    subscribersMatch?: boolean;
    views: number;
    publicVideos: number;
    checkedAt: Date;
}

/**
 * Contrasta lo que el vendedor declaró contra lo que informa la API.
 *
 * Alcanza para detectar una inconsistencia grosera —alguien que multiplica sus
 * suscriptores para inflar la valuación— y no alcanza para validar el precio,
 * porque el ingreso mensual, que es el insumo que lo fija, no es consultable.
 * La verificación es una foto con fecha: dice qué informaba la API en ese
 * momento, no garantiza nada hacia adelante.
 */
export class VerifyChannelMetricsUseCase {
    constructor(
        private readonly listingRepo: IListingRepository,
        private readonly reader: IYouTubeChannelReader,
    ) {}

    async execute(listingId: string, actor: Actor): Promise<ChannelMetricsReport> {
        const listing = await this.listingRepo.findById(listingId);
        if (!listing) {
            throw new NotFoundError('Activo no encontrado');
        }

        // La dirección del canal es un dato reservado, así que consultarla no
        // puede quedar abierto: revelaría la identidad del activo de un listing
        // blind a cualquiera que dispare la verificación.
        if (actor.role !== UserRole.ADMIN && !listing.isOwnedBy(actor.id)) {
            throw new ForbiddenError('Solo el vendedor o la plataforma pueden verificar este activo.');
        }

        const { assetType, assetData } = listing.assetDataFor(true);
        if (assetType !== AssetType.YOUTUBE) {
            throw new ValidationError('Este activo no es un canal de YouTube.');
        }

        const declaredUrl = assetData.channelUrl;
        if (typeof declaredUrl !== 'string' || declaredUrl.trim() === '') {
            throw new ValidationError(
                'Este activo no tiene cargada la dirección del canal, así que no hay nada que verificar.',
            );
        }

        // Lanza ValidationError con la explicación si la dirección no sirve.
        const snapshot = await this.reader.read(YouTubeChannelRef.parse(declaredUrl));
        if (!snapshot) {
            throw new NotFoundError(
                'No encontramos ese canal en YouTube. Puede haber cambiado de dirección o dejado de estar disponible.',
            );
        }

        const declaredSubscribers = typeof assetData.subscribers === 'number' ? assetData.subscribers : 0;

        return {
            channelId: snapshot.channelId,
            title: snapshot.title,
            declaredSubscribers,
            reportedSubscribers: snapshot.subscribers,
            subscribersMatch: subscribersAreConsistent(declaredSubscribers, snapshot.subscribers),
            views: snapshot.views,
            publicVideos: snapshot.publicVideos,
            checkedAt: snapshot.readAt,
        };
    }
}
