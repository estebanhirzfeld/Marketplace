import { describe, it, expect, vi } from 'vitest';
import {
    CloseReportUseCase,
    FileReportUseCase,
    GetEvidenceDossierUseCase,
} from '../../../src/use-cases/report/ReportUseCases';
import {
    IContractRepository,
    IListingRepository,
    IOperationRepository,
    IReportRepository,
    IUserRepository,
} from '../../../src/ports/Repositories';
import { INotifier } from '../../../src/ports/INotifier';
import { Actor } from '../../../src/ports/Actor';
import { Report } from '../../../src/entities/Report';
import { Operation } from '../../../src/entities/Operation';
import { Listing } from '../../../src/entities/Listing';
import { Contract } from '../../../src/entities/Contract';
import { User } from '../../../src/entities/User';
import { Email } from '../../../src/value-objects/Email';
import { Money } from '../../../src/value-objects/Money';
import { UniqueEntityID } from '../../../src/value-objects/UniqueEntityID';
import { YouTubeStrategy } from '../../../src/strategies/YouTubeStrategy';
import { ForbiddenError, InvalidStateError, NotFoundError } from '../../../src/errors/DomainError';
import { UserRole } from '@marketplace/shared-types';

const BUYER_ID = new UniqueEntityID();
const SELLER_ID = new UniqueEntityID();

const BUYER: Actor = { id: BUYER_ID.toString(), role: UserRole.BUYER };
const SELLER: Actor = { id: SELLER_ID.toString(), role: UserRole.SELLER };
const AJENO: Actor = { id: new UniqueEntityID().toString(), role: UserRole.BUYER };
const ADMIN: Actor = { id: 'admin-1', role: UserRole.ADMIN };

const DETALLE = 'El canal factura mucho menos de lo que decía la publicación.';

function createMockReportRepo(report: Report | null = null): IReportRepository {
    return {
        findById: vi.fn().mockResolvedValue(report),
        findByUser: vi.fn().mockResolvedValue([]),
        findByOperation: vi.fn().mockResolvedValue([]),
        findOpen: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
    };
}

function createMockOperationRepo(operation: Operation | null): IOperationRepository {
    return {
        findById: vi.fn().mockResolvedValue(operation),
        findByListing: vi.fn().mockResolvedValue([]),
        findByParty: vi.fn().mockResolvedValue([]),
        findByStatuses: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
    };
}

function createMockListingRepo(listing: Listing | null): IListingRepository {
    return {
        findById: vi.fn().mockResolvedValue(listing),
        findPublished: vi.fn().mockResolvedValue([]),
        findBySeller: vi.fn().mockResolvedValue([]),
        findByStatus: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
    };
}

function createMockContractRepo(contracts: Contract[]): IContractRepository {
    return {
        findById: vi.fn().mockResolvedValue(null),
        findByOperation: vi.fn().mockResolvedValue(contracts),
        findByListingAndSigner: vi.fn().mockResolvedValue(null),
        findAllByListing: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
    };
}

function createMockUserRepo(): IUserRepository {
    return {
        findById: vi.fn().mockImplementation(async (id: string) => unUsuario(id)),
        findByEmail: vi.fn().mockResolvedValue(null),
        findByRole: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
    };
}

function unUsuario(id: string): User {
    const u = User.create({
        email: Email.create(`${id.slice(0, 8)}@example.com`),
        fullName: 'Una Parte',
        dni: '20123456789',
        role: UserRole.BUYER,
        country: 'AR',
        passwordHash: 'hash',
    });
    u.verifyKyc();
    return u;
}

function unListing(): Listing {
    const l = Listing.create({
        sellerId: SELLER_ID,
        assetStrategy: new YouTubeStrategy({
            monthlyRevenueUsd: Money.fromCents(120000, 'USD'),
            subscribers: 55000,
            isMonetized: true,
            channelUrl: 'https://youtube.com/@canaldeprueba',
        }),
        askingPrice: Money.fromCents(1_500_000, 'USD'),
    });
    l.submitForReview();
    l.approve();
    return l;
}

/** Una operación con el contrato firmado: recién ahí se puede denunciar. */
function unaOperacionFirmada(): Operation {
    const op = Operation.create({
        listingId: new UniqueEntityID(),
        buyerId: BUYER_ID,
        sellerId: SELLER_ID,
        offerPrice: Money.fromCents(1_500_000, 'USD'),
    });
    op.acceptCurrentOffer('seller');
    op.signContract();
    return op;
}

function unaOperacionEnNegociacion(): Operation {
    return Operation.create({
        listingId: new UniqueEntityID(),
        buyerId: BUYER_ID,
        sellerId: SELLER_ID,
        offerPrice: Money.fromCents(1_500_000, 'USD'),
    });
}

// ═════════════════════════════════════════════════════════

describe('FileReportUseCase', () => {
    function armar(operation: Operation | null, notifier?: INotifier) {
        const repo = createMockReportRepo();
        return {
            uso: new FileReportUseCase(repo, createMockOperationRepo(operation), notifier),
            repo,
        };
    }

    it('abre la denuncia contra la contraparte, no contra quien denuncia', async () => {
        const { uso, repo } = armar(unaOperacionFirmada());

        const report = await uso.execute(
            { operationId: 'op-1', reason: 'ingreso_falso', detail: DETALLE },
            BUYER,
        );

        expect(report.reportedBy.toString()).toBe(BUYER_ID.toString());
        expect(report.reportedUserId.toString()).toBe(SELLER_ID.toString());
        expect(report.reporterRole).toBe('buyer');
        expect(repo.save).toHaveBeenCalledOnce();
    });

    it('el vendedor denuncia al comprador', async () => {
        const { uso } = armar(unaOperacionFirmada());

        const report = await uso.execute(
            { operationId: 'op-1', reason: 'pago_no_recibido', detail: DETALLE },
            SELLER,
        );

        expect(report.reportedUserId.toString()).toBe(BUYER_ID.toString());
        expect(report.reporterRole).toBe('seller');
    });

    /**
     * Mientras cancelar sigue siendo legal, retirarse es el remedio. La
     * denuncia existe para cuando esa salida ya no está.
     */
    it('rechaza denunciar antes de firmar el contrato', async () => {
        const { uso } = armar(unaOperacionEnNegociacion());

        await expect(
            uso.execute({ operationId: 'op-1', reason: 'otro', detail: DETALLE }, BUYER),
        ).rejects.toThrow(InvalidStateError);
    });

    it('rechaza a quien no es parte de la operación', async () => {
        const { uso } = armar(unaOperacionFirmada());

        await expect(
            uso.execute({ operationId: 'op-1', reason: 'otro', detail: DETALLE }, AJENO),
        ).rejects.toThrow(ForbiddenError);
    });

    it('avisa a la contraparte', async () => {
        const notifier: INotifier = { notify: vi.fn().mockResolvedValue(undefined) };
        const { uso } = armar(unaOperacionFirmada(), notifier);

        await uso.execute({ operationId: 'op-1', reason: 'otro', detail: DETALLE }, BUYER);

        expect(notifier.notify).toHaveBeenCalledOnce();
    });

    /** La constancia importa más que el aviso: un aviso caído no la borra. */
    it('deja la denuncia asentada aunque el aviso falle', async () => {
        const notifier: INotifier = { notify: vi.fn().mockRejectedValue(new Error('sin correo')) };
        const { uso, repo } = armar(unaOperacionFirmada(), notifier);

        await expect(
            uso.execute({ operationId: 'op-1', reason: 'otro', detail: DETALLE }, BUYER),
        ).resolves.toBeDefined();
        expect(repo.save).toHaveBeenCalledOnce();
    });

    it('falla si la operación no existe', async () => {
        const { uso } = armar(null);

        await expect(
            uso.execute({ operationId: 'op-1', reason: 'otro', detail: DETALLE }, BUYER),
        ).rejects.toThrow(NotFoundError);
    });
});

describe('CloseReportUseCase', () => {
    function unaDenuncia(): Report {
        return Report.create({
            operationId: new UniqueEntityID(),
            reportedBy: BUYER_ID,
            reporterRole: 'buyer',
            reportedUserId: SELLER_ID,
            reason: 'ingreso_falso',
            detail: DETALLE,
        });
    }

    it('la cierra quien la abrió', async () => {
        const report = unaDenuncia();
        const repo = createMockReportRepo(report);

        await new CloseReportUseCase(repo).execute('r1', 'Nos arreglamos.', BUYER);

        expect(report.status).toBe('closed');
        expect(repo.save).toHaveBeenCalledOnce();
    });

    it('el denunciado no puede cerrarla', async () => {
        const repo = createMockReportRepo(unaDenuncia());

        await expect(
            new CloseReportUseCase(repo).execute('r1', 'Cerrala.', SELLER),
        ).rejects.toThrow(ForbiddenError);
    });
});

// ═════════════════════════════════════════════════════════

describe('GetEvidenceDossierUseCase', () => {
    function armar(report: Report | null) {
        const operation = unaOperacionFirmada();
        const listing = unListing();
        const contrato = Contract.createTripartite(listing.id, operation.id);
        contrato.attachDocument('a'.repeat(64));
        contrato.sign('buyer', '10.0.0.1');

        return new GetEvidenceDossierUseCase(
            createMockReportRepo(report),
            createMockOperationRepo(operation),
            createMockListingRepo(listing),
            createMockContractRepo([contrato]),
            createMockUserRepo(),
        );
    }

    function unaDenuncia(): Report {
        return Report.create({
            operationId: new UniqueEntityID(),
            reportedBy: BUYER_ID,
            reporterRole: 'buyer',
            reportedUserId: SELLER_ID,
            reason: 'ingreso_falso',
            detail: DETALLE,
        });
    }

    it('reúne la identidad de las dos partes', async () => {
        const legajo = await armar(unaDenuncia()).execute('r1', BUYER);

        expect(legajo.reporter.id).toBe(BUYER_ID.toString());
        expect(legajo.reported.id).toBe(SELLER_ID.toString());
        expect(legajo.reporter.fullName).toBe('Una Parte');
    });

    /**
     * La huella y la IP de cada firma son lo que le da valor probatorio al
     * legajo: sin eso es una captura de pantalla con más pasos.
     */
    it('incluye los contratos con su huella y la IP de cada firma', async () => {
        const legajo = await armar(unaDenuncia()).execute('r1', BUYER);

        const tripartito = legajo.contracts.find((c) => c.type === 'tripartite');
        expect(tripartito?.documentHash).toBe('a'.repeat(64));

        const firmaDelComprador = tripartito?.signatures.find((s) => s.role === 'buyer');
        expect(firmaDelComprador?.ipAddress).toBe('10.0.0.1');
        expect(firmaDelComprador?.signedAt).toBeInstanceOf(Date);
    });

    it('incluye el historial completo de la negociación', async () => {
        const legajo = await armar(unaDenuncia()).execute('r1', BUYER);

        expect(legajo.negotiations.length).toBeGreaterThan(0);
        expect(legajo.negotiations[0].proposedAt).toBeInstanceOf(Date);
    });

    /**
     * Sin filtrar por NDA: ante un reclamo lo que importa es qué declaró el
     * vendedor, no qué alcanzaba a ver un comprador que no había firmado.
     */
    it('incluye lo declarado del activo sin el filtro del listing blind', async () => {
        const legajo = await armar(unaDenuncia()).execute('r1', BUYER);

        expect(legajo.declaredAsset.assetData).toHaveProperty('channelUrl');
        expect(legajo.declaredAsset.assetData).toHaveProperty('monthlyRevenueUsdCents');
    });

    it('lo ve el denunciado, no solo quien denuncia', async () => {
        await expect(armar(unaDenuncia()).execute('r1', SELLER)).resolves.toBeDefined();
    });

    it('lo ve un admin', async () => {
        await expect(armar(unaDenuncia()).execute('r1', ADMIN)).resolves.toBeDefined();
    });

    it('no lo ve un tercero', async () => {
        await expect(armar(unaDenuncia()).execute('r1', AJENO)).rejects.toThrow(ForbiddenError);
    });

    it('falla si la denuncia no existe', async () => {
        await expect(armar(null).execute('r1', BUYER)).rejects.toThrow(NotFoundError);
    });
});
