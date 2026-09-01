import { describe, it, expect, vi } from 'vitest';
import { Operation } from '../../../src/entities/Operation';
import { Money } from '../../../src/value-objects/Money';
import { UniqueEntityID } from '../../../src/value-objects/UniqueEntityID';
import { ForbiddenError, InvalidStateError, NotFoundError } from '../../../src/errors/DomainError';
import { DeclareRecipientIdentityUseCase } from '../../../src/use-cases/operation/DeclareRecipientIdentityUseCase';
import { IOperationRepository } from '../../../src/ports/Repositories';
import { UserRole } from '@marketplace/shared-types';

/**
 * La entrega al comprador no dejaba constancia: `complete()` no registraba ni
 * destinatario ni confirmación. Este cambio suma la identidad receptora que el
 * comprador declara en la operación y `DeliveryVerification`, simétrica a
 * `CustodyVerification`, que `complete()` exige para cerrar.
 *
 * La identidad receptora es una tarea pendiente del comprador: disponible
 * desde `contract_pending`, exigible recién en `complete()`.
 */

const BUYER = new UniqueEntityID();
const SELLER = new UniqueEntityID();
const ADMIN = new UniqueEntityID();

function nuevaOperacion(): Operation {
    return Operation.create({
        listingId: new UniqueEntityID(),
        buyerId: BUYER,
        sellerId: SELLER,
        offerPrice: Money.fromCents(1_500_000, 'USD'),
    });
}

/** Lleva la operación hasta el estado pedido por el camino legítimo. */
function operacionEn(estado: Operation['status']): Operation {
    const op = nuevaOperacion();
    if (estado === 'offer_sent') return op;
    if (estado === 'negotiating') {
        op.counterOffer(Money.fromCents(1_600_000, 'USD'), 'seller');
        return op;
    }
    op.acceptCurrentOffer('seller'); // contract_pending
    if (estado === 'contract_pending') return op;
    op.signContract(); // contract_signed
    if (estado === 'contract_signed') return op;
    op.initiateTransfer(); // transfer_in_progress
    if (estado === 'transfer_in_progress') return op;
    op.confirmAssetCustody({
        verifiedBy: ADMIN,
        isPrimaryOwner: true,
        accessSecured: true,
        metrics: { subscribers: 1000 },
    });
    if (estado === 'asset_in_custody') return op;
    op.confirmBuyerPayment({
        provider: 'transferencia',
        method: 'transferencia_bancaria',
        amountCents: op.buyerPays!.getCents(),
        currency: op.buyerPays!.getCurrency(),
    });
    if (estado === 'payment_received') return op;
    if (estado === 'cancelled') {
        const c = nuevaOperacion();
        c.cancel();
        return c;
    }
    throw new Error(`estado no soportado por el helper: ${estado}`);
}

function unaConstancia(over: Partial<Parameters<Operation['complete']>[0]> = {}) {
    return {
        verifiedBy: ADMIN,
        buyerIsPrimaryOwner: true,
        accessTransferred: true,
        sellerRemoved: true,
        ...over,
    };
}

describe('Operation.declareRecipientIdentity', () => {
    it('el comprador la declara en contract_pending', () => {
        const op = operacionEn('contract_pending');
        op.declareRecipientIdentity('comprador@gmail.com', BUYER.toString());
        expect(op.recipientIdentity?.identifier).toBe('comprador@gmail.com');
        expect(op.recipientIdentity?.declaredAt).toBeInstanceOf(Date);
    });

    it('recorta el identificador y rechaza uno vacío', () => {
        const op = operacionEn('contract_pending');
        op.declareRecipientIdentity('  x@y.com  ', BUYER.toString());
        expect(op.recipientIdentity?.identifier).toBe('x@y.com');
        expect(() => op.declareRecipientIdentity('   ', BUYER.toString())).toThrow();
    });

    it('el vendedor no puede declararla', () => {
        const op = operacionEn('contract_signed');
        expect(() => op.declareRecipientIdentity('x@y.com', SELLER.toString())).toThrow(ForbiddenError);
    });

    it('un tercero (un admin ajeno) no puede declararla', () => {
        const op = operacionEn('contract_signed');
        expect(() => op.declareRecipientIdentity('x@y.com', ADMIN.toString())).toThrow(ForbiddenError);
    });

    it('rechaza declararla en offer_sent y en negotiating', () => {
        for (const estado of ['offer_sent', 'negotiating'] as const) {
            const op = operacionEn(estado);
            expect(() => op.declareRecipientIdentity('x@y.com', BUYER.toString())).toThrow(InvalidStateError);
        }
    });

    it('permite declararla en asset_in_custody', () => {
        const op = operacionEn('asset_in_custody');
        op.declareRecipientIdentity('x@y.com', BUYER.toString());
        expect(op.recipientIdentity?.identifier).toBe('x@y.com');
    });

    it('es re-declarable mientras no exista la constancia de entrega', () => {
        const op = operacionEn('transfer_in_progress');
        op.declareRecipientIdentity('primera@gmail.com', BUYER.toString());
        op.declareRecipientIdentity('segunda@gmail.com', BUYER.toString());
        expect(op.recipientIdentity?.identifier).toBe('segunda@gmail.com');
    });

    it('rechaza declararla en una operación cancelada', () => {
        const op = operacionEn('cancelled');
        expect(() => op.declareRecipientIdentity('x@y.com', BUYER.toString())).toThrow(InvalidStateError);
    });
});

describe('Operation.complete — registra la constancia y cierra en un solo acto', () => {
    function lista(): Operation {
        const op = operacionEn('payment_received');
        op.declareRecipientIdentity('comprador@gmail.com', BUYER.toString());
        return op;
    }

    it('camino feliz: pasa a completed, fija completedAt y guarda la constancia', () => {
        const op = lista();
        op.complete(unaConstancia());
        expect(op.status).toBe('completed');
        expect(op.toSnapshot().props.completedAt).toBeInstanceOf(Date);
        expect(op.deliveryCheck?.buyerIsPrimaryOwner).toBe(true);
    });

    it('congela deliveredToIdentifier desde la identidad declarada, no del argumento', () => {
        const op = lista();
        op.complete(unaConstancia());
        expect(op.deliveryCheck?.deliveredToIdentifier).toBe('comprador@gmail.com');
    });

    it('cambiar la identidad declarada después no altera la constancia', () => {
        const op = lista();
        op.complete(unaConstancia());
        // Ya cerrada: no se puede re-declarar. La constancia queda congelada.
        expect(() => op.declareRecipientIdentity('otra@gmail.com', BUYER.toString())).toThrow(InvalidStateError);
        expect(op.deliveryCheck?.deliveredToIdentifier).toBe('comprador@gmail.com');
    });

    it('rechaza fuera de payment_received', () => {
        const op = operacionEn('asset_in_custody');
        op.declareRecipientIdentity('x@y.com', BUYER.toString());
        expect(() => op.complete(unaConstancia())).toThrow(InvalidStateError);
    });

    it('rechaza sin identidad receptora declarada', () => {
        const op = operacionEn('payment_received');
        expect(() => op.complete(unaConstancia())).toThrow(InvalidStateError);
        expect(op.status).toBe('payment_received');
    });

    it('rechaza con buyerIsPrimaryOwner en false', () => {
        const op = lista();
        expect(() => op.complete(unaConstancia({ buyerIsPrimaryOwner: false }))).toThrow(InvalidStateError);
    });

    it('rechaza con accessTransferred en false', () => {
        const op = lista();
        expect(() => op.complete(unaConstancia({ accessTransferred: false }))).toThrow(InvalidStateError);
    });

    it('rechaza sin quién verificó', () => {
        const op = lista();
        expect(() => op.complete(unaConstancia({ verifiedBy: undefined as never }))).toThrow();
    });
});

describe('DeclareRecipientIdentityUseCase', () => {
    function mockOpRepo(op: Operation | null): IOperationRepository {
        return {
            findById: vi.fn().mockResolvedValue(op),
            findByListing: vi.fn().mockResolvedValue([]),
            findByParty: vi.fn().mockResolvedValue([]),
            findByStatuses: vi.fn().mockResolvedValue([]),
            save: vi.fn().mockResolvedValue(undefined),
        };
    }

    it('carga la operación, delega en la entidad y guarda', async () => {
        const op = operacionEn('contract_pending');
        const repo = mockOpRepo(op);

        await new DeclareRecipientIdentityUseCase(repo).execute(
            op.id.toString(),
            { identifier: 'comprador@gmail.com' },
            { id: BUYER.toString(), role: UserRole.BUYER },
        );

        expect(op.recipientIdentity?.identifier).toBe('comprador@gmail.com');
        expect(repo.save).toHaveBeenCalledOnce();
    });

    it('operación inexistente → NotFoundError', async () => {
        const repo = mockOpRepo(null);
        await expect(
            new DeclareRecipientIdentityUseCase(repo).execute(
                'nope',
                { identifier: 'x@y.com' },
                { id: BUYER.toString(), role: UserRole.BUYER },
            ),
        ).rejects.toThrow(NotFoundError);
    });

    it('el vendedor recibe ForbiddenError de la entidad', async () => {
        const op = operacionEn('contract_signed');
        const repo = mockOpRepo(op);
        await expect(
            new DeclareRecipientIdentityUseCase(repo).execute(
                op.id.toString(),
                { identifier: 'x@y.com' },
                { id: SELLER.toString(), role: UserRole.SELLER },
            ),
        ).rejects.toThrow(ForbiddenError);
    });
});
