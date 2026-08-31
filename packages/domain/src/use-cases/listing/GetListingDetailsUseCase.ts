import { IListingRepository, IContractRepository } from '../../ports/Repositories';
import { Actor } from '../../ports/Actor';
import { ListingStatus, OwnershipVerification } from '../../entities/Listing';
import { TransferStep } from '../../strategies/IAssetStrategy';
import { NotFoundError } from '../../errors/DomainError';
import { UserRole } from '@marketplace/shared-types';

export interface ListingDetailView {
    id: string;
    status: ListingStatus;
    askingPrice: { cents: number; currency: string };
    estimatedPrice: { cents: number; currency: string };
    /** Datos del activo — filtrados si es blind y no hay NDA */
    assetData: Record<string, any>;
    /** Qué campos están ocultos (para que el frontend sepa qué blurrear) */
    hiddenFields: string[];
    /**
     * Si quien mira es el vendedor de este activo. Va como booleano y no como
     * `sellerId` a propósito: exponer el identificador dejaría correlacionar
     * las publicaciones de un mismo vendedor, que es justo lo que el blindaje
     * evita. La pantalla solo necesita saber si tiene que ofrecer el formulario
     * de oferta, no de quién es el activo.
     */
    isOwnedByViewer: boolean;
    ownership?: OwnershipVerification;
    transferable: boolean;
    transferableFrom?: Date;
    /** Lo que le falta al vendedor para cedernos el activo. */
    handoverSteps: TransferStep[];
    createdAt: Date;
}

/**
 * Los estados en los que el activo ya se mostró en público alguna vez.
 *
 * `in_operation` y `sold` siguen adentro: ya estuvieron en el mercado y las
 * partes de la operación necesitan volver a abrirlos. Lo que cambia es que la
 * pantalla, viendo el estado, no debe ofrecer ofertar sobre ellos.
 */
const ESTADOS_PUBLICOS: ListingStatus[] = ['published', 'in_operation', 'sold'];

/**
 * Lectura pública: el actor es opcional porque un visitante anónimo puede ver
 * un listing. Lo que cambia con el actor es cuánto ve — un listing blind revela
 * sus datos confidenciales solo a quien firmó el NDA, y siempre a su dueño.
 */
export class GetListingDetailsUseCase {
    constructor(
        private readonly listingRepo: IListingRepository,
        private readonly contractRepo: IContractRepository,
    ) {}

    async execute(listingId: string, actor?: Actor): Promise<ListingDetailView> {
        const listing = await this.listingRepo.findById(listingId);
        if (!listing) {
            throw new NotFoundError('Activo no encontrado');
        }

        const { props } = listing.toSnapshot();

        const esDuenio = listing.isOwnedBy(actor?.id ?? '');
        const esPlataforma = actor?.role === UserRole.ADMIN;

        // Un activo que todavía no salió al mercado no existe para un tercero.
        //
        // Antes se devolvía cualquiera por id, así que un borrador ajeno era
        // alcanzable escribiendo la dirección a mano: eso expone al vendedor
        // antes de que él decida publicar. Se responde "no encontrado" y no
        // "prohibido" porque la segunda respuesta ya confirma que el activo
        // existe.
        //
        // El dueño lo ve porque es suyo, y la plataforma porque su trabajo es
        // revisarlo: sin eso la cola de revisión no podría abrirse.
        if (!ESTADOS_PUBLICOS.includes(props.status) && !esDuenio && !esPlataforma) {
            throw new NotFoundError('Activo no encontrado');
        }

        // El filtrado lo decide la entidad: una sola regla, un solo lugar.
        const puedeVerTodo = await this.puedeVerTodo(esDuenio, listingId, actor);
        const data = listing.assetDataFor(puedeVerTodo);

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
            assetData: data.assetData,
            hiddenFields: data.hiddenFields,
            isOwnedByViewer: esDuenio,
            transferable: listing.isReadyToTransfer(),
            transferableFrom: listing.transferableFrom(),
            handoverSteps: listing.handoverSteps(),
            createdAt: listing.toSnapshot().createdAt,
        };
    }

    private async puedeVerTodo(
        esDuenio: boolean,
        listingId: string,
        actor?: Actor,
    ): Promise<boolean> {
        // El vendedor nunca necesita un NDA para ver su propio activo.
        if (esDuenio) return true;
        if (!actor) return false;

        // Tampoco la plataforma. El blindaje protege al vendedor de que le
        // copien el activo sin comprarlo, y la plataforma no es ese tercero:
        // es la custodia. Un operador que no sabe de qué canal se trata no
        // puede comprobar la titularidad ni atestiguar que lo tenemos. El
        // resto del código ya lo daba por hecho —las verificaciones de
        // métricas y de titularidad dejan pasar al admin—, así que pedirle un
        // NDA acá era además incoherente: se lo firmaría a sí mismo.
        if (actor.role === UserRole.ADMIN) return true;

        const contract = await this.contractRepo.findByListingAndSigner(listingId, actor.id);
        if (!contract) return false;

        return contract.type === 'buyer_nda' && contract.isFullySigned();
    }
}
