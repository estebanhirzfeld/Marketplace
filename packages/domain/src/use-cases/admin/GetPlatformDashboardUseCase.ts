import {
    IListingRepository,
    IOperationRepository,
    IReportRepository,
} from '../../ports/Repositories';
import { Actor } from '../../ports/Actor';
import { OperationStatus } from '../../entities/Operation';
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
 * Las etapas donde el próximo movimiento es de la plataforma.
 *
 * `transfer_in_progress` espera que un admin verifique y declare la custodia;
 * `asset_in_custody` espera el pago del comprador, que un admin puede registrar
 * si entró por transferencia bancaria; `payment_received` espera que un admin
 * liquide y cierre. Las etapas de negociación y de firma no están: ahí el turno
 * es de las partes.
 */
const ESPERAN_A_LA_PLATAFORMA: OperationStatus[] = [
    'transfer_in_progress',
    'asset_in_custody',
    'payment_received',
];

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
    ) {}

    async execute(actor: Actor): Promise<PlatformDashboard> {
        if (actor.role !== UserRole.ADMIN) {
            throw new ForbiddenError('Solo la plataforma puede ver este tablero.');
        }

        const [enRevision, publicados, enCurso, esperando, completadas, abiertas] =
            await Promise.all([
                this.listingRepo.findByStatus('under_review'),
                this.listingRepo.findByStatus('published'),
                this.operationRepo.findByStatuses(EN_CURSO),
                this.operationRepo.findByStatuses(ESPERAN_A_LA_PLATAFORMA),
                this.operationRepo.findByStatuses(['completed']),
                this.reportRepo.findOpen(),
            ]);

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
            pending: esperando.map((op) => {
                const { id, createdAt, props } = op.toSnapshot();
                return {
                    id,
                    status: props.status,
                    listingId: props.listingId.toString(),
                    amountCents: op.buyerPays?.getCents(),
                    currency: op.buyerPays?.getCurrency(),
                    waitingSince: createdAt,
                };
            }),
        };
    }
}
