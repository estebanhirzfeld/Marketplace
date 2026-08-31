import { describe, it, expect, vi } from 'vitest';
import { GetContractDocumentUseCase } from '../../../src/use-cases/contract/GetContractDocumentUseCase';
import { ContractDataBuilder } from '../../../src/contracts/ContractDataBuilder';
import {
    IContractRepository,
    IListingRepository,
    IOperationRepository,
    IUserRepository,
} from '../../../src/ports/Repositories';
import { Actor } from '../../../src/ports/Actor';
import { Contract } from '../../../src/entities/Contract';
import { Listing } from '../../../src/entities/Listing';
import { Operation } from '../../../src/entities/Operation';
import { User } from '../../../src/entities/User';
import { Email } from '../../../src/value-objects/Email';
import { Money } from '../../../src/value-objects/Money';
import { UniqueEntityID } from '../../../src/value-objects/UniqueEntityID';
import { YouTubeStrategy } from '../../../src/strategies/YouTubeStrategy';
import { ForbiddenError, NotFoundError } from '../../../src/errors/DomainError';
import { UserRole } from '@marketplace/shared-types';

/**
 * El documento se regenera en cada consulta en vez de guardarse, y se compara
 * contra la huella firmada. Esa comparación es lo que le da valor: si algún
 * dato de la operación cambiara después de la firma, se ve.
 */

const BUYER_ID = new UniqueEntityID();
const SELLER_ID = new UniqueEntityID();

function createMockContractRepo(over: Partial<IContractRepository> = {}): IContractRepository {
    return {
        findById: vi.fn().mockResolvedValue(null),
        findByOperation: vi.fn().mockResolvedValue([]),
        findByListingAndSigner: vi.fn().mockResolvedValue(null),
        findAllByListing: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
        ...over,
    };
}

function createMockUserRepo(over: Partial<IUserRepository> = {}): IUserRepository {
    return {
        findById: vi.fn().mockResolvedValue(unUsuario()),
        findByEmail: vi.fn().mockResolvedValue(null),
        findByRole: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
        ...over,
    };
}

function createMockListingRepo(over: Partial<IListingRepository> = {}): IListingRepository {
    return {
        findById: vi.fn().mockResolvedValue(unListing()),
        findPublished: vi.fn().mockResolvedValue([]),
        findBySeller: vi.fn().mockResolvedValue([]),
        findByStatus: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
        ...over,
    };
}

function createMockOperationRepo(over: Partial<IOperationRepository> = {}): IOperationRepository {
    return {
        findById: vi.fn().mockResolvedValue(null),
        findByListing: vi.fn().mockResolvedValue([]),
        findByParty: vi.fn().mockResolvedValue([]),
        findByStatuses: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
        ...over,
    };
}

function unUsuario(): User {
    const u = User.create({
        email: Email.create('parte@example.com'),
        fullName: 'Una Parte',
        dni: '20123456',
        role: UserRole.BUYER,
        passwordHash: 'hash-de-prueba',
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
        }),
        askingPrice: Money.fromCents(1_500_000, 'USD'),
    });
    l.submitForReview();
    l.approve();
    return l;
}

function unaOperacionAceptada(): Operation {
    const op = Operation.create({
        listingId: new UniqueEntityID(),
        buyerId: BUYER_ID,
        sellerId: SELLER_ID,
        offerPrice: Money.fromCents(1_500_000, 'USD'),
    });
    op.acceptCurrentOffer('seller');
    return op;
}

function armar(contract: Contract | null, operation: Operation | null = null) {
    const armador = new ContractDataBuilder(
        createMockUserRepo(),
        createMockListingRepo(),
        createMockOperationRepo({ findById: vi.fn().mockResolvedValue(operation) }),
    );

    return new GetContractDocumentUseCase(
        createMockContractRepo({ findById: vi.fn().mockResolvedValue(contract) }),
        createMockOperationRepo({ findById: vi.fn().mockResolvedValue(operation) }),
        armador,
    );
}

const actorDe = (id: UniqueEntityID | string, role = UserRole.BUYER): Actor => ({
    id: typeof id === 'string' ? id : id.toString(),
    role,
});

// ═════════════════════════════════════════════════════════

describe('GetContractDocumentUseCase — lectura', () => {
    it('devuelve el texto del NDA a su firmante', async () => {
        const nda = Contract.createBuyerNda(new UniqueEntityID(), BUYER_ID);

        const doc = await armar(nda).execute(nda.id.toString(), actorDe(BUYER_ID));

        expect(doc.text).toContain('ACUERDO DE CONFIDENCIALIDAD');
        expect(doc.hash).toMatch(/^[0-9a-f]{64}$/);
        expect(doc.signed).toBe(false);
    });

    it('devuelve el tripartito a una parte de la operación', async () => {
        const operation = unaOperacionAceptada();
        const contrato = Contract.createTripartite(new UniqueEntityID(), operation.id);

        const doc = await armar(contrato, operation).execute(
            contrato.id.toString(),
            actorDe(SELLER_ID, UserRole.SELLER),
        );

        expect(doc.text).toContain('CONTRATO DE COMPRAVENTA');
        expect(doc.type).toBe('tripartite');
    });

    it('falla si el contrato no existe', async () => {
        await expect(armar(null).execute('no-existe', actorDe(BUYER_ID)))
            .rejects.toThrow(NotFoundError);
    });
});

describe('GetContractDocumentUseCase — quién puede leerlo', () => {
    it('rechaza a quien no firmó el NDA', async () => {
        const nda = Contract.createBuyerNda(new UniqueEntityID(), BUYER_ID);

        await expect(armar(nda).execute(nda.id.toString(), actorDe(new UniqueEntityID())))
            .rejects.toThrow(ForbiddenError);
    });

    it('rechaza a un tercero ajeno al tripartito', async () => {
        const operation = unaOperacionAceptada();
        const contrato = Contract.createTripartite(new UniqueEntityID(), operation.id);

        await expect(
            armar(contrato, operation).execute(contrato.id.toString(), actorDe(new UniqueEntityID())),
        ).rejects.toThrow(ForbiddenError);
    });

    /** La plataforma es parte de los tres tipos de contrato. */
    it('deja leer a un admin aunque no sea firmante', async () => {
        const nda = Contract.createBuyerNda(new UniqueEntityID(), BUYER_ID);

        const doc = await armar(nda).execute(nda.id.toString(), actorDe('admin', UserRole.ADMIN));

        expect(doc.text.length).toBeGreaterThan(0);
    });
});

describe('GetContractDocumentUseCase — verificación de la huella', () => {
    it('un contrato sin firmar todavía no tiene nada que comparar', async () => {
        const nda = Contract.createBuyerNda(new UniqueEntityID(), BUYER_ID);

        const doc = await armar(nda).execute(nda.id.toString(), actorDe(BUYER_ID));

        expect(doc.signedHash).toBeUndefined();
        expect(doc.matches).toBe(true);
    });

    it('coincide cuando el documento adjunto es el que se regenera', async () => {
        const nda = Contract.createBuyerNda(new UniqueEntityID(), BUYER_ID);
        const uso = armar(nda);

        // Se adjunta exactamente lo que el armador produce.
        const previo = await uso.execute(nda.id.toString(), actorDe(BUYER_ID));
        nda.attachDocument(previo.hash);
        nda.sign('buyer', '1.1.1.1');

        const doc = await uso.execute(nda.id.toString(), actorDe(BUYER_ID));

        expect(doc.matches).toBe(true);
        expect(doc.signedHash).toBe(doc.hash);
        expect(doc.signed).toBe(true);
    });

    /**
     * El caso que justifica todo el mecanismo: si el documento adjunto no es
     * el que se regenera, algo cambió después de firmarse. Se informa en vez
     * de ocultarse.
     */
    it('avisa cuando el documento firmado no es el vigente', async () => {
        const nda = Contract.createBuyerNda(new UniqueEntityID(), BUYER_ID);
        nda.attachDocument('f'.repeat(64));
        nda.sign('buyer', '1.1.1.1');

        const doc = await armar(nda).execute(nda.id.toString(), actorDe(BUYER_ID));

        expect(doc.matches).toBe(false);
        expect(doc.signedHash).toBe('f'.repeat(64));
        expect(doc.signedHash).not.toBe(doc.hash);
    });
});
