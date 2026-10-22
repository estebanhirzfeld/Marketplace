import { describe, it, expect } from 'vitest';
import { Operation } from '../src/entities/Operation';
import { Money } from '../src/value-objects/Money';
import { UniqueEntityID } from '../src/value-objects/UniqueEntityID';

/**
 * Los hitos de una operación son las anclas de sus plazos: la firma, la
 * custodia, el pago y la entrega. La custodia y el pago ya tienen su constancia
 * con fecha, así que se leen de ahí; la firma no estaba guardada en ningún
 * lado y se guarda al firmar.
 */

const SELLER = new UniqueEntityID();

function pendienteDeFirma(): Operation {
    const op = Operation.create({
        listingId: new UniqueEntityID(),
        buyerId: new UniqueEntityID(),
        sellerId: SELLER,
        offerPrice: Money.fromCents(1_000_000, 'USD'),
    });
    op.acceptCurrentOffer('seller');
    return op;
}

describe('Operation.milestones', () => {
    it('antes de firmar no hay hitos', () => {
        expect(pendienteDeFirma().milestones).toEqual({});
    });

    it('firmar guarda cuándo se firmó', () => {
        const op = pendienteDeFirma();
        const at = new Date('2026-10-21T12:00:00Z');

        op.signContract(at);

        expect(op.milestones.signedAt).toEqual(at);
    });

    it('la custodia y el pago se leen de sus constancias', () => {
        const op = pendienteDeFirma();
        op.signContract(new Date('2026-10-21T12:00:00Z'));
        op.initiateTransfer({ declaredBy: SELLER, controlCeded: true });
        op.confirmAssetCustody({ verifiedBy: new UniqueEntityID(), isPrimaryOwner: true, accessSecured: true, metrics: {} });
        op.confirmBuyerPayment({
            provider: 'transferencia',
            method: 'transferencia_bancaria',
            amountCents: op.buyerPays!.getCents(),
            currency: 'USD',
        });

        expect(op.milestones.custodyAt).toEqual(op.custodyVerification!.verifiedAt);
        expect(op.milestones.paidAt).toEqual(op.payment!.confirmedAt);
        expect(op.milestones.deliveredAt).toBeUndefined();
    });

    it('una operación guardada antes de este cambio se rehidrata sin hitos', () => {
        const op = pendienteDeFirma();
        op.signContract();
        const { props } = op.toSnapshot();
        const { milestones: _sin, ...viejas } = props;

        const vieja = Operation.reconstitute(viejas, op.id, op.createdAt);

        expect(vieja.milestones.signedAt).toBeUndefined();
        expect(vieja.status).toBe('contract_signed');
    });
});
