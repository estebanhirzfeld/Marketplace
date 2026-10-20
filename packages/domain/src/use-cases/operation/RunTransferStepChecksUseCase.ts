import {
    IListingRepository,
    IOperationRepository,
    ITransferStepProgressRepository,
} from '../../ports/Repositories';
import { TransferStepProgress } from '../../entities/TransferStepProgress';
import { isWebListing } from '../../services/WebCustody';
import { CheckDomainCustodyUseCase } from './CheckDomainCustodyUseCase';
import { PlatformNotifier } from '../../services/PlatformNotifier';

/** Lo único que el job necesita de la comprobación del dominio. */
export type DomainCustodyCheck = Pick<CheckDomainCustodyUseCase, 'execute'>;

/** Lo único que el job necesita de los avisos de la plataforma. */
export type TransferStepNotifier = Pick<PlatformNotifier, 'transferStepReminder' | 'transferStepExpired'>;

export interface TransferStepChecksFailure {
    operationId: string;
    error: string;
}

export interface TransferStepChecksSummary {
    /** Operaciones cuyo dominio se comprobó sin error. */
    checked: number;
    /** Las que fallaron; el recorrido siguió con las demás. */
    failures: TransferStepChecksFailure[];
    reminded: number;
    escalated: number;
}

/**
 * La pasada periódica del traspaso de un sitio.
 *
 * Hostinger no tiene webhooks, así que alguien tiene que preguntar. Cada
 * corrida hace dos cosas:
 *
 * 1. Comprueba el dominio de cada operación de un sitio con la transferencia
 *    en curso (`CheckDomainCustodyUseCase`): ahí se acepta el traslado entrante
 *    y se cumple el paso cuando el dominio llega a la cartera.
 * 2. Vigila los plazos de los pasos abiertos: recuerda cuando falta poco y,
 *    vencido el plazo, marca el paso como vencido y lo escala a la plataforma.
 *
 * Es idempotente: el recordatorio y la escalada se anotan en el paso y no se
 * repiten, y el paso se guarda ANTES de avisar, así que una corrida que se
 * corta entre las dos cosas no manda el aviso dos veces (a lo sumo lo pierde,
 * que es la misma regla de los notificadores: un aviso nunca tumba nada).
 *
 * Un error con un dominio o con un paso no corta el recorrido: queda en el
 * resumen y se sigue con el resto. Sin registrador configurado, la primera
 * parte no corre pero los plazos se vigilan igual.
 */
export class RunTransferStepChecksUseCase {
    constructor(
        private readonly operationRepo: IOperationRepository,
        private readonly listingRepo: IListingRepository,
        private readonly progressRepo: ITransferStepProgressRepository,
        private readonly notifier: TransferStepNotifier,
        private readonly custodyCheck?: DomainCustodyCheck,
        /** El reloj entra por acá para poder fijarlo en los tests. */
        private readonly now: () => Date = () => new Date(),
    ) {}

    async execute(): Promise<TransferStepChecksSummary> {
        const summary: TransferStepChecksSummary = { checked: 0, failures: [], reminded: 0, escalated: 0 };

        if (this.custodyCheck) {
            await this.checkDomains(this.custodyCheck, summary);
        }

        // Un solo instante para toda la pasada de plazos: que dos pasos con el
        // mismo plazo no queden de lados distintos del límite.
        const now = this.now();
        for (const step of await this.progressRepo.findOpen()) {
            if (step.scope !== 'operation') continue;
            try {
                await this.watchDeadline(step, now, summary);
            } catch (error) {
                summary.failures.push({ operationId: step.scopeId, error: messageOf(error) });
            }
        }

        return summary;
    }

    private async checkDomains(check: DomainCustodyCheck, summary: TransferStepChecksSummary): Promise<void> {
        const operations = await this.operationRepo.findByStatuses(['transfer_in_progress']);

        for (const operation of operations) {
            const operationId = operation.id.toString();
            try {
                const listing = await this.listingRepo.findById(operation.listingId.toString());
                if (!listing || !isWebListing(listing)) continue;

                await check.execute(operationId);
                summary.checked += 1;
            } catch (error) {
                summary.failures.push({ operationId, error: messageOf(error) });
            }
        }
    }

    private async watchDeadline(
        step: TransferStepProgress,
        now: Date,
        summary: TransferStepChecksSummary,
    ): Promise<void> {
        const operation = await this.operationRepo.findById(step.scopeId);
        // El paso apunta a una operación que ya no existe: no hay a quién avisar.
        if (!operation) return;

        if (step.needsReminder(now)) {
            step.markReminded(now);
            await this.progressRepo.save(step);
            await this.notifier.transferStepReminder(operation, step);
            summary.reminded += 1;
            return;
        }

        if (!step.isOverdue(now)) return;

        if (step.isOpen()) {
            step.markExpired(now);
        }
        if (step.needsEscalation(now)) {
            step.markEscalated(now);
            await this.progressRepo.save(step);
            await this.notifier.transferStepExpired(operation, step);
            summary.escalated += 1;
            return;
        }
        await this.progressRepo.save(step);
    }
}

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
