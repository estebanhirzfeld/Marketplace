import { IListingRepository } from '../../ports/Repositories';
import { IContractRepository } from '../../ports/Repositories';
import { Listing } from '../../entities/Listing';

export interface ListingDetailView {
    id: string;
    status: string;
    askingPrice: { cents: number; currency: string };
    estimatedPrice: { cents: number; currency: string };
    isBlind: boolean;
    /** Datos del activo — filtrados si es blind y no hay NDA */
    assetData: Record<string, any>;
    /** Qué campos están ocultos (para que el frontend sepa qué blurrear) */
    hiddenFields: string[];
    createdAt: Date;
}

export class GetListingDetailsUseCase {
    constructor(
        private readonly listingRepo: IListingRepository,
        private readonly contractRepo: IContractRepository,
    ) {}

    async execute(listingId: string, requesterId?: string): Promise<ListingDetailView> {
        const listing = await this.listingRepo.findById(listingId);
        if (!listing) {
            throw new Error('Listing no encontrado');
        }

        const { props } = listing.toSnapshot();
        const strategyJson = props.assetStrategy.toJSON();

        // ¿Debe ofuscarse?
        let assetData = strategyJson.assetData;
        let hiddenFields: string[] = [];

        if (props.isBlind) {
            const hasNda = requesterId
                ? await this.buyerHasSignedNda(listingId, requesterId)
                : false;

            if (!hasNda) {
                const publicFields = props.assetStrategy.getPublicFields();
                const confidentialFields = props.assetStrategy.getConfidentialFields();
                hiddenFields = confidentialFields;

                // Filtrar: solo mantener los campos públicos
                const filtered: Record<string, any> = {};
                for (const field of publicFields) {
                    if (field in assetData) {
                        filtered[field] = assetData[field];
                    }
                }
                assetData = filtered;
            }
        }

        return {
            id: listing.id.toString(),
            status: props.status,
            askingPrice: {
                cents: props.askingPrice.getCents(),
                currency: props.askingPrice.getCurrency(),
            },
            estimatedPrice: {
                cents: listing.estimatedPrice.getCents(),
                currency: listing.estimatedPrice.getCurrency(),
            },
            isBlind: props.isBlind,
            assetData,
            hiddenFields,
            createdAt: listing.toSnapshot().createdAt,
        };
    }

    private async buyerHasSignedNda(listingId: string, buyerId: string): Promise<boolean> {
        const contract = await this.contractRepo.findByListingAndSigner(listingId, buyerId);
        if (!contract) return false;

        return contract.type === 'buyer_nda' && contract.isFullySigned();
    }
}
