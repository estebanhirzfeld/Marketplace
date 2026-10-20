import { describe, it, expect, vi } from 'vitest';
import { AttestTransferStepUseCase } from '../../../src/use-cases/operation/AttestTransferStepUseCase';
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
import { Actor } from '../../../src/ports/Actor';
import { UserRole } from '@marketplace/shared-types';
import {
    ForbiddenError,
    InvalidStateError,
    NotFoundError,
    ValidationError,
} from '../../../src/errors/DomainError';

/*
 * Los pasos declarados de la entrega de un sitio (hosting, código, cuentas) no
 * tienen señal automática: los da por cumplidos un admin, que deja constancia
 * de quién y cuándo.
 */

const NOW = new Date('2026-10-25T12:00:00Z');
const SELLER_ID = new UniqueEntityID();
const ADMIN: Actor = { id: new UniqueEntityID().toString(), role: UserRole.ADMIN };
const SELLER: Actor = { id: SELLER_ID.toString(), role: UserRole.SELLER };

function aWebListing(): Listing {
    return Listing.reconstitute(
        {
            sellerId: SELLER_ID,
            assetStrategy: new WebStrategy({ monthlyRevenueUsd: Money.fromCents(50000, 'USD'), domain: 'ejemplo.com' }),
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
        buyerId: new UniqueEntityID(),
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

function setup(options: { listing?: Listing; state?: 'contract_signed' | 'transfer_in_progress' } = {}) {
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
    const useCase = new AttestTransferStepUseCase(operationRepo, listingRepo, progressRepo, () => NOW);
    const id = operation.id.toString();
    const row = (key: string) => progressRepo.rows.get(`operation:${id}:${key}`);

    return { useCase, id, progressRepo, row };
}

describe('AttestTransferStepUseCase', () => {
    it.each(['hosting', 'code', 'accounts'])('el admin da por cumplido el paso declarado %s', async (key) => {
        const { useCase, id, row } = setup();

        const status = await useCase.execute(id, key, ADMIN, 'Revisé el acceso al panel');

        expect(status).toBe('done');
        expect(row(key)?.status).toBe('done');
        expect(row(key)?.attestedBy).toBe(ADMIN.id);
        expect(row(key)?.startedAt).toEqual(NOW);
        expect(row(key)?.evidence).toEqual({ notes: 'Revisé el acceso al panel' });
    });

    it('sin notas no inventa evidencia', async () => {
        const { useCase, id, row } = setup();

        await useCase.execute(id, 'hosting', ADMIN);

        expect(row('hosting')?.evidence).toEqual({});
    });

    it('atestiguar dos veces no cambia nada: el paso ya quedó cumplido', async () => {
        const { useCase, id, progressRepo, row } = setup();
        await useCase.execute(id, 'code', ADMIN);
        const saves = progressRepo.saves;

        const status = await useCase.execute(id, 'code', { id: 'otro-admin', role: UserRole.ADMIN });

        expect(status).toBe('done');
        expect(progressRepo.saves).toBe(saves);
        expect(row('code')?.attestedBy).toBe(ADMIN.id);
    });

    it('403 si quien atestigua no es admin', async () => {
        const { useCase, id, progressRepo } = setup();

        await expect(useCase.execute(id, 'hosting', SELLER)).rejects.toThrow(ForbiddenError);
        expect(progressRepo.saves).toBe(0);
    });

    it('un paso que se comprueba solo no se atestigua', async () => {
        const { useCase, id, progressRepo } = setup();

        await expect(useCase.execute(id, 'domain-to-platform', ADMIN)).rejects.toThrow(
            'Este paso se comprueba solo: no se puede dar por cumplido a mano.',
        );
        await expect(useCase.execute(id, 'domain-to-buyer', ADMIN)).rejects.toThrow(ValidationError);
        expect(progressRepo.saves).toBe(0);
    });

    it('un paso de la publicación no es de la operación', async () => {
        const { useCase, id } = setup();

        await expect(useCase.execute(id, 'domain-at-hostinger', ADMIN)).rejects.toThrow(ValidationError);
    });

    it('un paso que no existe se rechaza', async () => {
        const { useCase, id } = setup();

        await expect(useCase.execute(id, 'no-existe', ADMIN)).rejects.toThrow('Ese paso no es parte de la entrega de este activo.');
    });

    it('antes de que el vendedor ceda el activo todavía no hay entrega que atestiguar', async () => {
        const { useCase, id, progressRepo } = setup({ state: 'contract_signed' });

        await expect(useCase.execute(id, 'hosting', ADMIN)).rejects.toThrow(InvalidStateError);
        expect(progressRepo.saves).toBe(0);
    });

    it('un canal no tiene esos pasos', async () => {
        const { useCase, id } = setup({ listing: aYouTubeListing() });

        await expect(useCase.execute(id, 'hosting', ADMIN)).rejects.toThrow(ValidationError);
    });

    it('operación inexistente', async () => {
        const { useCase } = setup();

        await expect(useCase.execute('no-existe', 'hosting', ADMIN)).rejects.toThrow(NotFoundError);
    });
});
