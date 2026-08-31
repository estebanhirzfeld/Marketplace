import {
    IUserRepository,
    IListingRepository,
    IOperationRepository,
} from '../ports/Repositories';
import { Contract } from '../entities/Contract';
import { User } from '../entities/User';
import { Listing } from '../entities/Listing';
import { NotFoundError } from '../errors/DomainError';
import {
    ContractData,
    ContractPlatformData,
    PLATFORM_PENDING,
    ContractParty,
} from './ContractData';

function aParte(u: User): ContractParty {
    const { props } = u.toSnapshot();
    return {
        name: props.fullName,
        dni: props.dni ?? '',
        address: props.country,
        email: props.email.getValue(),
    };
}

function describirActivo(listing: Listing): { type: string; description: string } {
    const data = listing.assetDataFor(true);
    const { props } = listing.toSnapshot();
    const price = `${props.askingPrice.getCents() / 100} ${props.askingPrice.getCurrency()}`;

    return {
        type: data.assetType,
        description: `${data.assetType} · listing ${listing.id.toString()} · precio publicado ${price}`,
    };
}

/**
 * Arma los datos con los que se genera el documento de un contrato.
 *
 * Existe para que haya **una sola** definición de qué entra en el documento.
 * Estaba duplicada en SignNda y SignContract, y con la lectura del documento
 * habría quedado en tres lugares: una divergencia entre ellos produciría
 * hashes distintos para el mismo contrato, que es exactamente el fallo que
 * este mecanismo debe descartar.
 */
export class ContractDataBuilder {
    constructor(
        private readonly userRepo: IUserRepository,
        private readonly listingRepo: IListingRepository,
        private readonly operationRepo: IOperationRepository,
        private readonly platform: ContractPlatformData = PLATFORM_PENDING,
    ) {}

    async para(contract: Contract): Promise<ContractData> {
        return contract.type === 'tripartite'
            ? this.paraTripartito(contract)
            : this.paraNda(contract);
    }

    private async paraNda(contract: Contract): Promise<ContractData> {
        if (!contract.signerId) {
            throw new NotFoundError('El acuerdo no tiene un firmante asociado.');
        }

        const [firmante, listing] = await Promise.all([
            this.userRepo.findById(contract.signerId.toString()),
            this.listingRepo.findById(contract.listingId.toString()),
        ]);

        if (!firmante || !listing) {
            throw new NotFoundError('Faltan datos para generar el documento.');
        }

        const parte = aParte(firmante);
        const esDelVendedor = contract.type === 'seller_nda';

        return {
            type: contract.type,
            reference: contract.id.toString(),
            date: contract.createdAt,
            platform: this.platform,
            seller: esDelVendedor ? parte : undefined,
            buyer: esDelVendedor ? undefined : parte,
            asset: describirActivo(listing),
        };
    }

    private async paraTripartito(contract: Contract): Promise<ContractData> {
        if (!contract.operationId) {
            throw new NotFoundError('El contrato no está asociado a una operación.');
        }

        const operation = await this.operationRepo.findById(contract.operationId.toString());
        if (!operation) {
            throw new NotFoundError('Operación no encontrada');
        }

        const { props } = operation.toSnapshot();
        const [buyer, seller, listing] = await Promise.all([
            this.userRepo.findById(props.buyerId.toString()),
            this.userRepo.findById(props.sellerId.toString()),
            this.listingRepo.findById(props.listingId.toString()),
        ]);

        if (!buyer || !seller || !listing) {
            throw new NotFoundError('Faltan datos para generar el documento.');
        }

        const price = operation.finalPrice ?? operation.currentOfferPrice;

        return {
            type: 'tripartite',
            reference: operation.id.toString(),
            date: contract.createdAt,
            platform: this.platform,
            buyer: aParte(buyer),
            seller: aParte(seller),
            asset: describirActivo(listing),
            price: {
                finalCents: price.getCents(),
                buyerPaysCents: operation.buyerPays?.getCents() ?? price.getCents(),
                sellerReceivesCents: operation.sellerReceives?.getCents() ?? price.getCents(),
                totalCommissionCents: operation.platformEarns?.getCents() ?? 0,
                currency: price.getCurrency(),
            },
        };
    }
}
