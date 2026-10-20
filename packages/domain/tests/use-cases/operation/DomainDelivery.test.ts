import { describe, it, expect, vi } from 'vitest';
import {
    StartDomainDeliveryUseCase,
    CheckDomainDeliveryUseCase,
    DOMAIN_TO_BUYER_STEP_KEY,
} from '../../../src/use-cases/operation/DomainDeliveryUseCases';
import {
    IListingRepository,
    IOperationRepository,
    ITransferStepProgressRepository,
} from '../../../src/ports/Repositories';
import { IDomainRegistrar, RegistrarMove, RegistrarPortfolioEntry } from '../../../src/ports/IDomainRegistrar';
import { TransferStepProgress, TransferStepScope } from '../../../src/entities/TransferStepProgress';
import { Operation } from '../../../src/entities/Operation';
import { Listing } from '../../../src/entities/Listing';
import { DomainName } from '../../../src/value-objects/DomainName';
import { Money } from '../../../src/value-objects/Money';
import { UniqueEntityID } from '../../../src/value-objects/UniqueEntityID';
import { WebStrategy } from '../../../src/strategies/WebStrategy';
import { YouTubeStrategy } from '../../../src/strategies/YouTubeStrategy';
import { Actor } from '../../../src/ports/Actor';
import { UserRole } from '@marketplace/shared-types';
import {
    DomainRegistrarRejectedError,
    ForbiddenError,
    InvalidStateError,
    ValidationError,
} from '../../../src/errors/DomainError';

/*
 * La entrega del dominio de un sitio: con el pago confirmado, la plataforma
 * —que es titular— le traslada el dominio a la cuenta de Hostinger que el
 * comprador declaró. El paso `domain-to-buyer` se cumple cuando Hostinger
 * informa el traslado como completado.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-25T12:00:00Z');
const DOMAIN = 'ejemplo.com';
const BUYER_EMAIL = 'comprador@correo.com';
const SELLER_ID = new UniqueEntityID();
const BUYER_ID = new UniqueEntityID();
const ADMIN: Actor = { id: new UniqueEntityID().toString(), role: UserRole.ADMIN };

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

function anOperation(
    listing: Listing,
    state: 'asset_in_custody' | 'payment_received',
    recipient: string | null = BUYER_EMAIL,
): Operation {
    const op = Operation.create({
        listingId: listing.id,
        buyerId: BUYER_ID,
        sellerId: SELLER_ID,
        offerPrice: Money.fromCents(200000, 'USD'),
    });
    op.acceptCurrentOffer('seller');
    op.signContract();
    if (recipient) op.declareRecipientIdentity(recipient, BUYER_ID.toString());
    op.initiateTransfer({ declaredBy: SELLER_ID, controlCeded: true });
    op.confirmAssetCustody({ verifiedBy: new UniqueEntityID(), isPrimaryOwner: true, accessSecured: true, metrics: {} });
    if (state === 'payment_received') {
        op.confirmBuyerPayment({
            provider: 'transferencia',
            method: 'transferencia_bancaria',
            amountCents: op.buyerPays!.getCents(),
            currency: op.buyerPays!.getCurrency(),
        });
    }
    return op;
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

interface RegistrarState {
    portfolio: RegistrarPortfolioEntry | null;
    outgoing: RegistrarMove | null;
    startFailure?: Error;
}

function anEntry(): RegistrarPortfolioEntry {
    return {
        domain: DomainName.parse(DOMAIN),
        status: 'active',
        isLocked: false,
        sixtyDayLockExpiresAt: null,
        registeredAt: null,
        expiresAt: null,
    };
}

function aMove(status: RegistrarMove['status']): RegistrarMove {
    return { domain: DomainName.parse(DOMAIN), status, createdAt: NOW, updatedAt: NOW };
}

function aRegistrar(state: RegistrarState): IDomainRegistrar {
    return {
        getPortfolioEntry: vi.fn(async () => state.portfolio),
        getIncomingMove: vi.fn(async () => null),
        acceptIncomingMove: vi.fn(),
        getOutgoingMove: vi.fn(async () => state.outgoing),
        startOutgoingMove: vi.fn(async () => {
            if (state.startFailure) throw state.startFailure;
            state.outgoing = aMove('initiated');
        }),
        cancelOutgoingMove: vi.fn(),
        getAuthCode: vi.fn(),
    };
}

function setup(
    options: {
        listing?: Listing;
        state?: 'asset_in_custody' | 'payment_received';
        recipient?: string | null;
        portfolio?: RegistrarPortfolioEntry | null;
    } = {},
) {
    const listing = options.listing ?? aWebListing();
    const operation = anOperation(
        listing,
        options.state ?? 'payment_received',
        options.recipient === undefined ? BUYER_EMAIL : options.recipient,
    );
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
    const registrarState: RegistrarState = {
        portfolio: options.portfolio === undefined ? anEntry() : options.portfolio,
        outgoing: null,
    };
    const registrar = aRegistrar(registrarState);
    const clock = { now: NOW };
    const start = new StartDomainDeliveryUseCase(operationRepo, listingRepo, progressRepo, registrar, () => clock.now);
    const check = new CheckDomainDeliveryUseCase(operationRepo, listingRepo, progressRepo, registrar, () => clock.now);
    const id = operation.id.toString();
    const row = () => progressRepo.rows.get(`operation:${id}:${DOMAIN_TO_BUYER_STEP_KEY}`);

    return { start, check, id, operation, registrar, registrarState, progressRepo, clock, row };
}

describe('StartDomainDeliveryUseCase', () => {
    it('con el pago confirmado inicia el traslado al mail del comprador y abre el paso con plazo de 10 días', async () => {
        const { start, id, registrar, row } = setup();

        const status = await start.execute(id, ADMIN);

        expect(status).toBe('waiting');
        expect(registrar.startOutgoingMove).toHaveBeenCalledTimes(1);
        const [domain, email] = vi.mocked(registrar.startOutgoingMove).mock.calls[0];
        expect(domain.toString()).toBe(DOMAIN);
        expect(email.getValue()).toBe(BUYER_EMAIL);
        expect(row()?.status).toBe('waiting');
        expect(row()?.startedAt).toEqual(NOW);
        expect(row()?.deadlineAt).toEqual(new Date(NOW.getTime() + 10 * DAY_MS));
        expect(row()?.evidence).toEqual({ recipientEmail: BUYER_EMAIL });
    });

    it('iniciarlo de nuevo con el traslado en curso no lo repite', async () => {
        const { start, id, registrar, progressRepo } = setup();
        await start.execute(id, ADMIN);
        const saves = progressRepo.saves;

        const status = await start.execute(id, ADMIN);

        expect(status).toBe('waiting');
        expect(registrar.startOutgoingMove).toHaveBeenCalledTimes(1);
        expect(progressRepo.saves).toBe(saves);
    });

    it('vencida la invitación, se puede volver a iniciar con un plazo nuevo', async () => {
        const { start, id, registrar, registrarState, clock, row } = setup();
        await start.execute(id, ADMIN);
        clock.now = new Date(NOW.getTime() + 11 * DAY_MS);
        row()!.markExpired(clock.now);
        registrarState.outgoing = null;

        const status = await start.execute(id, ADMIN);

        expect(status).toBe('waiting');
        expect(registrar.startOutgoingMove).toHaveBeenCalledTimes(2);
        expect(row()?.startedAt).toEqual(clock.now);
        expect(row()?.deadlineAt).toEqual(new Date(clock.now.getTime() + 10 * DAY_MS));
    });

    it('si Hostinger rechaza el mail, el admin recibe un mensaje claro y el paso no se abre', async () => {
        const { start, id, registrarState, progressRepo } = setup();
        registrarState.startFailure = new DomainRegistrarRejectedError('422 invalid customer');

        await expect(start.execute(id, ADMIN)).rejects.toThrow(
            `Hostinger no aceptó el traslado a ${BUYER_EMAIL}: puede que ese mail no tenga una cuenta de Hostinger. Pedile al comprador que lo revise.`,
        );
        expect(progressRepo.saves).toBe(0);
    });

    it('sin el pago confirmado todavía no se entrega', async () => {
        const { start, id, registrar } = setup({ state: 'asset_in_custody' });

        await expect(start.execute(id, ADMIN)).rejects.toThrow(InvalidStateError);
        expect(registrar.startOutgoingMove).not.toHaveBeenCalled();
    });

    it('sin el mail del comprador no hay a dónde entregar', async () => {
        const { start, id, registrar } = setup({ recipient: null });

        await expect(start.execute(id, ADMIN)).rejects.toThrow(
            'El comprador todavía no indicó el mail de su cuenta de Hostinger.',
        );
        expect(registrar.startOutgoingMove).not.toHaveBeenCalled();
    });

    it('una cuenta declarada antes, que no es un mail, se rechaza antes de llamar a Hostinger', async () => {
        const { start, id, registrar } = setup({ recipient: 'mi-usuario-namecheap' });

        await expect(start.execute(id, ADMIN)).rejects.toThrow(ValidationError);
        expect(registrar.startOutgoingMove).not.toHaveBeenCalled();
    });

    it('sin el dominio en la cartera de la plataforma no hay qué entregar', async () => {
        const { start, id, registrar } = setup({ portfolio: null });

        await expect(start.execute(id, ADMIN)).rejects.toThrow(
            'El dominio no está en la cuenta de la plataforma: no hay qué entregar.',
        );
        expect(registrar.startOutgoingMove).not.toHaveBeenCalled();
    });

    it('solo un admin', async () => {
        const { start, id, registrar } = setup();

        await expect(start.execute(id, { id: BUYER_ID.toString(), role: UserRole.BUYER })).rejects.toThrow(ForbiddenError);
        expect(registrar.startOutgoingMove).not.toHaveBeenCalled();
    });

    it('un canal no se entrega por acá', async () => {
        const { start, id } = setup({ listing: aYouTubeListing(), recipient: 'yo@gmail.com' });

        await expect(start.execute(id, ADMIN)).rejects.toThrow(ValidationError);
    });
});

describe('CheckDomainDeliveryUseCase', () => {
    it('sin entrega iniciada sigue pendiente y no consulta a Hostinger', async () => {
        const { check, id, registrar } = setup();

        expect(await check.execute(id)).toBe('pending');
        expect(registrar.getOutgoingMove).not.toHaveBeenCalled();
    });

    it('con el traslado en curso sigue esperando y anota la comprobación', async () => {
        const { start, check, id, clock, row } = setup();
        await start.execute(id, ADMIN);
        clock.now = new Date(NOW.getTime() + DAY_MS);

        expect(await check.execute(id)).toBe('waiting');
        expect(row()?.lastCheckedAt).toEqual(clock.now);
    });

    it('con el traslado completado el paso se cumple', async () => {
        const { start, check, id, registrarState, row } = setup();
        await start.execute(id, ADMIN);
        registrarState.outgoing = aMove('completed');

        expect(await check.execute(id)).toBe('done');
        expect(row()?.status).toBe('done');
        expect(row()?.evidence).toMatchObject({ recipientEmail: BUYER_EMAIL, moveStatus: 'completed' });
    });

    it('si Hostinger ya no lista el traslado y el dominio salió de la cartera, también se cumple', async () => {
        const { start, check, id, registrarState, row } = setup();
        await start.execute(id, ADMIN);
        registrarState.outgoing = null;
        registrarState.portfolio = null;

        expect(await check.execute(id)).toBe('done');
        expect(row()?.evidence).toMatchObject({ leftPortfolio: true });
    });

    it('sin traslado pero con el dominio todavía en la cartera no se cumple', async () => {
        const { start, check, id, registrarState } = setup();
        await start.execute(id, ADMIN);
        registrarState.outgoing = null;

        expect(await check.execute(id)).toBe('waiting');
    });

    it('un paso ya cumplido no se vuelve a consultar', async () => {
        const { start, check, id, registrar, registrarState } = setup();
        await start.execute(id, ADMIN);
        registrarState.outgoing = aMove('completed');
        await check.execute(id);
        vi.mocked(registrar.getOutgoingMove).mockClear();

        expect(await check.execute(id)).toBe('done');
        expect(registrar.getOutgoingMove).not.toHaveBeenCalled();
    });

    it('un paso vencido todavía se cumple si el traslado se completó', async () => {
        const { start, check, id, registrarState, clock, row } = setup();
        await start.execute(id, ADMIN);
        clock.now = new Date(NOW.getTime() + 11 * DAY_MS);
        row()!.markExpired(clock.now);
        registrarState.outgoing = aMove('completed');

        expect(await check.execute(id)).toBe('done');
    });

    it('un paso vencido sin señal sigue vencido', async () => {
        const { start, check, id, clock, row } = setup();
        await start.execute(id, ADMIN);
        clock.now = new Date(NOW.getTime() + 11 * DAY_MS);
        row()!.markExpired(clock.now);

        expect(await check.execute(id)).toBe('expired');
    });
});
