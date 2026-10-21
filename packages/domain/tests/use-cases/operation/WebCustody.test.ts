import { describe, it, expect, vi } from 'vitest';
import { InitiateTransferUseCase } from '../../../src/use-cases/operation/InitiateTransferUseCase';
import { ConfirmCustodyUseCase } from '../../../src/use-cases/operation/ConfirmCustodyUseCase';
import { GetOperationDetailsUseCase } from '../../../src/use-cases/operation/GetOperationDetailsUseCase';
import {
    IContractRepository,
    ICustodyAccountRepository,
    IListingRepository,
    IOperationRepository,
    ITransferStepProgressRepository,
    IUserRepository,
} from '../../../src/ports/Repositories';
import { TransferStepProgress } from '../../../src/entities/TransferStepProgress';
import { IDomainRegistrar, RegistrarPortfolioEntry } from '../../../src/ports/IDomainRegistrar';
import { Actor } from '../../../src/ports/Actor';
import { Operation } from '../../../src/entities/Operation';
import { Listing } from '../../../src/entities/Listing';
import { CustodyAccount } from '../../../src/entities/CustodyAccount';
import { WebStrategy } from '../../../src/strategies/WebStrategy';
import { YouTubeStrategy } from '../../../src/strategies/YouTubeStrategy';
import { DomainName } from '../../../src/value-objects/DomainName';
import { Money } from '../../../src/value-objects/Money';
import { UniqueEntityID } from '../../../src/value-objects/UniqueEntityID';
import { InvalidStateError, ServiceUnavailableError } from '../../../src/errors/DomainError';
import { AssetType, UserRole } from '@marketplace/shared-types';

const BUYER_ID = new UniqueEntityID();
const SELLER_ID = new UniqueEntityID();
const SELLER: Actor = { id: SELLER_ID.toString(), role: UserRole.SELLER };
const ADMIN: Actor = { id: 'admin-id', role: UserRole.ADMIN };
const CUSTODIA = { accessSecured: true, metrics: { sessions: 1200 } };

function aWebListing(): Listing {
    return Listing.create({
        sellerId: SELLER_ID,
        assetStrategy: new WebStrategy({ monthlyRevenueUsd: Money.fromCents(210000, 'USD'), domain: 'ejemplo.com' }),
        askingPrice: Money.fromCents(6800000, 'USD'),
    });
}

function aYouTubeListing(): Listing {
    return Listing.create({
        sellerId: SELLER_ID,
        assetStrategy: new YouTubeStrategy({
            monthlyRevenueUsd: Money.fromCents(50000, 'USD'),
            subscribers: 10000,
            isMonetized: true,
        }),
        askingPrice: Money.fromCents(1000000, 'USD'),
    });
}

function anOperation(state: 'contract_signed' | 'transfer_in_progress'): Operation {
    const op = Operation.create({
        listingId: new UniqueEntityID(),
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

function anAccount(assetType: AssetType, identifier: string): CustodyAccount {
    return CustodyAccount.create({ label: identifier, identifier, assetType });
}

function operationRepoWith(operation: Operation): IOperationRepository {
    return {
        findById: vi.fn().mockResolvedValue(operation),
        findByListing: vi.fn().mockResolvedValue([]),
        findByParty: vi.fn().mockResolvedValue([]),
        findByStatuses: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
    };
}

function listingRepoWith(listing: Listing): IListingRepository {
    return {
        findById: vi.fn().mockResolvedValue(listing),
        findPublished: vi.fn().mockResolvedValue([]),
        findBySeller: vi.fn().mockResolvedValue([]),
        findByStatus: vi.fn().mockResolvedValue([]),
        findHeldBy: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
    };
}

function custodyRepoWith(active: CustodyAccount[]): ICustodyAccountRepository {
    return {
        findById: vi.fn(async (id: string) => active.find((a) => a.id.toString() === id) ?? null),
        findAll: vi.fn().mockResolvedValue(active),
        findActive: vi.fn(async (assetType?: AssetType) =>
            active.filter((a) => assetType === undefined || a.assetType === assetType),
        ),
        save: vi.fn().mockResolvedValue(undefined),
    };
}

function aRegistrar(portfolio: () => Promise<RegistrarPortfolioEntry | null>): IDomainRegistrar {
    return {
        getPortfolioEntry: vi.fn(portfolio),
        getIncomingMove: vi.fn(),
        acceptIncomingMove: vi.fn(),
        getOutgoingMove: vi.fn(),
        startOutgoingMove: vi.fn(),
        cancelOutgoingMove: vi.fn(),
        getAuthCode: vi.fn(),
    };
}

const inPortfolio: RegistrarPortfolioEntry = {
    domain: DomainName.parse('ejemplo.com'),
    status: 'active',
    isLocked: true,
    sixtyDayLockExpiresAt: null,
    registeredAt: null,
    expiresAt: null,
};

describe('InitiateTransferUseCase — cuenta de custodia de un sitio sin platformAccess', () => {
    it('congela la primera cuenta de custodia activa de tipo web', async () => {
        const web = anAccount(AssetType.WEB, 'custodia-web@traspaso.com');
        const otraWeb = anAccount(AssetType.WEB, 'otra-web@traspaso.com');
        const youtube = anAccount(AssetType.YOUTUBE, 'custodia-yt@traspaso.com');
        const op = anOperation('contract_signed');
        const custodyRepo = custodyRepoWith([youtube, web, otraWeb]);

        await new InitiateTransferUseCase(
            operationRepoWith(op),
            listingRepoWith(aWebListing()),
            undefined,
            custodyRepo,
        ).execute(op.id.toString(), { controlCeded: true }, SELLER);

        expect(custodyRepo.findActive).toHaveBeenCalledWith(AssetType.WEB);
        expect(op.transferInitiation?.custodyAccountId?.toString()).toBe(web.id.toString());
    });

    it('si el sitio tiene platformAccess, manda el de la constancia y no busca otra cuenta', async () => {
        const vigente = anAccount(AssetType.WEB, 'vigente@traspaso.com');
        const listing = aWebListing();
        listing.registerPlatformAccess({
            verifiedBy: new UniqueEntityID(),
            accessSince: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
            custodyAccountId: vigente.id,
            heldRole: 'owner',
        });
        const op = anOperation('contract_signed');
        const custodyRepo = custodyRepoWith([anAccount(AssetType.WEB, 'otra@traspaso.com'), vigente]);

        await new InitiateTransferUseCase(operationRepoWith(op), listingRepoWith(listing), undefined, custodyRepo)
            .execute(op.id.toString(), { controlCeded: true }, SELLER);

        expect(custodyRepo.findActive).not.toHaveBeenCalled();
        expect(op.transferInitiation?.custodyAccountId?.toString()).toBe(vigente.id.toString());
    });

    it('sin cuentas activas de tipo web no congela ninguna', async () => {
        const op = anOperation('contract_signed');

        await new InitiateTransferUseCase(
            operationRepoWith(op),
            listingRepoWith(aWebListing()),
            undefined,
            custodyRepoWith([anAccount(AssetType.YOUTUBE, 'custodia-yt@traspaso.com')]),
        ).execute(op.id.toString(), { controlCeded: true }, SELLER);

        expect(op.transferInitiation?.custodyAccountId).toBeUndefined();
    });

    it('un canal de YouTube sin platformAccess sigue sin cuenta congelada y no consulta cuentas', async () => {
        const op = anOperation('contract_signed');
        const custodyRepo = custodyRepoWith([anAccount(AssetType.YOUTUBE, 'custodia-yt@traspaso.com')]);

        await new InitiateTransferUseCase(operationRepoWith(op), listingRepoWith(aYouTubeListing()), undefined, custodyRepo)
            .execute(op.id.toString(), { controlCeded: true }, SELLER);

        expect(custodyRepo.findActive).not.toHaveBeenCalled();
        expect(op.transferInitiation?.custodyAccountId).toBeUndefined();
    });
});

describe('ConfirmCustodyUseCase — sitio web', () => {
    it('sin platformAccess congela la cuenta de custodia web activa', async () => {
        const web = anAccount(AssetType.WEB, 'custodia-web@traspaso.com');
        const op = anOperation('transfer_in_progress');

        await new ConfirmCustodyUseCase(
            operationRepoWith(op),
            listingRepoWith(aWebListing()),
            undefined,
            custodyRepoWith([web]),
        ).execute(op.id.toString(), { ...CUSTODIA, isPrimaryOwner: true }, ADMIN);

        expect(op.custodyVerification?.custodyAccountId?.toString()).toBe(web.id.toString());
    });

    it('con registrador, isPrimaryOwner sale del portfolio y no de lo que mande el admin', async () => {
        const op = anOperation('transfer_in_progress');
        const registrar = aRegistrar(async () => inPortfolio);

        await new ConfirmCustodyUseCase(
            operationRepoWith(op),
            listingRepoWith(aWebListing()),
            undefined,
            undefined,
            registrar,
        ).execute(op.id.toString(), { ...CUSTODIA, isPrimaryOwner: false }, ADMIN);

        expect(op.status).toBe('asset_in_custody');
        expect(op.custodyVerification?.isPrimaryOwner).toBe(true);
        expect(registrar.getPortfolioEntry).toHaveBeenCalledWith(DomainName.parse('ejemplo.com'));
    });

    it('con registrador, el dominio fuera del portfolio rechaza la custodia aunque el admin diga que sí', async () => {
        const op = anOperation('transfer_in_progress');
        const operationRepo = operationRepoWith(op);

        await expect(
            new ConfirmCustodyUseCase(
                operationRepo,
                listingRepoWith(aWebListing()),
                undefined,
                undefined,
                aRegistrar(async () => null),
            ).execute(op.id.toString(), { ...CUSTODIA, isPrimaryOwner: true }, ADMIN),
        ).rejects.toThrow(InvalidStateError);

        expect(op.status).toBe('transfer_in_progress');
        expect(operationRepo.save).not.toHaveBeenCalled();
    });

    it('un error transitorio del registrador sube y no confirma nada', async () => {
        const op = anOperation('transfer_in_progress');
        const operationRepo = operationRepoWith(op);

        await expect(
            new ConfirmCustodyUseCase(
                operationRepo,
                listingRepoWith(aWebListing()),
                undefined,
                undefined,
                aRegistrar(async () => {
                    throw new ServiceUnavailableError('Hostinger no responde');
                }),
            ).execute(op.id.toString(), { ...CUSTODIA, isPrimaryOwner: true }, ADMIN),
        ).rejects.toThrow(ServiceUnavailableError);

        expect(operationRepo.save).not.toHaveBeenCalled();
    });

    it('sin registrador se mantiene lo atestiguado por el admin', async () => {
        const op = anOperation('transfer_in_progress');

        await new ConfirmCustodyUseCase(operationRepoWith(op), listingRepoWith(aWebListing()))
            .execute(op.id.toString(), { ...CUSTODIA, isPrimaryOwner: true }, ADMIN);

        expect(op.custodyVerification?.isPrimaryOwner).toBe(true);
    });

    it('un canal de YouTube no consulta al registrador: manda lo atestiguado', async () => {
        const op = anOperation('transfer_in_progress');
        const registrar = aRegistrar(async () => null);

        await new ConfirmCustodyUseCase(
            operationRepoWith(op),
            listingRepoWith(aYouTubeListing()),
            undefined,
            undefined,
            registrar,
        ).execute(op.id.toString(), { ...CUSTODIA, isPrimaryOwner: true }, ADMIN);

        expect(registrar.getPortfolioEntry).not.toHaveBeenCalled();
        expect(op.status).toBe('asset_in_custody');
    });
});

describe('GetOperationDetailsUseCase — pasos de operación sin platformAccess', () => {
    const usuariosVacios: IUserRepository = {
        findById: vi.fn().mockResolvedValue(null),
        findByEmail: vi.fn().mockResolvedValue(null),
        findByRole: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
    };
    const contratos: IContractRepository = {
        findById: vi.fn().mockResolvedValue(null),
        findByOperation: vi.fn().mockResolvedValue([]),
        findByListingAndSigner: vi.fn().mockResolvedValue(null),
        findAllByListing: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
    };

    function viewOf(listing: Listing, op: Operation, custodyRepo: ICustodyAccountRepository) {
        return new GetOperationDetailsUseCase(
            operationRepoWith(op),
            contratos,
            usuariosVacios,
            listingRepoWith(listing),
            custodyRepo,
        ).execute(op.id.toString(), SELLER);
    }

    it('un sitio con la venta firmada recibe los pasos aunque no tenga platformAccess, nombrando la cuenta web activa', async () => {
        const vista = await viewOf(
            aWebListing(),
            anOperation('contract_signed'),
            custodyRepoWith([anAccount(AssetType.WEB, 'custodia-web@traspaso.com')]),
        );

        expect(vista.handoverSteps!.map((p) => p.key)).toEqual(['domain-to-platform', 'hosting', 'code', 'accounts']);
        expect(vista.handoverSteps![0].instruction).toContain('custodia-web@traspaso.com');
    });

    it('un canal de YouTube sin platformAccess sigue sin pasos', async () => {
        const vista = await viewOf(
            aYouTubeListing(),
            anOperation('contract_signed'),
            custodyRepoWith([anAccount(AssetType.YOUTUBE, 'custodia-yt@traspaso.com')]),
        );

        expect(vista.handoverSteps).toEqual([]);
    });
});

describe('GetOperationDetailsUseCase — progreso de los pasos', () => {
    const usuariosVacios: IUserRepository = {
        findById: vi.fn().mockResolvedValue(null),
        findByEmail: vi.fn().mockResolvedValue(null),
        findByRole: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
    };
    const contratos: IContractRepository = {
        findById: vi.fn().mockResolvedValue(null),
        findByOperation: vi.fn().mockResolvedValue([]),
        findByListingAndSigner: vi.fn().mockResolvedValue(null),
        findAllByListing: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
    };
    const DEADLINE = new Date('2026-10-30T09:00:00Z');

    function progressRepoWith(rows: TransferStepProgress[]): ITransferStepProgressRepository {
        return {
            findByScope: vi.fn(async (scope, scopeId) => rows.filter((r) => r.scope === scope && r.scopeId === scopeId)),
            find: vi.fn(),
            findOpen: vi.fn(),
            save: vi.fn(),
        };
    }

    it('trae el estado, el plazo y si fue atestiguado, por paso', async () => {
        const op = anOperation('transfer_in_progress');
        const id = op.id.toString();
        const traslado = TransferStepProgress.start({
            scope: 'operation',
            scopeId: id,
            stepKey: 'domain-to-platform',
            startedAt: new Date('2026-10-20T09:00:00Z'),
            deadlineAt: DEADLINE,
        });
        traslado.markWaiting(new Date('2026-10-20T10:00:00Z'), { awaitingEmailConfirmation: true });
        const hosting = TransferStepProgress.start({ scope: 'operation', scopeId: id, stepKey: 'hosting', startedAt: new Date() });
        hosting.markDone(new Date(), { attestedBy: 'admin-id' });

        const vista = await new GetOperationDetailsUseCase(
            operationRepoWith(op),
            contratos,
            usuariosVacios,
            listingRepoWith(aWebListing()),
            custodyRepoWith([anAccount(AssetType.WEB, 'custodia-web@traspaso.com')]),
            progressRepoWith([traslado, hosting]),
        ).execute(id, SELLER);

        expect(vista.stepProgress).toEqual([
            { stepKey: 'domain-to-platform', status: 'waiting', deadlineAt: DEADLINE, attested: false },
            { stepKey: 'hosting', status: 'done', deadlineAt: undefined, attested: true },
        ]);
    });

    it('sin repositorio de progreso el campo no existe, como hasta ahora', async () => {
        const op = anOperation('transfer_in_progress');

        const vista = await new GetOperationDetailsUseCase(
            operationRepoWith(op),
            contratos,
            usuariosVacios,
            listingRepoWith(aWebListing()),
            custodyRepoWith([]),
        ).execute(op.id.toString(), SELLER);

        expect(vista.stepProgress).toBeUndefined();
    });
});
