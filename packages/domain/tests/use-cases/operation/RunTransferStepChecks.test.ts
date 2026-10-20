import { describe, it, expect, vi } from 'vitest';
import {
    RunTransferStepChecksUseCase,
    DomainCustodyCheck,
    TransferStepNotifier,
} from '../../../src/use-cases/operation/RunTransferStepChecksUseCase';
import {
    IListingRepository,
    IOperationRepository,
    ITransferStepProgressRepository,
} from '../../../src/ports/Repositories';
import { TransferStepProgress, TransferStepScope } from '../../../src/entities/TransferStepProgress';
import { Operation } from '../../../src/entities/Operation';
import { Listing } from '../../../src/entities/Listing';
import { Money } from '../../../src/value-objects/Money';
import { UniqueEntityID } from '../../../src/value-objects/UniqueEntityID';
import { WebStrategy } from '../../../src/strategies/WebStrategy';
import { YouTubeStrategy } from '../../../src/strategies/YouTubeStrategy';
import { ServiceUnavailableError } from '../../../src/errors/DomainError';

/*
 * El job periódico del traspaso de un sitio. Hostinger no tiene webhooks, así
 * que alguien tiene que preguntar: comprueba el dominio de cada operación en
 * curso y vigila los plazos de los pasos abiertos.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-25T12:00:00Z');
const SELLER_ID = new UniqueEntityID();
const BUYER_ID = new UniqueEntityID();

function aWebListing(domain = 'ejemplo.com'): Listing {
    return Listing.reconstitute(
        {
            sellerId: SELLER_ID,
            assetStrategy: new WebStrategy({ monthlyRevenueUsd: Money.fromCents(50000, 'USD'), domain }),
            askingPrice: Money.fromCents(1000000, 'USD'),
            status: 'in_operation',
        },
        new UniqueEntityID(),
        new Date(),
    );
}

function aYouTubeListing(): Listing {
    return Listing.reconstitute(
        {
            sellerId: SELLER_ID,
            assetStrategy: new YouTubeStrategy({
                monthlyRevenueUsd: Money.fromCents(50000, 'USD'),
                subscribers: 10000,
                isMonetized: true,
            }),
            askingPrice: Money.fromCents(1000000, 'USD'),
            status: 'in_operation',
        },
        new UniqueEntityID(),
        new Date(),
    );
}

function anOperationInTransfer(listing: Listing): Operation {
    const op = Operation.create({
        listingId: listing.id,
        buyerId: BUYER_ID,
        sellerId: SELLER_ID,
        offerPrice: Money.fromCents(200000, 'USD'),
    });
    op.acceptCurrentOffer('seller');
    op.signContract();
    op.initiateTransfer({ declaredBy: SELLER_ID, controlCeded: true });
    return op;
}

/** Como el repositorio real: `findOpen` trae pendientes, en espera y vencidos sin escalar. */
class InMemoryProgressRepo implements ITransferStepProgressRepository {
    readonly rows = new Map<string, TransferStepProgress>();
    saves = 0;

    private key(scope: TransferStepScope, scopeId: string, stepKey: string): string {
        return `${scope}:${scopeId}:${stepKey}`;
    }
    async findByScope(scope: TransferStepScope, scopeId: string) {
        return [...this.rows.values()].filter((r) => r.scope === scope && r.scopeId === scopeId);
    }
    async find(scope: TransferStepScope, scopeId: string, stepKey: string) {
        return this.rows.get(this.key(scope, scopeId, stepKey)) ?? null;
    }
    async findOpen() {
        return [...this.rows.values()].filter(
            (r) => r.isOpen() || (r.status === 'expired' && !r.escalatedAt),
        );
    }
    async save(progress: TransferStepProgress) {
        this.saves += 1;
        this.rows.set(this.key(progress.scope, progress.scopeId, progress.stepKey), progress);
    }
}

function aStep(operation: Operation, deadlineAt: Date): TransferStepProgress {
    const step = TransferStepProgress.start({
        scope: 'operation',
        scopeId: operation.id.toString(),
        stepKey: 'domain-to-platform',
        startedAt: new Date(deadlineAt.getTime() - 10 * DAY_MS),
        deadlineAt,
    });
    step.markWaiting(new Date(deadlineAt.getTime() - 9 * DAY_MS), { awaitingEmailConfirmation: true });
    return step;
}

function setup(entries: { listing: Listing }[], options: { withCheck?: boolean } = {}) {
    const listings = entries.map((e) => e.listing);
    const operations = listings.map((l) => anOperationInTransfer(l));
    const operationRepo: IOperationRepository = {
        findById: vi.fn(async (id: string) => operations.find((o) => o.id.toString() === id) ?? null),
        findByListing: vi.fn(),
        findByParty: vi.fn(),
        findByStatuses: vi.fn(async (statuses) =>
            operations.filter((o) => statuses.includes(o.status)),
        ),
        save: vi.fn(),
    };
    const listingRepo: IListingRepository = {
        findById: vi.fn(async (id: string) => listings.find((l) => l.id.toString() === id) ?? null),
        findPublished: vi.fn(),
        findBySeller: vi.fn(),
        findByStatus: vi.fn(),
        findHeldBy: vi.fn(),
        save: vi.fn(),
    };
    const progressRepo = new InMemoryProgressRepo();
    const check: DomainCustodyCheck = { execute: vi.fn(async () => 'pending' as const) };
    const notifier: TransferStepNotifier = {
        transferStepReminder: vi.fn(async () => {}),
        transferStepExpired: vi.fn(async () => {}),
    };
    const clock = { now: NOW };
    const useCase = new RunTransferStepChecksUseCase(
        operationRepo,
        listingRepo,
        progressRepo,
        notifier,
        options.withCheck === false ? undefined : check,
        () => clock.now,
    );

    return { useCase, operations, progressRepo, check, notifier, clock };
}

describe('RunTransferStepChecksUseCase', () => {
    describe('comprobación del dominio', () => {
        it('comprueba el dominio de cada operación de un sitio con la transferencia en curso', async () => {
            const { useCase, operations, check } = setup([
                { listing: aWebListing('uno.com') },
                { listing: aWebListing('dos.com') },
            ]);

            const summary = await useCase.execute();

            expect(check.execute).toHaveBeenCalledTimes(2);
            expect(check.execute).toHaveBeenCalledWith(operations[0].id.toString());
            expect(check.execute).toHaveBeenCalledWith(operations[1].id.toString());
            expect(summary.checked).toBe(2);
        });

        it('no comprueba operaciones que no son de un sitio', async () => {
            const { useCase, check } = setup([{ listing: aYouTubeListing() }]);

            const summary = await useCase.execute();

            expect(check.execute).not.toHaveBeenCalled();
            expect(summary.checked).toBe(0);
        });

        it('un error en un dominio no corta el recorrido y queda en el resumen', async () => {
            const { useCase, operations, check } = setup([
                { listing: aWebListing('uno.com') },
                { listing: aWebListing('dos.com') },
            ]);
            vi.mocked(check.execute).mockRejectedValueOnce(new ServiceUnavailableError('Hostinger no responde'));

            const summary = await useCase.execute();

            expect(check.execute).toHaveBeenCalledTimes(2);
            expect(summary.checked).toBe(1);
            expect(summary.failures).toEqual([
                { operationId: operations[0].id.toString(), error: 'Hostinger no responde' },
            ]);
        });

        it('sin registrador configurado no comprueba nada pero igual vigila los plazos', async () => {
            const { useCase, operations, progressRepo, notifier } = setup([{ listing: aWebListing() }], {
                withCheck: false,
            });
            await progressRepo.save(aStep(operations[0], new Date(NOW.getTime() + DAY_MS)));

            const summary = await useCase.execute();

            expect(summary.checked).toBe(0);
            expect(notifier.transferStepReminder).toHaveBeenCalledTimes(1);
        });
    });

    describe('plazos', () => {
        it('recuerda una sola vez cuando faltan 3 días o menos para el plazo', async () => {
            const { useCase, operations, progressRepo, notifier } = setup([{ listing: aWebListing() }]);
            const step = aStep(operations[0], new Date(NOW.getTime() + 2 * DAY_MS));
            await progressRepo.save(step);

            const first = await useCase.execute();
            const second = await useCase.execute();

            expect(notifier.transferStepReminder).toHaveBeenCalledTimes(1);
            expect(notifier.transferStepReminder).toHaveBeenCalledWith(operations[0], step);
            expect(step.remindedAt).toEqual(NOW);
            expect(first.reminded).toBe(1);
            expect(second.reminded).toBe(0);
        });

        it('lejos del plazo no avisa nada', async () => {
            const { useCase, operations, progressRepo, notifier } = setup([{ listing: aWebListing() }]);
            await progressRepo.save(aStep(operations[0], new Date(NOW.getTime() + 5 * DAY_MS)));
            const savesBefore = progressRepo.saves;

            const summary = await useCase.execute();

            expect(notifier.transferStepReminder).not.toHaveBeenCalled();
            expect(notifier.transferStepExpired).not.toHaveBeenCalled();
            expect(progressRepo.saves).toBe(savesBefore);
            expect(summary).toMatchObject({ reminded: 0, escalated: 0 });
        });

        it('vencido el plazo, el paso pasa a expired y se escala una sola vez', async () => {
            const { useCase, operations, progressRepo, notifier } = setup([{ listing: aWebListing() }]);
            const step = aStep(operations[0], new Date(NOW.getTime() - DAY_MS));
            await progressRepo.save(step);

            const first = await useCase.execute();
            const second = await useCase.execute();

            expect(step.status).toBe('expired');
            expect(step.escalatedAt).toEqual(NOW);
            expect(notifier.transferStepExpired).toHaveBeenCalledTimes(1);
            expect(notifier.transferStepExpired).toHaveBeenCalledWith(operations[0], step);
            expect(notifier.transferStepReminder).not.toHaveBeenCalled();
            expect(first.escalated).toBe(1);
            expect(second.escalated).toBe(0);
        });

        it('un paso ya vencido pero sin escalar se escala', async () => {
            const { useCase, operations, progressRepo, notifier } = setup([{ listing: aWebListing() }]);
            const step = aStep(operations[0], new Date(NOW.getTime() - DAY_MS));
            step.markExpired(NOW);
            await progressRepo.save(step);

            await useCase.execute();

            expect(notifier.transferStepExpired).toHaveBeenCalledTimes(1);
            expect(step.escalatedAt).toEqual(NOW);
        });

        it('guarda el paso antes de avisar, para que un reintento no repita el aviso', async () => {
            const { useCase, operations, progressRepo, notifier } = setup([{ listing: aWebListing() }]);
            const step = aStep(operations[0], new Date(NOW.getTime() + DAY_MS));
            await progressRepo.save(step);
            vi.mocked(notifier.transferStepReminder).mockImplementationOnce(async () => {
                expect(progressRepo.rows.get(`operation:${operations[0].id}:domain-to-platform`)?.remindedAt).toEqual(NOW);
            });

            await useCase.execute();

            expect(notifier.transferStepReminder).toHaveBeenCalledTimes(1);
        });

        it('un paso cuya operación ya no existe se saltea sin cortar el recorrido', async () => {
            const { useCase, operations, progressRepo, notifier } = setup([{ listing: aWebListing() }]);
            const huerfano = TransferStepProgress.start({
                scope: 'operation',
                scopeId: new UniqueEntityID().toString(),
                stepKey: 'domain-to-platform',
                startedAt: new Date(NOW.getTime() - 9 * DAY_MS),
                deadlineAt: new Date(NOW.getTime() + DAY_MS),
            });
            await progressRepo.save(huerfano);
            await progressRepo.save(aStep(operations[0], new Date(NOW.getTime() + DAY_MS)));

            const summary = await useCase.execute();

            expect(notifier.transferStepReminder).toHaveBeenCalledTimes(1);
            expect(summary.reminded).toBe(1);
        });
    });
});
