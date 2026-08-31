import {
    IListingRepository,
    IOperationRepository,
    IReportRepository,
    IUserRepository,
} from '../../ports/Repositories';
import { Actor } from '../../ports/Actor';
import { Operation, OperationStatus } from '../../entities/Operation';
import { ForbiddenError } from '../../errors/DomainError';
import { UserRole } from '@marketplace/shared-types';

/**
 * Una operación esperando que la plataforma haga algo.
 *
 * `waitingSince` es la fecha de la operación, no la de su último cambio: no
 * guardamos historial de transiciones, así que lo honesto es decir desde cuándo
 * existe y no inventar cuánto lleva parada en esta etapa.
 */
export interface PendingOperation {
    id: string;
    status: OperationStatus;
    listingId: string;
    amountCents?: number;
    currency?: string;
    waitingSince: Date;
    /**
     * Con qué reconocer la fila.
     *
     * El panel mostraba únicamente el estado y el monto, así que dos
     * operaciones esperando lo mismo eran indistinguibles y había que entrar a
     * cada una para saber cuál era cuál. La plataforma ve los datos reservados
     * —es su trabajo—, así que acá el nombre del activo va completo.
     */
    assetName?: string;
    assetType?: string;
    buyerName?: string;
    sellerName?: string;
}

export interface PlatformDashboard {
    /** Cuántos activos esperan aprobación para salir al mercado. */
    listingsToReview: number;
    /** Activos publicados hoy en el mercado. */
    publishedListings: number;
    /** Operaciones en curso, en cualquier etapa posterior a la negociación. */
    operationsInProgress: number;
    /** Reclamos abiertos, que nadie cerró todavía. */
    openReports: number;
    /**
     * Lo que la plataforma se lleva de las operaciones ya cerradas, en
     * centavos. Solo cuenta las completadas: comprometido no es cobrado.
     */
    earnedCents: number;
    currency: string;
    /** Las operaciones cuyo próximo paso lo da un admin, más vieja primero. */
    pending: PendingOperation[];
}

/**
 * Las etapas donde el próximo movimiento es siempre de la plataforma.
 *
 * `transfer_in_progress` espera que un admin verifique y declare la custodia;
 * `asset_in_custody` espera el pago del comprador, que un admin puede registrar
 * si entró por transferencia bancaria; `payment_received` espera que un admin
 * liquide y cierre.
 */
const ESPERAN_A_LA_PLATAFORMA: OperationStatus[] = [
    'transfer_in_progress',
    'asset_in_custody',
    'payment_received',
];

/**
 * `contract_pending` va aparte porque depende del activo.
 *
 * Firmar el tripartito exige que la plataforma ya pueda tomar la custodia
 * (`assertCanBeTransferred`), así que mientras no haya constancia de acceso al
 * activo el turno es nuestro y no de las partes — que es exactamente la
 * situación en la que la operación se quedaba detenida sin que el panel la
 * mostrara. Con la constancia ya registrada solo falta que corra el plazo, y
 * ahí no hay nada que hacer.
 */
const EN_CURSO: OperationStatus[] = [
    'contract_pending',
    'contract_signed',
    ...ESPERAN_A_LA_PLATAFORMA,
];

/**
 * El tablero de la plataforma.
 *
 * El panel de admin era solo la cola de revisión, así que las tres etapas donde
 * la operación queda esperando un movimiento nuestro —custodia, cobro y
 * liquidación— no se veían en ningún lado: había que entrar operación por
 * operación para descubrir cuál estaba parada.
 */
export class GetPlatformDashboardUseCase {
    constructor(
        private readonly listingRepo: IListingRepository,
        private readonly operationRepo: IOperationRepository,
        private readonly reportRepo: IReportRepository,
        private readonly userRepo: IUserRepository,
    ) {}

    async execute(actor: Actor): Promise<PlatformDashboard> {
        if (actor.role !== UserRole.ADMIN) {
            throw new ForbiddenError('Solo la plataforma puede ver este tablero.');
        }

        const [enRevision, publicados, enCurso, esperando, firmaPendiente, completadas, abiertas] =
            await Promise.all([
                this.listingRepo.findByStatus('under_review'),
                this.listingRepo.findByStatus('published'),
                this.operationRepo.findByStatuses(EN_CURSO),
                this.operationRepo.findByStatuses(ESPERAN_A_LA_PLATAFORMA),
                this.operationRepo.findByStatuses(['contract_pending']),
                this.operationRepo.findByStatuses(['completed']),
                this.reportRepo.findOpen(),
            ]);

        // De las que esperan firma, solo son nuestras las que están trabadas
        // por falta de acceso al activo. Se resuelve activo por activo porque
        // el plazo de espera lo fija la estrategia de cada uno.
        const trabadasPorAcceso = (
            await Promise.all(
                firmaPendiente.map(async (op) => {
                    const listingId = op.toSnapshot().props.listingId.toString();
                    const listing = await this.listingRepo.findById(listingId);
                    return listing && !listing.transferableFrom() ? op : undefined;
                }),
            )
        ).filter((op): op is NonNullable<typeof op> => op !== undefined);

        // La comisión se calcula dentro de la entidad al fijar el precio final,
        // así que acá solo se suma lo que ya está calculado.
        let earnedCents = 0;
        let currency = 'USD';
        for (const op of completadas) {
            const ganancia = op.platformEarns;
            if (ganancia) {
                earnedCents += ganancia.getCents();
                currency = ganancia.getCurrency();
            }
        }

        return {
            listingsToReview: enRevision.length,
            publishedListings: publicados.length,
            operationsInProgress: enCurso.length,
            openReports: abiertas.length,
            earnedCents,
            currency,
            pending: await this.describir([...trabadasPorAcceso, ...esperando]),
        };
    }
    /**
     * Le pone nombre a cada fila del panel.
     *
     * Las lecturas van en paralelo y sin repetir: varias operaciones pueden
     * compartir activo, y las dos partes se resuelven de a una porque cada
     * operación tiene las suyas.
     */
    private async describir(operaciones: Operation[]): Promise<PendingOperation[]> {
        const idsDeActivos = [...new Set(operaciones.map((op) => op.listingId.toString()))];
        const activos = new Map(
            await Promise.all(
                idsDeActivos.map(async (id) => [id, await this.listingRepo.findById(id)] as const),
            ),
        );

        return Promise.all(
            operaciones.map(async (op) => {
                const { id, createdAt, props } = op.toSnapshot();
                const listing = activos.get(props.listingId.toString());

                // `true`: la plataforma ve los datos reservados. Es la misma
                // razón por la que no se le pide un NDA en ninguna otra
                // pantalla — sin saber de qué activo se trata no puede
                // comprobar la titularidad ni atestiguar la custodia.
                const datos = listing?.assetDataFor(true).assetData;
                const assetName = typeof datos?.name === 'string' ? datos.name : '';

                const [buyer, seller] = await Promise.all([
                    this.userRepo.findById(props.buyerId.toString()),
                    this.userRepo.findById(props.sellerId.toString()),
                ]);

                return {
                    id,
                    status: props.status,
                    listingId: props.listingId.toString(),
                    amountCents: op.buyerPays?.getCents(),
                    currency: op.buyerPays?.getCurrency(),
                    waitingSince: createdAt,
                    assetName: assetName || undefined,
                    assetType: listing?.describeAssetType().label,
                    buyerName: buyer?.toSnapshot().props.fullName,
                    sellerName: seller?.toSnapshot().props.fullName,
                };
            }),
        );
    }
}
