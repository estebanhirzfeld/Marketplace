import { describe, it, expect, vi } from 'vitest';
import { Operation } from '../src/entities/Operation';
import { Notification } from '../src/entities/Notification';
import { User } from '../src/entities/User';
import { Email } from '../src/value-objects/Email';
import { BusinessCalendar, DEFAULT_HANDOVER_DEADLINES, HandoverDeadlines } from '../src/value-objects/HandoverDeadlines';
import { IFileStorage } from '../src/ports/IFileStorage';
import { IOperationRepository, IUserRepository } from '../src/ports/Repositories';
import { NegotiationNotifier } from '../src/services/NegotiationNotifier';
import { PlatformNotifier } from '../src/services/PlatformNotifier';
import {
    AddReviewBankReferenceUseCase,
    AttachSellerStatementUseCase,
    ExpireReceiptReviewsUseCase,
    RequestReceiptReviewUseCase,
    ResolveReceiptCoherenceUseCase,
    ResolveReceiptReviewUseCase,
} from '../src/use-cases/operation/ReceiptReviewUseCases';
import { DecidePaymentReceiptUseCase } from '../src/use-cases/operation/PaymentReceiptUseCases';
import { ForbiddenError } from '../src/errors/DomainError';
import { UserRole } from '@marketplace/shared-types';
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

    it('la comisión en revisión no se da por acreditada por silencio: la resuelve la plataforma', () => {
        const op = enCustodia();
        op.uploadReceipt('platform', file, AT);
        op.decideReceipt('platform', { confirm: false, code: 'not_credited' }, ADMIN, AT);
        op.requestReceiptReview('platform', {}, LATER);
        op.resolveReceiptCoherence('platform', { coherent: true }, ADMIN, SELLER_DEADLINE, LATER);

        expect(op.expireReceiptReviews(AFTER_DEADLINE)).toEqual([]);
    });

    it('recuerda una sola vez al vendedor, en las últimas 24 horas de su plazo', () => {
        const op = coherente();

        expect(op.remindReceiptReviews(LATER)).toEqual([]);
        const dayBefore = new Date(SELLER_DEADLINE.getTime() - 12 * 3600_000);
        expect(op.remindReceiptReviews(dayBefore)).toEqual(['seller']);
        expect(op.remindReceiptReviews(dayBefore)).toEqual([]);
    });
});

describe('casos de uso de la revisión', () => {
    function armar(op: Operation) {
        const enviadas: Notification[] = [];
        const notifier = { notify: vi.fn(async (ns: Notification[]) => { enviadas.push(...ns); }) };
        const admin = User.create({ email: Email.create('admin@pagos.com'), fullName: 'Admin', passwordHash: 'x'.repeat(60), role: UserRole.ADMIN });
        const users: IUserRepository = {
            findById: vi.fn().mockResolvedValue(null),
            findByEmail: vi.fn().mockResolvedValue(null),
            findByRole: vi.fn(async (role) => (role === UserRole.ADMIN ? [admin] : [])),
            save: vi.fn(),
        };
        const repo: IOperationRepository = {
            findById: vi.fn().mockResolvedValue(op),
            findByListing: vi.fn(),
            findByParty: vi.fn(),
            findByStatuses: vi.fn().mockResolvedValue([op]),
            save: vi.fn().mockResolvedValue(undefined),
        };
        const storage: IFileStorage = { put: vi.fn(), get: vi.fn() };
        const clock = { now: LATER };
        const deadlines = new HandoverDeadlines(DEFAULT_HANDOVER_DEADLINES, new BusinessCalendar([]));
        const avisos = new NegotiationNotifier(notifier);
        const plataforma = new PlatformNotifier(notifier, users);
        const now = () => clock.now;
        return {
            enviadas,
            repo,
            storage,
            clock,
            deadlines,
            adminId: admin.id,
            request: new RequestReceiptReviewUseCase(repo, plataforma, now),
            addReference: new AddReviewBankReferenceUseCase(repo),
            coherence: new ResolveReceiptCoherenceUseCase(repo, deadlines, avisos, now),
            statement: new AttachSellerStatementUseCase(repo, storage, plataforma, now),
            resolve: new ResolveReceiptReviewUseCase(repo, avisos, now),
            decide: new DecidePaymentReceiptUseCase(repo, deadlines, avisos, now, plataforma),
            expire: new ExpireReceiptReviewsUseCase(repo, avisos, now),
        };
    }
    const actor = (id: UniqueEntityID, role: UserRole) => ({ id: id.toString(), role });
    const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);

    it('solo el comprador pide la revisión, y le avisa a la plataforma', async () => {
        const op = rechazado();
        const { request, enviadas } = armar(op);

        await expect(request.execute(op.id.toString(), 'seller', {}, actor(SELLER, UserRole.SELLER))).rejects.toThrow(ForbiddenError);
        await request.execute(op.id.toString(), 'seller', { bankReference: 'ABC123' }, actor(BUYER, UserRole.BUYER));

        expect(seller(op).status).toBe('in_review');
        expect(enviadas.map((n) => n.type)).toEqual(['revision_solicitada']);
    });

    it('la coherencia la resuelve un admin; coherente, el vendedor tiene 2 días hábiles y se le avisa', async () => {
        const op = rechazado();
        op.requestReceiptReview('seller', {}, LATER);
        const { coherence, enviadas, deadlines } = armar(op);

        await expect(coherence.execute(op.id.toString(), 'seller', { coherent: true }, actor(BUYER, UserRole.BUYER))).rejects.toThrow(ForbiddenError);
        await coherence.execute(op.id.toString(), 'seller', { coherent: true }, actor(ADMIN, UserRole.ADMIN));

        expect(seller(op).review?.sellerDeadline).toEqual(deadlines.sellerTransferConfirmation(LATER));
        expect(enviadas.map((n) => [n.type, n.toSnapshot().props.userId.toString()])).toEqual([['revision_pendiente_vendedor', SELLER.toString()]]);
        expect(enviadas[0].toSnapshot().props.occursAt).toEqual(deadlines.sellerTransferConfirmation(LATER));
    });

    it('incoherente, se rechaza y se le avisa al comprador', async () => {
        const op = rechazado();
        op.requestReceiptReview('seller', {}, LATER);
        const { coherence, enviadas } = armar(op);

        await coherence.execute(op.id.toString(), 'seller', { coherent: false, reason: 'El CUIT de destino no coincide.' }, actor(ADMIN, UserRole.ADMIN));

        expect(seller(op).status).toBe('rejected');
        expect(enviadas.map((n) => [n.type, n.toSnapshot().props.userId.toString()])).toEqual([['comprobante_rechazado', BUYER.toString()]]);
    });

    it('el vendedor adjunta sus movimientos: se guardan y se le avisa a la plataforma', async () => {
        const op = rechazado();
        op.requestReceiptReview('seller', {}, LATER);
        op.resolveReceiptCoherence('seller', { coherent: true }, ADMIN, SELLER_DEADLINE, LATER);
        const { statement, storage, enviadas } = armar(op);

        await expect(statement.execute(op.id.toString(), PDF, actor(BUYER, UserRole.BUYER))).rejects.toThrow(ForbiddenError);
        await statement.execute(op.id.toString(), PDF, actor(SELLER, UserRole.SELLER));

        expect(storage.put).toHaveBeenCalledWith(expect.stringMatching(/^statements\/.+\.pdf$/), PDF, 'application/pdf');
        expect(seller(op).review?.sellerStatement).toBeDefined();
        expect(enviadas.map((n) => n.type)).toEqual(['revision_solicitada']);
    });

    it('resolver que se acreditó confirma el pago y avisa a las dos partes', async () => {
        const op = rechazado();
        op.requestReceiptReview('seller', {}, LATER);
        op.resolveReceiptCoherence('seller', { coherent: true }, ADMIN, SELLER_DEADLINE, LATER);
        const { resolve, enviadas } = armar(op);

        await expect(resolve.execute(op.id.toString(), 'seller', { credited: true }, actor(SELLER, UserRole.SELLER))).rejects.toThrow(ForbiddenError);
        await resolve.execute(op.id.toString(), 'seller', { credited: true }, actor(ADMIN, UserRole.ADMIN));

        expect(op.status).toBe('payment_received');
        expect(enviadas.map((n) => n.type).sort()).toEqual(['pago_confirmado', 'revision_resuelta', 'revision_resuelta']);
    });

    it('el job recuerda al vendedor y, vencido su plazo, da el pago por acreditado', async () => {
        const op = rechazado();
        op.requestReceiptReview('seller', {}, LATER);
        op.resolveReceiptCoherence('seller', { coherent: true }, ADMIN, SELLER_DEADLINE, LATER);
        const { expire, enviadas, clock, repo } = armar(op);

        clock.now = new Date(SELLER_DEADLINE.getTime() - 12 * 3600_000);
        expect(await expire.execute()).toEqual({ reminded: 1, confirmed: 0 });
        expect(enviadas.map((n) => n.type)).toEqual(['revision_pendiente_vendedor']);

        enviadas.length = 0;
        clock.now = AFTER_DEADLINE;
        expect(await expire.execute()).toEqual({ reminded: 0, confirmed: 1 });
        expect(op.status).toBe('payment_received');
        expect(enviadas.map((n) => n.type).sort()).toEqual(['pago_confirmado', 'revision_resuelta', 'revision_resuelta']);
        expect(repo.save).toHaveBeenCalledTimes(2);
    });

    it('el segundo rechazo abre la revisión: avisa a la plataforma y al comprador que está en revisión', async () => {
        const op = rechazado();
        op.uploadReceipt('seller', { ...file, fileKey: 'receipts/op/seller-2.pdf' }, LATER);
        const { decide, enviadas } = armar(op);

        await decide.execute(op.id.toString(), 'seller', { confirm: false, code: 'not_credited' }, actor(SELLER, UserRole.SELLER));

        expect(seller(op).status).toBe('in_review');
        expect(enviadas.map((n) => [n.type, n.toSnapshot().props.userId.toString()]).sort()).toEqual(
            [
                ['revision_en_curso', BUYER.toString()],
                ['revision_solicitada', expect.any(String)],
            ].sort(),
        );
        expect(enviadas.map((n) => n.type)).not.toContain('comprobante_rechazado');
    });

    it('fuera de la custodia una revisión no se resuelve: el pago ya entró por otro lado', () => {
        const op = rechazado();
        op.requestReceiptReview('seller', {}, LATER);
        op.resolveReceiptCoherence('seller', { coherent: true }, ADMIN, SELLER_DEADLINE, LATER);
        op.confirmBuyerPayment({ provider: 'mercadopago', externalId: 'mp-1', method: 'account_money', amountCents: op.buyerPays!.getCents(), currency: 'USD' });

        expect(() => op.resolveReceiptReview('seller', { credited: true }, ADMIN, LATER)).toThrow(
            new InvalidStateError('La revisión de un comprobante es con el activo en custodia.'),
        );
        expect(op.expireReceiptReviews(AFTER_DEADLINE)).toEqual([]);
    });

    it('el comprador suma el ID COELSA después de pedir la revisión', async () => {
        const op = rechazado();
        op.requestReceiptReview('seller', {}, LATER);
        const { addReference } = armar(op);

        await expect(addReference.execute(op.id.toString(), 'seller', 'XYZ', actor(SELLER, UserRole.SELLER))).rejects.toThrow(ForbiddenError);
        await addReference.execute(op.id.toString(), 'seller', 'XYZ', actor(BUYER, UserRole.BUYER));

        expect(seller(op).review?.bankReference).toBe('XYZ');
    });
});
