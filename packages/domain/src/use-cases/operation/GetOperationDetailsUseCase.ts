import {
    IContractRepository,
    IListingRepository,
    IOperationRepository,
    IUserRepository,
} from '../../ports/Repositories';
import { Actor } from '../../ports/Actor';
import { Operation, NegotiatingParty } from '../../entities/Operation';
import { Contract } from '../../entities/Contract';
import { NotFoundError } from '../../errors/DomainError';
import { UserRole } from '@marketplace/shared-types';

/**
 * Quién está del otro lado.
 *
 * Se devuelve el nombre y no solo el identificador porque una negociación
 * contra un UUID es ilegible: el vendedor veía "tenés una oferta" sin saber de
 * quién, y el comprador negociaba contra nadie. No agrega exposición — el
 * contrato que las dos partes firman ya las nombra, y el legajo de un reclamo
 * también.
 */
export interface OperationParty {
    id: string;
    fullName: string;
}

/**
 * Con qué nombrar el activo de la operación.
 *
 * La pantalla lo identificaba con los primeros ocho caracteres de su UUID, que
 * no le dice nada a nadie. El tipo y el rubro son campos que la strategy
 * declara públicos, así que describen de qué se trata sin revelar cuál es:
 * eso sigue detrás del NDA.
 */
export interface OperationAsset {
    assetType: string;
    niche?: string;
    /**
     * Si el activo ya se puede transferir. Firmar el tripartito lo exige
     * (`assertCanBeTransferred`), así que sin este dato la pantalla ofrecía
     * firmar y el error aparecía recién al apretar el botón.
     */
    transferable: boolean;
    /**
     * Desde cuándo se va a poder. `undefined` mientras la plataforma no tenga
     * acceso al activo: sin acceso no hay fecha que prometerle a nadie, y lo
     * que falta es un movimiento de la plataforma, no del calendario.
     */
    transferableFrom?: Date;
}

export interface OperationDetailView {
    operation: Operation;
    /** Ausente si el activo ya no está; la operación sigue siendo válida. */
    asset?: OperationAsset;
    /** Qué posición ocupa quien consulta. `undefined` para un admin ajeno. */
    miParte?: NegotiatingParty;
    contratos: Contract[];
    buyer: OperationParty;
    seller: OperationParty;
}

/**
 * Detalle de una operación.
 *
 * Solo la ven sus partes — y un admin, porque los pasos de custodia y pago son
 * suyos y necesita el contexto para ejecutarlos.
 */
export class GetOperationDetailsUseCase {
    constructor(
        private readonly operationRepo: IOperationRepository,
        private readonly contractRepo: IContractRepository,
        private readonly userRepo: IUserRepository,
        private readonly listingRepo: IListingRepository,
    ) {}

    async execute(operationId: string, actor: Actor): Promise<OperationDetailView> {
        const operation = await this.operationRepo.findById(operationId);
        if (!operation) {
            throw new NotFoundError('Operación no encontrada');
        }

        let miParte: NegotiatingParty | undefined;
        if (actor.role === UserRole.ADMIN) {
            // Un admin puede no ser parte; entra por rol, sin posición propia.
            try {
                miParte = operation.partyFor(actor.id);
            } catch {
                miParte = undefined;
            }
        } else {
            // Lanza ForbiddenError si el actor es un tercero.
            miParte = operation.partyFor(actor.id);
        }

        const contratos = await this.contractRepo.findByOperation(operationId);

        const { props } = operation.toSnapshot();
        const [buyer, seller, listing] = await Promise.all([
            this.parte(props.buyerId.toString()),
            this.parte(props.sellerId.toString()),
            this.listingRepo.findById(props.listingId.toString()),
        ]);

        // `false`: alcanza con lo público para nombrarlo. Quien tenga derecho a
        // ver los datos reservados los pide en la pantalla del activo, que es
        // donde vive esa regla.
        let asset: OperationAsset | undefined;
        if (listing) {
            const { assetType, assetData } = listing.assetDataFor(false);
            asset = {
                assetType,
                niche: typeof assetData.niche === 'string' ? assetData.niche : undefined,
                transferable: listing.isReadyToTransfer(),
                transferableFrom: listing.transferableFrom(),
            };
        }

        return { operation, asset, miParte, contratos, buyer, seller };
    }

    /**
     * Un usuario borrado no debería tumbar la operación: el historial y las
     * constancias siguen siendo válidos y la contraparte tiene derecho a
     * verlos. Se muestra sin nombre antes que fallar.
     */
    private async parte(userId: string): Promise<OperationParty> {
        const user = await this.userRepo.findById(userId);
        return {
            id: userId,
            fullName: user?.toSnapshot().props.fullName ?? 'Usuario dado de baja',
        };
    }
}
