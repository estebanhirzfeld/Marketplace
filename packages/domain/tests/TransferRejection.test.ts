import { describe, it, expect, vi } from 'vitest';
import { Operation } from '../src/entities/Operation';
import { Notification } from '../src/entities/Notification';
import { Money } from '../src/value-objects/Money';
import { UniqueEntityID } from '../src/value-objects/UniqueEntityID';
import { NegotiationNotifier } from '../src/services/NegotiationNotifier';
import { RejectTransferUseCase } from '../src/use-cases/operation/RejectTransferUseCase';
import { IOperationRepository } from '../src/ports/Repositories';
import { ForbiddenError, InvalidStateError, ValidationError } from '../src/errors/DomainError';
import { UserRole } from '@marketplace/shared-types';

/**
 * Si el admin encuentra falsa la declaración de cesión del vendedor —dice que
 * cedió y el activo no llegó—, la operación vuelve a «contrato firmado» con el
 * motivo a la vista del vendedor. El plazo del vendedor no se reinicia: corre
 * desde la firma, y rechazar no la mueve.
 */

const SELLER = new UniqueEntityID();
const SIGNED = new Date('2026-10-21T12:00:00Z');

function enTraspaso(): Operation {
    const op = Operation.create({
        listingId: new UniqueEntityID(),
        buyerId: new UniqueEntityID(),
        sellerId: SELLER,
        offerPrice: Money.fromCents(1_000_000, 'USD'),
    });
    op.acceptCurrentOffer('seller');
    op.signContract(SIGNED);
    op.initiateTransfer({ declaredBy: SELLER, controlCeded: true, sellerSourceIdentity: 'vendedor@correo.com' });
    return op;
}

const ADMIN_ID = new UniqueEntityID();

describe('Operation.rejectTransfer', () => {
    it('vuelve a contrato firmado, guarda el motivo y borra la declaración', () => {
        const op = enTraspaso();
        const at = new Date('2026-10-24T10:00:00Z');

        op.rejectTransfer({ reason: '  El dominio nunca llegó a nuestra cuenta.  ', rejectedBy: ADMIN_ID, at });

        expect(op.status).toBe('contract_signed');
        expect(op.transferInitiation).toBeUndefined();
        expect(op.transferRejection).toEqual({
            reason: 'El dominio nunca llegó a nuestra cuenta.',
            rejectedBy: ADMIN_ID,
            rejectedAt: at,
        });
    });

    it('no mueve la firma: el plazo del vendedor sigue corriendo desde ahí', () => {
        const op = enTraspaso();

        op.rejectTransfer({ reason: 'No llegó.', rejectedBy: ADMIN_ID });

        expect(op.milestones.signedAt).toEqual(SIGNED);
    });

    it('sin motivo no se puede rechazar', () => {
        expect(() => enTraspaso().rejectTransfer({ reason: '   ', rejectedBy: ADMIN_ID })).toThrow(
            new ValidationError('Decile al vendedor por qué: el motivo es lo que le va a permitir corregirlo.'),
        );
    });

    it('solo con la cesión declarada', () => {
        const op = Operation.create({
            listingId: new UniqueEntityID(),
            buyerId: new UniqueEntityID(),
            sellerId: SELLER,
            offerPrice: Money.fromCents(1_000_000, 'USD'),
        });
        op.acceptCurrentOffer('seller');
        op.signContract();

        expect(() => op.rejectTransfer({ reason: 'No llegó.', rejectedBy: ADMIN_ID })).toThrow(InvalidStateError);
    });

    it('una nueva declaración deja atrás el rechazo', () => {
        const op = enTraspaso();
        op.rejectTransfer({ reason: 'No llegó.', rejectedBy: ADMIN_ID });

        op.initiateTransfer({ declaredBy: SELLER, controlCeded: true, sellerSourceIdentity: 'vendedor@correo.com' });

        expect(op.status).toBe('transfer_in_progress');
        expect(op.transferRejection).toBeUndefined();
    });
});

describe('RejectTransferUseCase', () => {
    function armar(op: Operation) {
        const enviadas: Notification[] = [];
        const repo: IOperationRepository = {
            findById: vi.fn().mockResolvedValue(op),
            findByListing: vi.fn(),
            findByParty: vi.fn(),
            findByStatuses: vi.fn(),
            save: vi.fn().mockResolvedValue(undefined),
        };
        const avisos = new NegotiationNotifier({
            notify: vi.fn(async (ns: Notification[]) => {
                enviadas.push(...ns);
            }),
        });
        return { repo, enviadas, useCase: new RejectTransferUseCase(repo, avisos) };
    }

    it('un admin la rechaza, se guarda y el vendedor recibe el aviso', async () => {
        const op = enTraspaso();
        const { repo, enviadas, useCase } = armar(op);

        await useCase.execute(op.id.toString(), 'No llegó.', { id: ADMIN_ID.toString(), role: UserRole.ADMIN });

        expect(op.status).toBe('contract_signed');
        expect(repo.save).toHaveBeenCalledWith(op);
        expect(enviadas.map((n) => ({ type: n.type, to: n.toSnapshot().props.userId.toString() }))).toEqual([
            { type: 'cesion_rechazada', to: SELLER.toString() },
        ]);
    });

    it('nadie más que un admin la puede rechazar', async () => {
        const op = enTraspaso();
        const { repo, useCase } = armar(op);

        await expect(
            useCase.execute(op.id.toString(), 'No llegó.', { id: SELLER.toString(), role: UserRole.SELLER }),
        ).rejects.toThrow(ForbiddenError);
        expect(repo.save).not.toHaveBeenCalled();
    });
});
