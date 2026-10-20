import {
    IListingRepository,
    IOperationRepository,
    ITransferStepProgressRepository,
} from '../../ports/Repositories';
import { IDomainRegistrar, RegistrarMove } from '../../ports/IDomainRegistrar';
import {
    TransferStepProgress,
    TransferStepProgressStatus,
} from '../../entities/TransferStepProgress';
import { DomainName } from '../../value-objects/DomainName';
import { isWebListing, websiteDomainOf } from '../../services/WebCustody';
import { InvalidStateError, NotFoundError, ServiceUnavailableError, ValidationError } from '../../errors/DomainError';

/** La `key` del paso de `WebStrategy` que comprueba este caso de uso. */
export const DOMAIN_TO_PLATFORM_STEP_KEY = 'domain-to-platform';

/** Cuánto dura la invitación de traslado de Hostinger: 10 días desde que se crea. */
export const DOMAIN_TRANSFER_INVITATION_DAYS = 10;

const DAY_MS = 24 * 60 * 60 * 1000;

function invitationDeadline(move: RegistrarMove): Date {
    return new Date(move.createdAt.getTime() + DOMAIN_TRANSFER_INVITATION_DAYS * DAY_MS);
}

/**
 * Comprueba si el dominio de un sitio ya llegó a la cuenta de la plataforma y
 * deja anotado cómo va el paso `domain-to-platform` de la operación.
 *
 * Es la contraparte de `VerifyDomainOwnershipUseCase`: no se le pide nada al
 * vendedor, se le pregunta al registrador y se registra lo que se ve.
 *
 * - Sin traslado entrante y sin el dominio en la cartera: sigue pendiente y no
 *   se crea ninguna fila (fila ausente = pendiente sin plazo).
 * - Traslado «initiated»: se acepta y el paso pasa a `waiting`. Aceptar NO
 *   completa el paso; falta que la plataforma confirme el mail de Hostinger.
 * - Traslado «activating» (o ya cumplido pero sin aparecer aún en la cartera):
 *   `waiting`, esperando esa confirmación.
 * - Dominio en la cartera: `done`.
 *
 * El plazo es el de la invitación: 10 días desde que Hostinger la creó
 * (`createdAt` del traslado). Se fija recién cuando el traslado aparece, y no
 * desde `initiateTransfer`, porque ahí el vendedor solo declara que lo va a
 * mover y todavía no hay invitación que venza. Si el traslado nunca aparece no
 * hay fila ni plazo: lo que falta en ese caso es un aviso al vendedor, que
 * llega con el job periódico.
 *
 * Es idempotente: aceptar queda registrado en la evidencia (`acceptedAt`) y no
 * se repite aunque Hostinger tarde en reflejarlo; con el estado sin cambios,
 * solo se actualiza `lastCheckedAt`.
 *
 * La guarda va antes de tocar al registrador: solo se acepta un dominio que
 * corresponde a una operación de un sitio web en `transfer_in_progress`. Sin
 * ella, cualquiera que invite un dominio a la cuenta de la plataforma lograría
 * que lo aceptara.
 *
 * Sin actor porque lo dispara también un job: la autorización la hace quien lo
 * invoca (la ruta de admin).
 */
export class CheckDomainCustodyUseCase {
    constructor(
        private readonly operationRepo: IOperationRepository,
        private readonly listingRepo: IListingRepository,
        private readonly progressRepo: ITransferStepProgressRepository,
        private readonly registrar: IDomainRegistrar,
        /** El reloj entra por acá para poder fijarlo en los tests. */
        private readonly now: () => Date = () => new Date(),
    ) {}

    async execute(operationId: string): Promise<TransferStepProgressStatus> {
        const operation = await this.operationRepo.findById(operationId);
        if (!operation) {
            throw new NotFoundError('Operación no encontrada');
        }

        if (operation.status !== 'transfer_in_progress') {
            throw new InvalidStateError(
                'Solo se comprueba el dominio de una operación con la transferencia en curso.',
            );
        }

        const listing = await this.listingRepo.findById(operation.listingId.toString());
        if (!listing) {
            throw new NotFoundError('Activo no encontrado');
        }
        if (!isWebListing(listing)) {
            throw new ValidationError('Esta operación no es de un sitio web.');
        }
        const domain = websiteDomainOf(listing);

        const existing = await this.progressRepo.find('operation', operationId, DOMAIN_TO_PLATFORM_STEP_KEY);
        // Cumplido o rechazado no se reabre. Vencido sí puede cumplirse: lo
        // resuelve una persona, y que el dominio aparezca es resolverlo.
        if (existing && !existing.isOpen() && existing.status !== 'expired') {
            return existing.status;
        }

        const now = this.now();

        try {
            const entry = await this.registrar.getPortfolioEntry(domain);
            if (entry) {
                const progress = existing ?? this.start(operationId, now);
                progress.markDone(now, {
                    evidence: { inPortfolio: true, portfolioStatus: entry.status },
                });
                await this.progressRepo.save(progress);
                return progress.status;
            }

            // Un paso vencido solo se cumple con el dominio en la cartera.
            if (existing?.status === 'expired') {
                return existing.status;
            }

            const move = await this.registrar.getIncomingMove(domain);
            if (!move) {
                if (existing) {
                    existing.recordCheck(now);
                    await this.progressRepo.save(existing);
                }
                return existing?.status ?? 'pending';
            }

            const progress = existing ?? this.start(operationId, move.createdAt, invitationDeadline(move));
            await this.advance(progress, move, domain, now);
            await this.progressRepo.save(progress);
            return progress.status;
        } catch (error) {
            // Nada se decidió: solo queda anotado que se intentó comprobar.
            if (error instanceof ServiceUnavailableError && existing?.isOpen()) {
                existing.recordCheck(now);
                await this.progressRepo.save(existing);
            }
            throw error;
        }
    }

    private start(operationId: string, startedAt: Date, deadlineAt?: Date): TransferStepProgress {
        return TransferStepProgress.start({
            scope: 'operation',
            scopeId: operationId,
            stepKey: DOMAIN_TO_PLATFORM_STEP_KEY,
            startedAt,
            deadlineAt,
        });
    }

    private async advance(
        progress: TransferStepProgress,
        move: RegistrarMove,
        domain: DomainName,
        now: Date,
    ): Promise<void> {
        const alreadyAccepted = typeof progress.evidence.acceptedAt === 'string';

        if (move.status === 'initiated' && !alreadyAccepted) {
            await this.registrar.acceptIncomingMove(domain);
            this.observe(progress, now, {
                moveStatus: move.status,
                acceptedAt: now.toISOString(),
            });
            return;
        }

        this.observe(progress, now, {
            moveStatus: move.status,
            awaitingEmailConfirmation: true,
        });
    }

    /** `pending` pasa a `waiting` con la evidencia; ya en `waiting` solo anota la comprobación. */
    private observe(progress: TransferStepProgress, now: Date, evidence: Record<string, unknown>): void {
        if (progress.status === 'pending') {
            progress.markWaiting(now, evidence);
        } else {
            progress.recordCheck(now);
        }
    }
}
