import {
    IListingRepository,
    ICustodyAccountRepository,
} from '../../ports/Repositories';
import { Actor } from '../../ports/Actor';
import { Listing } from '../../entities/Listing';
import { TransferStep } from '../../strategies/IAssetStrategy';
import { AssetType } from '@marketplace/shared-types';

/**
 * Un listing del vendedor con sus pasos de traspaso ya resueltos.
 *
 * Antes la ruta llamaba `listing.handoverSteps()` directo. Ahora los pasos
 * pueden nombrar la cuenta de custodia concreta, y resolver cuál es exige
 * consultar persistencia: eso no puede vivir en la capa de transporte, que es
 * la única del proyecto que hoy no la toca. Por eso el use case devuelve los
 * pasos ya armados.
 */
export interface SellerListingView {
    listing: Listing;
    handoverSteps: TransferStep[];
}

/**
 * Los listings del actor, en cualquier estado, con sus pasos de traspaso.
 *
 * No hay chequeo de pertenencia porque no hay nada que chequear: se consulta
 * por el id del actor, así que estructuralmente no puede devolver los de otro.
 *
 * Las cuentas de custodia activas se cargan **una sola vez** y se indexan por
 * tipo de activo y por id: resolver el contexto de N listings no dispara N
 * consultas.
 */
export class GetMyListingsUseCase {
    constructor(
        private readonly listingRepo: IListingRepository,
        private readonly custodyRepo: ICustodyAccountRepository,
    ) {}

    async execute(actor: Actor): Promise<SellerListingView[]> {
        const [listings, activas] = await Promise.all([
            this.listingRepo.findBySeller(actor.id),
            this.custodyRepo.findActive(),
        ]);

        const porId = new Map(activas.map((c) => [c.id.toString(), c]));
        const porTipo = new Map<AssetType, string>();
        for (const cuenta of activas) {
            if (!porTipo.has(cuenta.assetType)) {
                porTipo.set(cuenta.assetType, cuenta.identifier);
            }
        }

        return listings.map((listing) => {
            const asignada = listing.platformAccess?.custodyAccountId?.toString();
            const identifier =
                (asignada && porId.get(asignada)?.identifier) ||
                porTipo.get(listing.describeAssetType().assetType);

            return {
                listing,
                handoverSteps: listing.handoverSteps(
                    identifier ? { custodyAccountIdentifier: identifier } : undefined,
                ),
            };
        });
    }
}
