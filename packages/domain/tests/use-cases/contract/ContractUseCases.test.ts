import { describe, it, expect, vi } from 'vitest';
import { SignNdaUseCase } from '../../../src/use-cases/contract/SignNdaUseCase';
import { SignContractUseCase } from '../../../src/use-cases/contract/SignContractUseCase';
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
import { WebStrategy } from '../../../src/strategies/WebStrategy';
import { DomainRegistryRecord, IDomainRegistryLookup } from '../../../src/ports/IDomainRegistryLookup';
import { ForbiddenError, InvalidStateError, ServiceUnavailableError } from '../../../src/errors/DomainError';
import { ContractDataBuilder } from '../../../src/contracts/ContractDataBuilder';
import { UserRole } from '@marketplace/shared-types';

// Un contrato sin documento no se puede firmar; en estos tests alcanza
// una huella cualquiera con forma válida.
const HASH = 'a'.repeat(64);

// ── Mock Factories ───────────────────────────────────────

function createMockContractRepo(overrides: Partial<IContractRepository> = {}): IContractRepository {
    return {
        findById: vi.fn().mockResolvedValue(null),
        findByOperation: vi.fn().mockResolvedValue([]),
        findByListingAndSigner: vi.fn().mockResolvedValue(null),
        findAllByListing: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    };
}

function createMockListingRepo(overrides: Partial<IListingRepository> = {}): IListingRepository {
    return {
        findById: vi.fn().mockResolvedValue(null),
        findPublished: vi.fn().mockResolvedValue([]),
        findBySeller: vi.fn().mockResolvedValue([]),
        findByStatus: vi.fn().mockResolvedValue([]),
        findHeldBy: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    };
}

function createMockOperationRepo(overrides: Partial<IOperationRepository> = {}): IOperationRepository {
    return {
        findById: vi.fn().mockResolvedValue(null),
        findByListing: vi.fn().mockResolvedValue([]),
        findByParty: vi.fn().mockResolvedValue([]),
        findByStatuses: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    };
}

function createMockUserRepo(overrides: Partial<IUserRepository> = {}): IUserRepository {
    return {
        findById: vi.fn().mockResolvedValue(null),
        findByEmail: vi.fn().mockResolvedValue(null),
        findByRole: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    };
}

/**
 * El armador necesita los tres repositorios. Se construye con los mismos
 * mocks que el use case, así el documento se genera con los mismos datos.
 */
function unArmador(over: {
    user?: User;
    listing?: Listing;
    operation?: Operation;
} = {}): ContractDataBuilder {
    return new ContractDataBuilder(
        createMockUserRepo({ findById: vi.fn().mockResolvedValue(over.user ?? unUsuario(true)) }),
        createMockListingRepo({
            findById: vi.fn().mockResolvedValue(over.listing ?? createPublishedListing()),
        }),
        createMockOperationRepo({ findById: vi.fn().mockResolvedValue(over.operation ?? null) }),
    );
}

function unUsuario(kycVerificado: boolean): User {
    const user = User.create({
        email: Email.create('firmante@example.com'),
        fullName: 'Firmante Verificado',
        dni: '20123456789',
        role: UserRole.BUYER,
        passwordHash: 'hash-de-prueba',
    });
    if (kycVerificado) user.verifyKyc();
    return user;
}

function actorDe(id: UniqueEntityID): Actor {
    return { id: id.toString(), role: UserRole.BUYER };
}

function createPublishedListing(sellerId = new UniqueEntityID()) {
    const listing = Listing.create({
        sellerId,
        assetStrategy: new YouTubeStrategy({
            monthlyRevenueUsd: Money.fromCents(50000, 'USD'),
            subscribers: 10000,
            growthFactor: 1.2,
            isMonetized: true,
        }),
        askingPrice: Money.fromCents(1000000, 'USD'),
    });
    listing.submitForReview();
    listing.approve();
    return listing;
}

/**
 * Un listing cuyo acceso la plataforma tiene hace más de la ventana de espera
 * de YouTube. Es la precondición del tripartito, así que los tests que no
 * prueban el candado arrancan de acá.
 */
function unListingTransferible(sellerId = new UniqueEntityID()): Listing {
    const listing = createPublishedListing(sellerId);
    listing.registerPlatformAccess({
        verifiedBy: new UniqueEntityID(),
        heldRole: 'manager',
            custodyAccountId: new UniqueEntityID(),
        accessSince: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    });
    return listing;
}

// ═════════════════════════════════════════════════════════
// SignNdaUseCase
// ═════════════════════════════════════════════════════════

describe('SignNdaUseCase', () => {
    it('crea un buyer_nda y lo deja completamente firmado', async () => {
        const listing = createPublishedListing();
        const buyerId = new UniqueEntityID();

        const contractRepo = createMockContractRepo();
        const useCase = new SignNdaUseCase(
            contractRepo,
            createMockListingRepo({ findById: vi.fn().mockResolvedValue(listing) }),
            createMockUserRepo({ findById: vi.fn().mockResolvedValue(unUsuario(true)) }),
            unArmador(),
        );

        const nda = await useCase.execute(listing.id.toString(), '192.168.1.1', actorDe(buyerId));

        expect(nda.type).toBe('buyer_nda');
        expect(nda.hasSignedBy('buyer')).toBe(true);
        // La plataforma firma automáticamente. Sin esto el NDA nunca se
        // completaba y el listing blind no se desbloqueaba jamás.
        expect(nda.hasSignedBy('platform')).toBe(true);
        expect(nda.isFullySigned()).toBe(true);
        expect(contractRepo.save).toHaveBeenCalledOnce();
    });

    it('crea un seller_nda cuando quien firma es el dueño del listing', async () => {
        const sellerId = new UniqueEntityID();
        const listing = createPublishedListing(sellerId);

        const useCase = new SignNdaUseCase(
            createMockContractRepo(),
            createMockListingRepo({ findById: vi.fn().mockResolvedValue(listing) }),
            createMockUserRepo({ findById: vi.fn().mockResolvedValue(unUsuario(true)) }),
            unArmador(),
        );

        const nda = await useCase.execute(listing.id.toString(), '192.168.1.1', actorDe(sellerId));

        expect(nda.type).toBe('seller_nda');
        expect(nda.hasSignedBy('seller')).toBe(true);
        expect(nda.isFullySigned()).toBe(true);
    });

    it('reutiliza el NDA existente en vez de crear uno nuevo', async () => {
        const listing = createPublishedListing();
        const buyerId = new UniqueEntityID();
        const existingNda = Contract.createBuyerNda(listing.id, buyerId);
        existingNda.attachDocument(HASH);

        const useCase = new SignNdaUseCase(
            createMockContractRepo({
                findByListingAndSigner: vi.fn().mockResolvedValue(existingNda),
            }),
            createMockListingRepo({ findById: vi.fn().mockResolvedValue(listing) }),
            createMockUserRepo({ findById: vi.fn().mockResolvedValue(unUsuario(true)) }),
            unArmador(),
        );

        const nda = await useCase.execute(listing.id.toString(), '192.168.1.1', actorDe(buyerId));

        expect(nda.id.toString()).toBe(existingNda.id.toString());
        expect(nda.hasSignedBy('buyer')).toBe(true);
    });

    it('rechaza a un usuario sin KYC verificado', async () => {
        const listing = createPublishedListing();

        const useCase = new SignNdaUseCase(
            createMockContractRepo(),
            createMockListingRepo({ findById: vi.fn().mockResolvedValue(listing) }),
            createMockUserRepo({ findById: vi.fn().mockResolvedValue(unUsuario(false)) }),
            unArmador(),
        );

        await expect(
            useCase.execute(listing.id.toString(), '1.1.1.1', actorDe(new UniqueEntityID())),
        ).rejects.toThrow(ForbiddenError);
    });

    it('falla si el listing no existe', async () => {
        const useCase = new SignNdaUseCase(
            createMockContractRepo(),
            createMockListingRepo(),
            createMockUserRepo(),
            unArmador(),
        );

        await expect(
            useCase.execute('nonexistent', '127.0.0.1', actorDe(new UniqueEntityID())),
        ).rejects.toThrow('Activo no encontrado');
    });
});

// ═════════════════════════════════════════════════════════
// SignContractUseCase
// ═════════════════════════════════════════════════════════

function unaOperacionEnContractPending(buyerId: UniqueEntityID, sellerId: UniqueEntityID): Operation {
    const operation = Operation.create({
        listingId: new UniqueEntityID(),
        buyerId,
        sellerId,
        offerPrice: Money.fromCents(200000, 'USD'),
    });
    operation.acceptCurrentOffer('seller');
    return operation;
}

describe('SignContractUseCase', () => {
    it('deriva el rol de firma de la posición del actor en la operación', async () => {
        const buyerId = new UniqueEntityID();
        const sellerId = new UniqueEntityID();
        const operation = unaOperacionEnContractPending(buyerId, sellerId);
        const contract = Contract.createTripartite(new UniqueEntityID(), operation.id);

        const contractRepo = createMockContractRepo({
            findById: vi.fn().mockResolvedValue(contract),
        });
        const useCase = new SignContractUseCase(
            contractRepo,
            createMockOperationRepo({ findById: vi.fn().mockResolvedValue(operation) }),
            createMockUserRepo({ findById: vi.fn().mockResolvedValue(unUsuario(true)) }),
            createMockListingRepo({ findById: vi.fn().mockResolvedValue(unListingTransferible()) }),
            unArmador({ operation }),
        );

        await useCase.execute(contract.id.toString(), '10.0.0.1', actorDe(buyerId));

        // Nadie declaró "buyer": se dedujo de que el actor es el buyer de esa operación.
        expect(contract.hasSignedBy('buyer')).toBe(true);
        expect(contract.hasSignedBy('seller')).toBe(false);
        expect(contract.hasSignedBy('platform')).toBe(true);
        expect(contractRepo.save).toHaveBeenCalledOnce();
    });

    it('transiciona la operación cuando se completan las tres firmas', async () => {
        const buyerId = new UniqueEntityID();
        const sellerId = new UniqueEntityID();
        const operation = unaOperacionEnContractPending(buyerId, sellerId);
        const contract = Contract.createTripartite(new UniqueEntityID(), operation.id);

        const operationRepo = createMockOperationRepo({
            findById: vi.fn().mockResolvedValue(operation),
        });
        const useCase = new SignContractUseCase(
            createMockContractRepo({ findById: vi.fn().mockResolvedValue(contract) }),
            operationRepo,
            createMockUserRepo({ findById: vi.fn().mockResolvedValue(unUsuario(true)) }),
            createMockListingRepo({ findById: vi.fn().mockResolvedValue(unListingTransferible()) }),
            unArmador({ operation }),
        );

        // El buyer firma primero: se suma también la plataforma.
        await useCase.execute(contract.id.toString(), '10.0.0.1', actorDe(buyerId));
        expect(contract.isFullySigned()).toBe(false);
        expect(operation.status).toBe('contract_pending');

        // El seller cierra el contrato.
        await useCase.execute(contract.id.toString(), '10.0.0.2', actorDe(sellerId));

        expect(contract.isFullySigned()).toBe(true);
        expect(operation.status).toBe('contract_signed');
    });

    it('rechaza a quien no es parte de la operación', async () => {
        const operation = unaOperacionEnContractPending(new UniqueEntityID(), new UniqueEntityID());
        const contract = Contract.createTripartite(new UniqueEntityID(), operation.id);

        const useCase = new SignContractUseCase(
            createMockContractRepo({ findById: vi.fn().mockResolvedValue(contract) }),
            createMockOperationRepo({ findById: vi.fn().mockResolvedValue(operation) }),
            createMockUserRepo({ findById: vi.fn().mockResolvedValue(unUsuario(true)) }),
            createMockListingRepo({ findById: vi.fn().mockResolvedValue(unListingTransferible()) }),
            unArmador({ operation }),
        );

        await expect(
            useCase.execute(contract.id.toString(), '10.0.0.9', actorDe(new UniqueEntityID())),
        ).rejects.toThrow(ForbiddenError);
    });

    it('falla si el contrato no existe', async () => {
        const useCase = new SignContractUseCase(
            createMockContractRepo(),
            createMockOperationRepo(),
            createMockUserRepo(),
            createMockListingRepo({ findById: vi.fn().mockResolvedValue(unListingTransferible()) }),
            unArmador(),
        );

        await expect(
            useCase.execute('nonexistent', '127.0.0.1', actorDe(new UniqueEntityID())),
        ).rejects.toThrow('Contrato no encontrado');
    });

    it('falla si el mismo actor intenta firmar dos veces', async () => {
        const buyerId = new UniqueEntityID();
        const operation = unaOperacionEnContractPending(buyerId, new UniqueEntityID());
        const contract = Contract.createTripartite(new UniqueEntityID(), operation.id);

        const useCase = new SignContractUseCase(
            createMockContractRepo({ findById: vi.fn().mockResolvedValue(contract) }),
            createMockOperationRepo({ findById: vi.fn().mockResolvedValue(operation) }),
            createMockUserRepo({ findById: vi.fn().mockResolvedValue(unUsuario(true)) }),
            createMockListingRepo({ findById: vi.fn().mockResolvedValue(unListingTransferible()) }),
            unArmador({ operation }),
        );

        await useCase.execute(contract.id.toString(), '10.0.0.1', actorDe(buyerId));

        await expect(
            useCase.execute(contract.id.toString(), '10.0.0.1', actorDe(buyerId)),
        ).rejects.toThrow('Ya firmaste');
    });
});

// ═════════════════════════════════════════════════════════
// El candado de transferibilidad sobre el tripartito
// ═════════════════════════════════════════════════════════

/**
 * Firmar el tripartito es el punto de no retorno: después de eso la
 * cancelación deja de ser legal. Como el traspaso de un canal no se puede
 * automatizar y YouTube impone 7 días de espera antes de permitir el cambio de
 * propietario principal, comprometer a las partes antes de que la plataforma
 * pueda tomar la custodia las ata a una operación que no se puede cerrar.
 */
describe('SignContractUseCase — el tripartito exige un activo transferible', () => {
    function armarFirma(listing: Listing) {
        const buyerId = new UniqueEntityID();
        const operation = unaOperacionEnContractPending(buyerId, new UniqueEntityID());
        const contract = Contract.createTripartite(listing.id, operation.id);

        const useCase = new SignContractUseCase(
            createMockContractRepo({ findById: vi.fn().mockResolvedValue(contract) }),
            createMockOperationRepo({ findById: vi.fn().mockResolvedValue(operation) }),
            createMockUserRepo({ findById: vi.fn().mockResolvedValue(unUsuario(true)) }),
            createMockListingRepo({ findById: vi.fn().mockResolvedValue(listing) }),
            unArmador({ listing, operation }),
        );

        return { useCase, contract, buyerId };
    }

    it('frena la firma si la plataforma no tiene acceso al activo', async () => {
        const { useCase, contract, buyerId } = armarFirma(createPublishedListing());

        await expect(
            useCase.execute(contract.id.toString(), '10.0.0.1', actorDe(buyerId)),
        ).rejects.toThrow(InvalidStateError);

        expect(contract.isFullySigned()).toBe(false);
    });

    it('frena la firma dentro de la ventana de espera de la plataforma del activo', async () => {
        const listing = createPublishedListing();
        listing.registerPlatformAccess({
            verifiedBy: new UniqueEntityID(),
            heldRole: 'manager',
            custodyAccountId: new UniqueEntityID(),
            accessSince: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        });

        const { useCase, contract, buyerId } = armarFirma(listing);

        await expect(
            useCase.execute(contract.id.toString(), '10.0.0.1', actorDe(buyerId)),
        ).rejects.toThrow(InvalidStateError);
    });

    it('deja firmar cuando el plazo ya se cumplió', async () => {
        const { useCase, contract, buyerId } = armarFirma(unListingTransferible());

        await useCase.execute(contract.id.toString(), '10.0.0.1', actorDe(buyerId));

        expect(contract.hasSignedBy('buyer')).toBe(true);
    });

    /**
     * El NDA del comprador obliga a callar, no a comprar. Bloquearlo no
     * compraría seguridad y le impediría a un interesado evaluar el activo,
     * que es justo lo que necesita antes de ofertar.
     */
    it('no bloquea el NDA del comprador sobre un listing sin acceso registrado', async () => {
        const listing = createPublishedListing();
        const buyerId = new UniqueEntityID();

        const useCase = new SignNdaUseCase(
            createMockContractRepo(),
            createMockListingRepo({ findById: vi.fn().mockResolvedValue(listing) }),
            createMockUserRepo({ findById: vi.fn().mockResolvedValue(unUsuario(true)) }),
            unArmador({ listing }),
        );

        const nda = await useCase.execute(listing.id.toString(), '1.1.1.1', actorDe(buyerId));

        expect(nda.isFullySigned()).toBe(true);
    });
});

/**
 * Un sitio entra en custodia durante la operación, por un traslado entre
 * cuentas de Hostinger: no necesita acceso de la plataforma. Lo que sí tiene
 * que estar antes de firmar es el dominio en Hostinger, activo y lejos de
 * vencer, y eso lo dice el registro público.
 */
describe('SignContractUseCase — el tripartito de un sitio consulta el registro del dominio', () => {
    function unSitioPublicado(): Listing {
        const listing = Listing.create({
            sellerId: new UniqueEntityID(),
            assetStrategy: new WebStrategy({
                monthlyRevenueUsd: Money.fromCents(120000, 'USD'),
                domain: 'deliaorrego.online',
            }),
            askingPrice: Money.fromCents(3600000, 'USD'),
        });
        listing.submitForReview();
        listing.approve();
        return listing;
    }

    function armarFirma(listing: Listing, registryLookup?: IDomainRegistryLookup) {
        const buyerId = new UniqueEntityID();
        const operation = unaOperacionEnContractPending(buyerId, new UniqueEntityID());
        const contract = Contract.createTripartite(listing.id, operation.id);

        const useCase = new SignContractUseCase(
            createMockContractRepo({ findById: vi.fn().mockResolvedValue(contract) }),
            createMockOperationRepo({ findById: vi.fn().mockResolvedValue(operation) }),
            createMockUserRepo({ findById: vi.fn().mockResolvedValue(unUsuario(true)) }),
            createMockListingRepo({ findById: vi.fn().mockResolvedValue(listing) }),
            unArmador({ listing, operation }),
            undefined,
            registryLookup,
        );

        return { useCase, contract, buyerId };
    }

    function registroCon(record: DomainRegistryRecord | null): IDomainRegistryLookup {
        return { lookup: vi.fn().mockResolvedValue(record) };
    }

    const enHostinger: DomainRegistryRecord = {
        registrarIanaId: '1636',
        registrarName: 'HOSTINGER operations, UAB',
        statuses: ['client transfer prohibited'],
        expiresAt: new Date(Date.now() + 200 * 24 * 60 * 60 * 1000),
    };

    it('firma sin acceso de la plataforma cuando el dominio está listo', async () => {
        const lookup = registroCon(enHostinger);
        const { useCase, contract, buyerId } = armarFirma(unSitioPublicado(), lookup);

        await useCase.execute(contract.id.toString(), '10.0.0.1', actorDe(buyerId));

        expect(contract.hasSignedBy('buyer')).toBe(true);
        expect(lookup.lookup).toHaveBeenCalledWith(expect.objectContaining({ value: 'deliaorrego.online' }));
    });

    it('frena la firma con la instrucción si el dominio está en otro registrador', async () => {
        const lookup = registroCon({ ...enHostinger, registrarIanaId: '146', registrarName: 'GoDaddy.com, LLC' });
        const { useCase, contract, buyerId } = armarFirma(unSitioPublicado(), lookup);

        await expect(useCase.execute(contract.id.toString(), '10.0.0.1', actorDe(buyerId))).rejects.toThrow(
            /EPP/,
        );
        expect(contract.hasSignedBy('buyer')).toBe(false);
    });

    it('si el registro no responde, no firma y pide volver a intentar', async () => {
        const lookup: IDomainRegistryLookup = {
            lookup: vi.fn().mockRejectedValue(new ServiceUnavailableError('El registro no respondió.')),
        };
        const { useCase, contract, buyerId } = armarFirma(unSitioPublicado(), lookup);

        await expect(useCase.execute(contract.id.toString(), '10.0.0.1', actorDe(buyerId))).rejects.toThrow(
            ServiceUnavailableError,
        );
        expect(contract.hasSignedBy('buyer')).toBe(false);
    });

    it('sin consulta de registro configurada, no da el sitio por listo', async () => {
        const { useCase, contract, buyerId } = armarFirma(unSitioPublicado());

        await expect(useCase.execute(contract.id.toString(), '10.0.0.1', actorDe(buyerId))).rejects.toThrow(
            ServiceUnavailableError,
        );
    });

    it('un canal no consulta el registro de dominios', async () => {
        const lookup = registroCon(null);
        const { useCase, contract, buyerId } = armarFirma(unListingTransferible(), lookup);

        await useCase.execute(contract.id.toString(), '10.0.0.1', actorDe(buyerId));

        expect(lookup.lookup).not.toHaveBeenCalled();
        expect(contract.hasSignedBy('buyer')).toBe(true);
    });
});
