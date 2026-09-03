import {
    IListingRepository,
    IContractRepository,
    ICustodyAccountRepository,
} from '../../ports/Repositories';
import { Actor } from '../../ports/Actor';
import { Listing, ListingStatus, OwnershipVerification } from '../../entities/Listing';
import { AssetTypeDescriptor, TransferContext, TransferStep } from '../../strategies/IAssetStrategy';
import { NotFoundError } from '../../errors/DomainError';
import { ConfidentialAccess } from '../../services/ConfidentialAccess';
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
    /** Lo que este tipo de activo sabe de sí mismo. */
    descriptor: AssetTypeDescriptor;
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
        /**
         * Opcional para no romper los llamadores que solo miran el blindaje. Sin
         * él, los pasos de traspaso salen en su variante genérica: es la lectura
         * pública, y ahí nombrar una cuenta no aporta nada.
         */
        private readonly custodyRepo?: ICustodyAccountRepository,
    ) {}

    /**
     * La cuenta a nombrar en el paso de invitación:
     *   la ya asignada al listing (`platformAccess.custodyAccountId`)
     *   ─ si no hay ─
     *   la primera cuenta activa para el `AssetType` del listing.
     *
     * La segunda mitad es la que importa: el vendedor tiene que saber a quién
     * invitar ANTES de que exista ninguna constancia de acceso.
     */
    private async resolveContext(listing: Listing): Promise<TransferContext | undefined> {
        if (!this.custodyRepo) return undefined;

        const asignada = listing.platformAccess?.custodyAccountId;
        if (asignada) {
            const cuenta = await this.custodyRepo.findById(asignada.toString());
            if (cuenta) return { custodyAccountIdentifier: cuenta.identifier };
        }

        const activas = await this.custodyRepo.findActive(listing.describeAssetType().assetType);
        if (activas.length > 0) {
            return { custodyAccountIdentifier: activas[0].identifier };
        }

        return undefined;
    }

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
        const puedeVerTodo = await new ConfidentialAccess(this.contractRepo).allowed(listing, actor);
        const data = listing.assetDataFor(puedeVerTodo);

        // Los pasos de traspaso son para quien los ejecuta o los atestigua: el
        // vendedor del activo o un administrador. A un comprador o a un
        // visitante no le dicen nada y, con la cuenta de custodia nombrada,
        // filtrarían un identificador operativo de la plataforma.
        const puedeVerPasos = esDuenio || esPlataforma;
        const contexto = puedeVerPasos ? await this.resolveContext(listing) : undefined;

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
            handoverSteps: puedeVerPasos ? listing.handoverSteps(contexto) : [],
            descriptor: listing.describeAssetType(),
            createdAt: listing.toSnapshot().createdAt,
        };
    }

}
