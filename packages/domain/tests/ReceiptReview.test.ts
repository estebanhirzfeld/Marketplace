import { describe, it, expect } from 'vitest';
import { Operation } from '../src/entities/Operation';
import { Money } from '../src/value-objects/Money';
import { UniqueEntityID } from '../src/value-objects/UniqueEntityID';
import { InvalidStateError, ValidationError } from '../src/errors/DomainError';

/**
 * La revisión de un comprobante rechazado. Ningún documento de las partes
 * prueba por sí solo que se acreditó: la prueba la tiene quien recibe o el
 * banco. El comprobante pasa a revisión cuando el comprador la pide o cuando
 * el mismo comprobante se rechaza dos veces; la plataforma revisa la
 * coherencia, el vendedor responde, y si calla ante un comprobante coherente,
 * el pago se da por acreditado. Mientras dura, la operación no se cancela.
 */

const SELLER = new UniqueEntityID();
const BUYER = new UniqueEntityID();
const ADMIN = new UniqueEntityID();
const AT = new Date('2026-10-22T10:00:00-03:00');
const LATER = new Date('2026-10-23T10:00:00-03:00');
const SELLER_DEADLINE = new Date('2026-10-26T23:59:59-03:00');
const AFTER_DEADLINE = new Date('2026-10-27T09:00:00-03:00');

const file = { fileKey: 'receipts/op/seller.pdf', contentType: 'application/pdf', sizeBytes: 1200 };
const statement = { fileKey: 'statements/op/seller.pdf', contentType: 'application/pdf', sizeBytes: 3000 };

function enCustodia(): Operation {
    const op = Operation.create({ listingId: new UniqueEntityID(), buyerId: BUYER, sellerId: SELLER, offerPrice: Money.fromCents(100_000, 'USD') });
    op.acceptCurrentOffer('seller');
    op.signContract();
    op.initiateTransfer({ declaredBy: SELLER, controlCeded: true });
    op.confirmAssetCustody({ verifiedBy: ADMIN, isPrimaryOwner: true, accessSecured: true, metrics: {} });
    return op;
}

/** Con la comisión confirmada y el comprobante del vendedor rechazado. */
function rechazado(): Operation {
    const op = enCustodia();
    op.uploadReceipt('platform', { ...file, fileKey: 'receipts/op/platform.pdf' }, AT);
    op.decideReceipt('platform', { confirm: true }, ADMIN, AT);
    op.uploadReceipt('seller', file, AT);
    op.decideReceipt('seller', { confirm: false, code: 'not_credited' }, SELLER, AT);
    return op;
}

const seller = (op: Operation) => op.paymentReceipts.find((r) => r.recipient === 'seller')!;

describe('Operation — pedir la revisión de un comprobante', () => {
    it('el comprador la pide sobre un comprobante rechazado, con el ID COELSA si lo tiene', () => {
        const op = rechazado();

        op.requestReceiptReview('seller', { bankReference: ' 0AB12CD34EF56GH78IJ90K ' }, LATER);

        expect(seller(op)).toMatchObject({
            status: 'in_review',
            review: { requestedAt: LATER, requestedBy: 'buyer', bankReference: '0AB12CD34EF56GH78IJ90K', stage: 'coherence' },
        });
        expect(op.hasOpenReceiptReview).toBe(true);
    });

    it('solo sobre un comprobante rechazado', () => {
        const op = enCustodia();
        op.uploadReceipt('seller', file, AT);

        expect(() => op.requestReceiptReview('seller', {}, LATER)).toThrow(
            new InvalidStateError('Solo se puede solicitar la revisión de un comprobante rechazado.'),
        );
    });

    it('el mismo comprobante rechazado dos veces pasa solo a revisión', () => {
        const op = rechazado();
        op.uploadReceipt('seller', { ...file, fileKey: 'receipts/op/seller-2.pdf' }, LATER);

        op.decideReceipt('seller', { confirm: false, code: 'not_credited' }, SELLER, LATER);

        expect(seller(op)).toMatchObject({ status: 'in_review', review: { requestedBy: 'automatic', stage: 'coherence' } });
    });

    it('en revisión no se reemplaza el comprobante, pero se puede sumar el ID COELSA', () => {
        const op = rechazado();
        op.requestReceiptReview('seller', {}, LATER);

        expect(() => op.uploadReceipt('seller', file, LATER)).toThrow(new InvalidStateError('El comprobante está en revisión.'));
        op.addReviewBankReference('seller', '0AB12CD34EF56GH78IJ90K');
        expect(seller(op).review?.bankReference).toBe('0AB12CD34EF56GH78IJ90K');
    });
});

describe('Operation — coherencia del comprobante', () => {
    it('incoherente: se rechaza con el motivo de la plataforma y la revisión termina', () => {
        const op = rechazado();
        op.requestReceiptReview('seller', {}, LATER);

        op.resolveReceiptCoherence('seller', { coherent: false, reason: 'El CUIT de destino no es el del vendedor.' }, ADMIN, SELLER_DEADLINE, LATER);

        expect(seller(op)).toMatchObject({ status: 'rejected', rejectionCode: 'other', rejectionReason: 'El CUIT de destino no es el del vendedor.' });
        expect(seller(op).review).toBeUndefined();
        expect(op.hasOpenReceiptReview).toBe(false);
    });

    it('incoherente pide el motivo', () => {
        const op = rechazado();
        op.requestReceiptReview('seller', {}, LATER);

        expect(() => op.resolveReceiptCoherence('seller', { coherent: false, reason: ' ' }, ADMIN, SELLER_DEADLINE, LATER)).toThrow(ValidationError);
    });

    it('coherente: el vendedor tiene su plazo para responder', () => {
        const op = rechazado();
        op.requestReceiptReview('seller', {}, LATER);

        op.resolveReceiptCoherence('seller', { coherent: true }, ADMIN, SELLER_DEADLINE, LATER);

        expect(seller(op)).toMatchObject({ status: 'in_review', review: { stage: 'awaiting_seller', sellerDeadline: SELLER_DEADLINE } });
    });
});

describe('Operation — respuesta del vendedor y resolución', () => {
    function coherente(): Operation {
        const op = rechazado();
        op.requestReceiptReview('seller', {}, LATER);
        op.resolveReceiptCoherence('seller', { coherent: true }, ADMIN, SELLER_DEADLINE, LATER);
        return op;
    }

    it('el vendedor confirma la acreditación y el pago queda confirmado', () => {
        const op = coherente();

        op.decideReceipt('seller', { confirm: true }, SELLER, LATER);

        expect(seller(op)).toMatchObject({ status: 'confirmed' });
        expect(seller(op).review).toBeUndefined();
        expect(op.status).toBe('payment_received');
    });

    it('durante la revisión el vendedor no vuelve a rechazar: adjunta sus movimientos', () => {
        const op = coherente();

        expect(() => op.decideReceipt('seller', { confirm: false, code: 'not_credited' }, SELLER, LATER)).toThrow(InvalidStateError);
        op.attachSellerStatement('seller', statement, LATER);
        expect(seller(op).review?.sellerStatement).toMatchObject({ fileKey: 'statements/op/seller.pdf', uploadedAt: LATER });
    });

    it('la plataforma resuelve que se acreditó: el pago queda confirmado aunque el vendedor lo niegue', () => {
        const op = coherente();
        op.attachSellerStatement('seller', statement, LATER);

        op.resolveReceiptReview('seller', { credited: true }, ADMIN, AFTER_DEADLINE);

        expect(seller(op)).toMatchObject({ status: 'confirmed', decidedBy: ADMIN });
        expect(op.status).toBe('payment_received');
    });

    it('la plataforma resuelve que no se acreditó: el comprador vuelve a transferir', () => {
        const op = coherente();

        op.resolveReceiptReview('seller', { credited: false }, ADMIN, AFTER_DEADLINE);

        expect(seller(op)).toMatchObject({ status: 'rejected', rejectionCode: 'not_credited' });
        expect(op.hasOpenReceiptReview).toBe(false);
        expect(op.status).toBe('asset_in_custody');
    });

    it('la plataforma no resuelve antes de revisar la coherencia', () => {
        const op = rechazado();
        op.requestReceiptReview('seller', {}, LATER);

        expect(() => op.resolveReceiptReview('seller', { credited: true }, ADMIN, LATER)).toThrow(InvalidStateError);
    });
});

describe('Operation — silencio del vendedor', () => {
    function coherente(): Operation {
        const op = rechazado();
        op.requestReceiptReview('seller', {}, LATER);
        op.resolveReceiptCoherence('seller', { coherent: true }, ADMIN, SELLER_DEADLINE, LATER);
        return op;
    }

    it('vencido su plazo sin respuesta, el pago se da por acreditado', () => {
        const op = coherente();

        expect(op.expireReceiptReviews(AFTER_DEADLINE)).toEqual(['seller']);

        expect(seller(op)).toMatchObject({ status: 'confirmed', confirmedBySilence: true });
        expect(op.status).toBe('payment_received');
    });

    it('antes del plazo no pasa nada', () => {
        const op = coherente();

        expect(op.expireReceiptReviews(LATER)).toEqual([]);
        expect(seller(op).status).toBe('in_review');
    });

    it('con los movimientos adjuntos no hay silencio: decide la plataforma', () => {
        const op = coherente();
        op.attachSellerStatement('seller', statement, LATER);

        expect(op.expireReceiptReviews(AFTER_DEADLINE)).toEqual([]);
        expect(seller(op).status).toBe('in_review');
    });
});
