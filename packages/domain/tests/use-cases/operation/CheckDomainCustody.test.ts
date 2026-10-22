import { describe, it, expect, vi } from 'vitest';
import { CheckDomainCustodyUseCase } from '../../../src/use-cases/operation/CheckDomainCustodyUseCase';
import {
    IListingRepository,
    IOperationRepository,
    ITransferStepProgressRepository,
} from '../../../src/ports/Repositories';
import {
    IDomainRegistrar,
    RegistrarMove,
    RegistrarPortfolioEntry,
} from '../../../src/ports/IDomainRegistrar';
import { TransferStepProgress, TransferStepScope } from '../../../src/entities/TransferStepProgress';
import { Operation } from '../../../src/entities/Operation';
import { Listing } from '../../../src/entities/Listing';
import { DomainName } from '../../../src/value-objects/DomainName';
import { Money } from '../../../src/value-objects/Money';
import { UniqueEntityID } from '../../../src/value-objects/UniqueEntityID';
import { WebStrategy } from '../../../src/strategies/WebStrategy';
import { YouTubeStrategy } from '../../../src/strategies/YouTubeStrategy';
import {
    DomainRegistrarRejectedError,
    InvalidStateError,
    NotFoundError,
    ServiceUnavailableError,
    ValidationError,
} from '../../../src/errors/DomainError';
import { PlatformNotifier } from '../../../src/services/PlatformNotifier';
import { NegotiationNotifier } from '../../../src/services/NegotiationNotifier';
import { PLATFORM_ACTOR_ID } from '../../../src/use-cases/operation/CheckDomainCustodyUseCase';
import { Notification } from '../../../src/entities/Notification';
import { User } from '../../../src/entities/User';
import { Email } from '../../../src/value-objects/Email';
import { UserRole } from '@marketplace/shared-types';

const DOMAIN = 'ejemplo.com';
const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-20T12:00:00Z');
const INVITED_AT = new Date('2026-10-18T09:00:00Z');
const SELLER_ID = new UniqueEntityID();
const BUYER_ID = new UniqueEntityID();

function aWebListing(): Listing {
    return Listing.reconstitute(
        {
            sellerId: SELLER_ID,
            assetStrategy: new WebStrategy({ monthlyRevenueUsd: Money.fromCents(50000, 'USD'), domain: DOMAIN }),
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

function anOperation(listing: Listing, state: 'contract_signed' | 'transfer_in_progress'): Operation {
    const op = Operation.create({
        listingId: listing.id,
        buyerId: BUYER_ID,
        sellerId: SELLER_ID,
        offerPrice: Money.fromCents(200000, 'USD'),
    });
    op.acceptCurrentOffer('seller');
    op.signContract();
    if (state === 'transfer_in_progress') {
        op.initiateTransfer({ declaredBy: SELLER_ID, controlCeded: true });
    }
    return op;
}

function aMove(status: RegistrarMove['status']): RegistrarMove {
    return { domain: DomainName.parse(DOMAIN), status, createdAt: INVITED_AT, updatedAt: INVITED_AT };
}

function anEntry(): RegistrarPortfolioEntry {
    return {
        domain: DomainName.parse(DOMAIN),
        status: 'active',
        isLocked: true,
        sixtyDayLockExpiresAt: null,
        registeredAt: null,
        expiresAt: null,
    };
}

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
        return [...this.rows.values()].filter((r) => r.isOpen());
    }
    async save(progress: TransferStepProgress) {
        this.saves += 1;
        this.rows.set(this.key(progress.scope, progress.scopeId, progress.stepKey), progress);
    }
}

/** Lo que el registrador fake informa y los fallos que se le inyectan, mutables entre llamadas. */
interface FakeRegistrarState {
    portfolio: RegistrarPortfolioEntry | null;
    incoming: RegistrarMove | null;
    readFailure?: Error;
    acceptFailure?: Error;
    /** Si es `false`, aceptar no cambia el estado del traslado (Hostinger tarda en reflejarlo). */
    acceptTakesEffect: boolean;
}

function aRegistrar(state: FakeRegistrarState): IDomainRegistrar {
    return {
        getPortfolioEntry: vi.fn(async () => {
            if (state.readFailure) throw state.readFailure;
            return state.portfolio;
        }),
        getIncomingMove: vi.fn(async () => {
            if (state.readFailure) throw state.readFailure;
            return state.incoming;
        }),
        acceptIncomingMove: vi.fn(async () => {
            if (state.acceptFailure) throw state.acceptFailure;
            if (state.acceptTakesEffect && state.incoming) {
                state.incoming = { ...state.incoming, status: 'activating' };
            }
        }),
        getOutgoingMove: vi.fn(),
        startOutgoingMove: vi.fn(),
        cancelOutgoingMove: vi.fn(),
        getAuthCode: vi.fn(),
    };
}

function setup(options: {
    listing?: Listing;
    state?: 'contract_signed' | 'transfer_in_progress';
    incoming?: RegistrarMove | null;
    portfolio?: RegistrarPortfolioEntry | null;
} = {}) {
    const listing = options.listing ?? aWebListing();
    const operation = anOperation(listing, options.state ?? 'transfer_in_progress');
    const operationRepo: IOperationRepository = {
        findById: vi.fn(async (id: string) => (id === operation.id.toString() ? operation : null)),
        findByListing: vi.fn(),
        findByParty: vi.fn(),
        findByStatuses: vi.fn(),
        save: vi.fn(),
    };
    const listingRepo: IListingRepository = {
        findById: vi.fn(async () => listing),
        findPublished: vi.fn(),
        findBySeller: vi.fn(),
        findByStatus: vi.fn(),
        findHeldBy: vi.fn(),
        save: vi.fn(),
    };
    const progressRepo = new InMemoryProgressRepo();
    const registrarState: FakeRegistrarState = {
        portfolio: options.portfolio ?? null,
        incoming: options.incoming ?? null,
        acceptTakesEffect: true,
    };
    const registrar = aRegistrar(registrarState);
    const clock = { now: NOW };
    const sent: Notification[] = [];
    const admin = User.create({
        email: Email.create('admin@custodia.com'),
        fullName: 'Admin',
        passwordHash: 'x'.repeat(60),
        role: UserRole.ADMIN,
    });
    const platformNotifier = new PlatformNotifier(
        { notify: vi.fn(async (ns: Notification[]) => { sent.push(...ns); }) },
        {
            findById: vi.fn().mockResolvedValue(null),
            findByEmail: vi.fn().mockResolvedValue(null),
            findByRole: vi.fn(async (role) => (role === UserRole.ADMIN ? [admin] : [])),
            save: vi.fn(),
        },
    );
    const partyNotices: Notification[] = [];
    const negotiationNotifier = new NegotiationNotifier({
        notify: vi.fn(async (ns: Notification[]) => {
            partyNotices.push(...ns);
        }),
    });
    const useCase = new CheckDomainCustodyUseCase(
        operationRepo,
        listingRepo,
        progressRepo,
        registrar,
        () => clock.now,
        platformNotifier,
        undefined,
        negotiationNotifier,
    );
    const id = operation.id.toString();
    const row = () => progressRepo.rows.get(`operation:${id}:domain-to-platform`);
    const snapshot = () => ({
        status: row()?.status,
        evidence: row()?.evidence,
        deadlineAt: row()?.deadlineAt,
        startedAt: row()?.startedAt,
    });

    return { useCase, id, registrar, registrarState, clock, progressRepo, row, snapshot, sent, operation, operationRepo, partyNotices };
}

describe('CheckDomainCustodyUseCase', () => {
    describe('transiciones', () => {
        it('sin traslado entrante ni dominio en el portfolio sigue pendiente y no crea la fila', async () => {
            const { useCase, id, progressRepo, row } = setup();

            const status = await useCase.execute(id);

            expect(status).toBe('pending');
            expect(row()).toBeUndefined();
            expect(progressRepo.saves).toBe(0);
        });

        it('traslado "initiated": lo acepta y pasa a waiting con la invitación como inicio y plazo de 10 días', async () => {
            const { useCase, id, registrar, row } = setup({ incoming: aMove('initiated') });

            const status = await useCase.execute(id);

            expect(status).toBe('waiting');
            expect(registrar.acceptIncomingMove).toHaveBeenCalledTimes(1);
            expect(row()?.status).toBe('waiting');
            expect(row()?.startedAt).toEqual(INVITED_AT);
            expect(row()?.deadlineAt).toEqual(new Date(INVITED_AT.getTime() + 10 * DAY_MS));
            expect(row()?.lastCheckedAt).toEqual(NOW);
            expect(row()?.evidence).toMatchObject({ moveStatus: 'initiated', acceptedAt: NOW.toISOString() });
        });

        it('traslado "activating": pasa a waiting esperando el mail de Hostinger, sin volver a aceptar', async () => {
            const { useCase, id, registrar, row } = setup({ incoming: aMove('activating') });

            const status = await useCase.execute(id);

            expect(status).toBe('waiting');
            expect(registrar.acceptIncomingMove).not.toHaveBeenCalled();
            expect(row()?.evidence).toMatchObject({ moveStatus: 'activating', awaitingEmailConfirmation: true });
        });

        it.each(['deleted', 'expired', 'suspended', 'pending_setup'] as const)(
            'el dominio en la cartera pero %s no cumple el paso',
            async (portfolioStatus) => {
                const { useCase, id, row } = setup({
                    portfolio: { ...anEntry(), status: portfolioStatus },
                    incoming: aMove('activating'),
                });

                const status = await useCase.execute(id);

                expect(status).toBe('waiting');
                expect(row()?.status).toBe('waiting');
            },
        );

        it('dominio en el portfolio: done con evidencia, aunque no hubiera fila', async () => {
            const { useCase, id, registrar, row } = setup({ portfolio: anEntry() });

            const status = await useCase.execute(id);

            expect(status).toBe('done');
            expect(registrar.getIncomingMove).not.toHaveBeenCalled();
            expect(row()?.status).toBe('done');
            expect(row()?.evidence).toMatchObject({ inPortfolio: true, portfolioStatus: 'active' });
        });

        it('una fila waiting pasa a done cuando el dominio aparece en el portfolio', async () => {
            const { useCase, id, registrarState, row } = setup({ incoming: aMove('initiated') });
            await useCase.execute(id);

            registrarState.portfolio = anEntry();
            const status = await useCase.execute(id);

            expect(status).toBe('done');
            expect(row()?.evidence).toMatchObject({ acceptedAt: NOW.toISOString(), inPortfolio: true });
        });

        it('un paso vencido todavía puede cumplirse si el dominio aparece', async () => {
            const { useCase, id, registrarState, clock, row } = setup({ incoming: aMove('activating') });
            await useCase.execute(id);
            clock.now = new Date(INVITED_AT.getTime() + 11 * DAY_MS);
            row()!.markExpired(clock.now);

            registrarState.portfolio = anEntry();
            const status = await useCase.execute(id);

            expect(status).toBe('done');
        });

        it('un paso vencido sin dominio en el portfolio queda vencido y no vuelve a aceptar', async () => {
            const { useCase, id, registrar, clock, row } = setup({ incoming: aMove('initiated') });
            await useCase.execute(id);
            clock.now = new Date(INVITED_AT.getTime() + 11 * DAY_MS);
            row()!.markExpired(clock.now);

            const status = await useCase.execute(id);

            expect(status).toBe('expired');
            expect(registrar.acceptIncomingMove).toHaveBeenCalledTimes(1);
        });
    });

    describe('idempotencia', () => {
        it('dos comprobaciones seguidas aceptan una sola vez y dejan la fila igual', async () => {
            const { useCase, id, registrar, snapshot } = setup({ incoming: aMove('initiated') });

            await useCase.execute(id);
            const after = snapshot();
            await useCase.execute(id);

            expect(registrar.acceptIncomingMove).toHaveBeenCalledTimes(1);
            expect(snapshot()).toEqual(after);
        });

        it('si Hostinger tarda en reflejar la aceptación y el traslado sigue "initiated", no se acepta de nuevo', async () => {
            const { useCase, id, registrar, registrarState } = setup({ incoming: aMove('initiated') });
            registrarState.acceptTakesEffect = false;

            await useCase.execute(id);
            await useCase.execute(id);

            expect(registrarState.incoming?.status).toBe('initiated');
            expect(registrar.acceptIncomingMove).toHaveBeenCalledTimes(1);
        });

        it('con la fila en done no vuelve a consultar al registrador, aunque la custodia ya esté confirmada', async () => {
            const { useCase, id, registrar, operation } = setup({ portfolio: anEntry() });
            await useCase.execute(id);
            vi.mocked(registrar.getPortfolioEntry).mockClear();

            const status = await useCase.execute(id);

            expect(status).toBe('done');
            expect(operation.status).toBe('asset_in_custody');
            expect(registrar.getPortfolioEntry).not.toHaveBeenCalled();
        });
    });

    /*
     * Ver el dominio activo en la cuenta de la plataforma ES la custodia de un
     * sitio: no queda nada que una persona tenga que comprobar. El job y el
     * botón del admin hacen lo mismo.
     */
    describe('custodia automática', () => {
        it('con el dominio activo en nuestra cuenta, confirma la custodia y avisa al comprador', async () => {
            const { useCase, id, operation, operationRepo, partyNotices } = setup({ portfolio: anEntry() });

            await useCase.execute(id);

            expect(operation.status).toBe('asset_in_custody');
            expect(operation.custodyVerification).toMatchObject({ isPrimaryOwner: true, accessSecured: true });
            expect(operation.custodyVerification?.verifiedBy.toString()).toBe(PLATFORM_ACTOR_ID);
            expect(operationRepo.save).toHaveBeenCalledWith(operation);
            expect(partyNotices.map((n) => n.type)).toContain('activo_en_custodia');
        });

        it('si el paso quedó cumplido pero la custodia no se guardó, la confirma sin volver a consultar', async () => {
            const { useCase, id, operation, registrar, progressRepo } = setup();
            const done = TransferStepProgress.start({
                scope: 'operation',
                scopeId: id,
                stepKey: 'domain-to-platform',
                startedAt: INVITED_AT,
            });
            done.markDone(NOW, { evidence: { inPortfolio: true } });
            await progressRepo.save(done);

            const status = await useCase.execute(id);

            expect(status).toBe('done');
            expect(operation.status).toBe('asset_in_custody');
            expect(registrar.getPortfolioEntry).not.toHaveBeenCalled();
        });

        it('con el traslado todavía en curso no confirma nada', async () => {
            const { useCase, id, operation, operationRepo } = setup({ incoming: aMove('activating') });

            await useCase.execute(id);

            expect(operation.status).toBe('transfer_in_progress');
            expect(operationRepo.save).not.toHaveBeenCalled();
        });
    });

    /*
     * Si el traslado del vendedor se cae en Hostinger y vuelve a iniciar otro
     * (por ejemplo, después de que la plataforma rechazó su cesión), el nuevo
     * es otro intento: se acepta y su plazo es el de la invitación nueva.
     */
    describe('un traslado nuevo', () => {
        const NEW_INVITE = new Date(INVITED_AT.getTime() + 12 * DAY_MS);
        const aNewMove = (status: RegistrarMove['status']): RegistrarMove => ({
            domain: DomainName.parse(DOMAIN),
            status,
            createdAt: NEW_INVITE,
            updatedAt: NEW_INVITE,
        });

        it('sobre un paso en curso, se acepta y reinicia el plazo', async () => {
            const { useCase, id, registrar, registrarState, clock, row } = setup({ incoming: aMove('initiated') });
            await useCase.execute(id);

            clock.now = new Date(NEW_INVITE.getTime() + DAY_MS);
            registrarState.incoming = aNewMove('initiated');
            const status = await useCase.execute(id);

            expect(status).toBe('waiting');
            expect(registrar.acceptIncomingMove).toHaveBeenCalledTimes(2);
            expect(row()?.startedAt).toEqual(NEW_INVITE);
            expect(row()?.deadlineAt).toEqual(new Date(NEW_INVITE.getTime() + 10 * DAY_MS));
        });

        it('sobre un paso vencido, también se acepta', async () => {
            const { useCase, id, registrar, registrarState, clock, row } = setup({ incoming: aMove('initiated') });
            await useCase.execute(id);
            clock.now = new Date(INVITED_AT.getTime() + 11 * DAY_MS);
            row()!.markExpired(clock.now);

            clock.now = new Date(NEW_INVITE.getTime() + DAY_MS);
            registrarState.incoming = aNewMove('initiated');
            const status = await useCase.execute(id);

            expect(status).toBe('waiting');
            expect(registrar.acceptIncomingMove).toHaveBeenCalledTimes(2);
        });
    });

    describe('guarda de aceptación', () => {
        it('no consulta ni acepta nada si la operación no está en transfer_in_progress', async () => {
            const { useCase, id, registrar } = setup({ state: 'contract_signed', incoming: aMove('initiated') });

            await expect(useCase.execute(id)).rejects.toThrow(InvalidStateError);

            expect(registrar.getPortfolioEntry).not.toHaveBeenCalled();
            expect(registrar.getIncomingMove).not.toHaveBeenCalled();
            expect(registrar.acceptIncomingMove).not.toHaveBeenCalled();
        });

        it('no consulta ni acepta nada si la operación no es de un sitio web', async () => {
            const { useCase, id, registrar } = setup({ listing: aYouTubeListing() });

            await expect(useCase.execute(id)).rejects.toThrow(ValidationError);

            expect(registrar.getPortfolioEntry).not.toHaveBeenCalled();
            expect(registrar.acceptIncomingMove).not.toHaveBeenCalled();
        });

        it('operación inexistente: NotFoundError sin consultar al registrador', async () => {
            const { useCase, registrar } = setup();

            await expect(useCase.execute('no-existe')).rejects.toThrow(NotFoundError);
            expect(registrar.getPortfolioEntry).not.toHaveBeenCalled();
        });
    });

    describe('errores del registrador', () => {
        it('un error transitorio sube y no crea la fila', async () => {
            const { useCase, id, registrarState, progressRepo } = setup();
            registrarState.readFailure = new ServiceUnavailableError('Hostinger no responde');

            await expect(useCase.execute(id)).rejects.toThrow(ServiceUnavailableError);

            expect(progressRepo.saves).toBe(0);
        });

        it('un error transitorio con la fila en curso solo anota lastCheckedAt', async () => {
            const { useCase, id, registrarState, clock, row, snapshot } = setup({ incoming: aMove('activating') });
            await useCase.execute(id);
            const before = snapshot();

            clock.now = new Date(NOW.getTime() + 60_000);
            registrarState.readFailure = new ServiceUnavailableError('Hostinger no responde');
            await expect(useCase.execute(id)).rejects.toThrow(ServiceUnavailableError);

            expect(snapshot()).toEqual(before);
            expect(row()?.lastCheckedAt).toEqual(clock.now);
        });

        it('si el registrador rechaza aceptar, el error sube y la fila no se crea', async () => {
            const { useCase, id, registrarState, progressRepo } = setup({ incoming: aMove('initiated') });
            registrarState.acceptFailure = new DomainRegistrarRejectedError('rechazado');

            await expect(useCase.execute(id)).rejects.toThrow(DomainRegistrarRejectedError);

            expect(progressRepo.saves).toBe(0);
        });
    });

    describe('aviso de dominio en custodia', () => {
        it('avisa a la plataforma cuando el dominio llega a la cartera, una sola vez', async () => {
            const { useCase, id, registrarState, sent } = setup({ incoming: aMove('activating') });
            await useCase.execute(id);
            expect(sent).toHaveLength(0);

            registrarState.portfolio = anEntry();
            await useCase.execute(id);
            await useCase.execute(id);

            expect(sent).toHaveLength(1);
            expect(sent[0].type).toBe('dominio_en_custodia');
            expect(sent[0].toSnapshot().props.operationId?.toString()).toBe(id);
        });

        it('sin el dominio en la cartera no avisa nada', async () => {
            const { useCase, id, sent } = setup({ incoming: aMove('initiated') });

            await useCase.execute(id);

            expect(sent).toHaveLength(0);
        });
    });
});
