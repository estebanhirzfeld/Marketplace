import { describe, it, expect, vi } from 'vitest';
import { GetPlatformDashboardUseCase } from '../../../src/use-cases/admin/GetPlatformDashboardUseCase';
import {
    IListingRepository,
    IOperationRepository,
    IReportRepository,
    IUserRepository,
} from '../../../src/ports/Repositories';
import { Actor } from '../../../src/ports/Actor';
import { Operation, OperationStatus } from '../../../src/entities/Operation';
import { Money } from '../../../src/value-objects/Money';
import { UniqueEntityID } from '../../../src/value-objects/UniqueEntityID';
import { UserRole } from '@marketplace/shared-types';

/**
 * `contract_signed` significa "el vendedor todavía no cedió el control": la
 * plataforma no puede destrabarlo, solo avisar. Antes no tenía categoría
 * propia en el tablero — no contaba como espera nuestra ni como espera del
 * vendedor, así que un admin no podía distinguir "estoy trabado por acceso"
 * de "estoy esperando que el vendedor actúe".
 */

const ADMIN: Actor = { id: 'admin-1', role: UserRole.ADMIN };
const SELLER_ID = new UniqueEntityID();
const BUYER_ID = new UniqueEntityID();

function operacionEn(status: OperationStatus): Operation {
    const op = Operation.create({
        listingId: new UniqueEntityID(),
        buyerId: BUYER_ID,
        sellerId: SELLER_ID,
        offerPrice: Money.fromCents(500000, 'USD'),
    });
    if (status === 'offer_sent') return op;
    op.acceptCurrentOffer('seller');
    if (status === 'contract_pending') return op;
    op.signContract();
    if (status === 'contract_signed') return op;
    op.initiateTransfer({ declaredBy: SELLER_ID, controlCeded: true });
    if (status === 'transfer_in_progress') return op;
    op.confirmAssetCustody({
        verifiedBy: new UniqueEntityID(),
        isPrimaryOwner: true,
        accessSecured: true,
        metrics: {},
    });
    if (status === 'asset_in_custody') return op;
    op.confirmBuyerPayment({
        provider: 'transferencia',
        method: 'transferencia_bancaria',
        amountCents: op.buyerPays!.getCents(),
        currency: op.buyerPays!.getCurrency(),
    });
    return op; // payment_received
}

function armar(operaciones: Operation[]) {
    let llamadasAFindByStatuses = 0;

    const operationRepo: IOperationRepository = {
        findById: vi.fn().mockResolvedValue(null),
        findByListing: vi.fn().mockResolvedValue([]),
        findByParty: vi.fn().mockResolvedValue([]),
        findByStatuses: vi.fn((statuses: OperationStatus[]) => {
            llamadasAFindByStatuses += 1;
            return Promise.resolve(operaciones.filter((op) => statuses.includes(op.status)));
        }),
        save: vi.fn().mockResolvedValue(undefined),
    };
    const listingRepo: IListingRepository = {
        findById: vi.fn().mockResolvedValue(null),
        findPublished: vi.fn().mockResolvedValue([]),
        findBySeller: vi.fn().mockResolvedValue([]),
        findByStatus: vi.fn().mockResolvedValue([]),
        findHeldBy: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
    };
    const reportRepo: IReportRepository = {
        findById: vi.fn().mockResolvedValue(null),
        findByUser: vi.fn().mockResolvedValue([]),
        findByOperation: vi.fn().mockResolvedValue([]),
        findOpen: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
    };
    const userRepo: IUserRepository = {
        findById: vi.fn().mockResolvedValue(null),
        findByEmail: vi.fn().mockResolvedValue(null),
        findByRole: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
    };

    return {
        useCase: new GetPlatformDashboardUseCase(listingRepo, operationRepo, reportRepo, userRepo),
        llamadas: () => llamadasAFindByStatuses,
    };
}

describe('GetPlatformDashboardUseCase — ESPERAN_AL_VENDEDOR', () => {
    it('contract_signed aparece en waitingOnSeller y no en pending', async () => {
        const firmada = operacionEn('contract_signed');
        const { useCase } = armar([firmada]);

        const tablero = await useCase.execute(ADMIN);

        const idsEnEspera = tablero.waitingOnSeller.map((p) => p.id);
        const idsEnPending = tablero.pending.map((p) => p.id);

        expect(idsEnEspera).toContain(firmada.id.toString());
        expect(idsEnPending).not.toContain(firmada.id.toString());
    });

    it('operationsInProgress sigue contando los mismos cinco estados', async () => {
        const operaciones = [
            operacionEn('contract_pending'),
            operacionEn('contract_signed'),
            operacionEn('transfer_in_progress'),
            operacionEn('asset_in_custody'),
            operacionEn('payment_received'),
        ];
        const { useCase } = armar(operaciones);

        const tablero = await useCase.execute(ADMIN);

        expect(tablero.operationsInProgress).toBe(5);
    });

    it('el sexto findByStatuses corre dentro del mismo Promise.all ya existente', async () => {
        const { useCase, llamadas } = armar([]);

        await useCase.execute(ADMIN);

        // 3 llamadas a findByStatuses existían antes de este cambio
        // (EN_CURSO, ESPERAN_A_LA_PLATAFORMA, contract_pending, completed) más
        // la nueva de ESPERAN_AL_VENDEDOR: 5 en total, todas resueltas por
        // Promise.all y no en serie.
        expect(llamadas()).toBe(5);
    });

    it('las esperas a la plataforma no cambian', async () => {
        const enCustodia = operacionEn('transfer_in_progress');
        const { useCase } = armar([enCustodia]);

        const tablero = await useCase.execute(ADMIN);

        const idsEnEspera = tablero.waitingOnSeller.map((p) => p.id);
        expect(idsEnEspera).not.toContain(enCustodia.id.toString());
    });
});
