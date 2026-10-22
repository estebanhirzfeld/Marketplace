import { describe, it, expect, vi } from 'vitest';
import { Operation } from '../src/entities/Operation';
import { Notification } from '../src/entities/Notification';
import { User } from '../src/entities/User';
import { Money } from '../src/value-objects/Money';
import { Email } from '../src/value-objects/Email';
import { UniqueEntityID } from '../src/value-objects/UniqueEntityID';
import { BusinessCalendar, DEFAULT_HANDOVER_DEADLINES, HandoverDeadlines } from '../src/value-objects/HandoverDeadlines';
import { IFileStorage } from '../src/ports/IFileStorage';
import { IOperationRepository, IUserRepository } from '../src/ports/Repositories';
import { NegotiationNotifier } from '../src/services/NegotiationNotifier';
import { PlatformNotifier } from '../src/services/PlatformNotifier';
import {
    DecidePaymentReceiptUseCase,
    GetPaymentReceiptFileUseCase,
    UploadPaymentReceiptUseCase,
    detectReceiptType,
} from '../src/use-cases/operation/PaymentReceiptUseCases';
import { ForbiddenError, InvalidStateError, ValidationError } from '../src/errors/DomainError';
import { UserRole } from '@marketplace/shared-types';

/**
 * La transferencia se divide como el split: el comprador le transfiere al
 * vendedor lo suyo y a la plataforma la comisión, y sube un comprobante de
 * cada una. El vendedor confirma el suyo y el admin el de la comisión. Con los
 * dos confirmados, el pago queda confirmado. La plataforma nunca recibe la
 * plata del vendedor.
 */

const SELLER = new UniqueEntityID();
const BUYER = new UniqueEntityID();
const ADMIN = new UniqueEntityID();
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const UPLOADED = new Date('2026-10-22T10:00:00-03:00'); // jueves

const actor = (id: UniqueEntityID, role: UserRole) => ({ id: id.toString(), role });

function enCustodia(): Operation {
    const op = Operation.create({ listingId: new UniqueEntityID(), buyerId: BUYER, sellerId: SELLER, offerPrice: Money.fromCents(100_000, 'USD') });
    op.acceptCurrentOffer('seller');
    op.signContract();
    op.initiateTransfer({ declaredBy: SELLER, controlCeded: true });
    op.confirmAssetCustody({ verifiedBy: ADMIN, isPrimaryOwner: true, accessSecured: true, metrics: {} });
    return op;
}

const file = { fileKey: 'receipts/op/seller.pdf', contentType: 'application/pdf', sizeBytes: 1200 };

describe('Operation — comprobantes de la transferencia', () => {
    it('el comprador sube uno por destino, pendientes de confirmar', () => {
        const op = enCustodia();

        op.uploadReceipt('seller', file, UPLOADED);
        op.uploadReceipt('platform', { ...file, fileKey: 'receipts/op/platform.pdf' }, UPLOADED);

        expect(op.paymentReceipts.map((r) => [r.recipient, r.status])).toEqual([
            ['seller', 'pending'],
            ['platform', 'pending'],
        ]);
        expect(op.status).toBe('asset_in_custody');
    });

    it('con los dos confirmados, el pago queda confirmado por el total', () => {
        const op = enCustodia();
        op.uploadReceipt('seller', file, UPLOADED);
        op.uploadReceipt('platform', file, UPLOADED);

        op.decideReceipt('seller', { confirm: true }, SELLER);
        expect(op.status).toBe('asset_in_custody');
        op.decideReceipt('platform', { confirm: true }, ADMIN);

        expect(op.status).toBe('payment_received');
        expect(op.payment).toMatchObject({
            provider: 'transferencia',
            method: 'transferencia_dividida',
            amountCents: op.buyerPays!.getCents(),
            currency: 'USD',
        });
    });

    it('rechazar se hace eligiendo un motivo; el detalle es opcional', () => {
        const op = enCustodia();
        op.uploadReceipt('seller', file, UPLOADED);

        op.decideReceipt('seller', { confirm: false, code: 'not_credited' }, SELLER);
        expect(op.paymentReceipts[0]).toMatchObject({ status: 'rejected', rejectionCode: 'not_credited' });
        expect(op.paymentReceipts[0].rejectionReason).toBeUndefined();

        op.uploadReceipt('seller', { ...file, fileKey: 'receipts/op/seller-2.pdf' }, UPLOADED);
        op.decideReceipt('seller', { confirm: false, code: 'amount_mismatch', detail: '  Llegaron AR$ 1.400.000.  ' }, SELLER);
        expect(op.paymentReceipts[0]).toMatchObject({ rejectionCode: 'amount_mismatch', rejectionReason: 'Llegaron AR$ 1.400.000.' });
    });

    it('con «otro motivo», el detalle es obligatorio', () => {
        const op = enCustodia();
        op.uploadReceipt('seller', file, UPLOADED);

        expect(() => op.decideReceipt('seller', { confirm: false, code: 'other', detail: '  ' }, SELLER)).toThrow(
            new ValidationError('Contale al comprador qué sucedió: es lo que le va a permitir corregirlo.'),
        );
        op.decideReceipt('seller', { confirm: false, code: 'other', detail: 'El comprobante es de otra operación.' }, SELLER);
        expect(op.paymentReceipts[0]).toMatchObject({ status: 'rejected', rejectionCode: 'other' });
    });

    it('un comprobante rechazado se puede volver a subir', () => {
        const op = enCustodia();
        op.uploadReceipt('seller', file, UPLOADED);
        op.decideReceipt('seller', { confirm: false, code: 'not_credited' }, SELLER);

        op.uploadReceipt('seller', { ...file, fileKey: 'receipts/op/seller-2.pdf' }, UPLOADED);
        expect(op.paymentReceipts[0]).toMatchObject({ status: 'pending', fileKey: 'receipts/op/seller-2.pdf' });
    });

    it('un comprobante confirmado no se reemplaza', () => {
        const op = enCustodia();
        op.uploadReceipt('seller', file, UPLOADED);
        op.decideReceipt('seller', { confirm: true }, SELLER);

        expect(() => op.uploadReceipt('seller', file, UPLOADED)).toThrow(InvalidStateError);
    });

    it('solo con el activo en custodia', () => {
        const op = Operation.create({ listingId: new UniqueEntityID(), buyerId: BUYER, sellerId: SELLER, offerPrice: Money.fromCents(100_000, 'USD') });

        expect(() => op.uploadReceipt('seller', file, UPLOADED)).toThrow(InvalidStateError);
    });
});

describe('detectReceiptType', () => {
    it('reconoce un PDF y una imagen por sus primeros bytes, no por el nombre', () => {
        expect(detectReceiptType(PDF)).toEqual({ contentType: 'application/pdf', extension: 'pdf' });
        expect(detectReceiptType(PNG)).toEqual({ contentType: 'image/png', extension: 'png' });
        expect(detectReceiptType(new Uint8Array([0x4d, 0x5a, 0x90, 0x00]))).toBeUndefined();
    });
});

describe('UploadPaymentReceiptUseCase y DecidePaymentReceiptUseCase', () => {
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
            findByStatuses: vi.fn(),
            save: vi.fn().mockResolvedValue(undefined),
        };
        const stored = new Map<string, { bytes: Uint8Array; contentType: string }>();
        const storage: IFileStorage = {
            put: vi.fn(async (key, bytes, contentType) => { stored.set(key, { bytes, contentType }); }),
            get: vi.fn(async (key) => stored.get(key) ?? null),
        };
        const clock = { now: UPLOADED };
        const deadlines = new HandoverDeadlines(DEFAULT_HANDOVER_DEADLINES, new BusinessCalendar([]));
        const avisos = new NegotiationNotifier(notifier);
        const plataforma = new PlatformNotifier(notifier, users);
        return {
            enviadas,
            repo,
            storage,
            clock,
            upload: new UploadPaymentReceiptUseCase(repo, storage, avisos, plataforma, () => clock.now),
            decide: new DecidePaymentReceiptUseCase(repo, deadlines, avisos, () => clock.now),
            file: new GetPaymentReceiptFileUseCase(repo, storage),
        };
    }

    it('el comprador sube el comprobante del vendedor: se guarda y le avisa al vendedor', async () => {
        const op = enCustodia();
        const { upload, storage, enviadas } = armar(op);

        await upload.execute(op.id.toString(), 'seller', PDF, actor(BUYER, UserRole.BUYER));

        expect(storage.put).toHaveBeenCalledWith(expect.stringMatching(/^receipts\/.+\/seller-.+\.pdf$/), PDF, 'application/pdf');
        expect(op.paymentReceipts[0]).toMatchObject({ recipient: 'seller', contentType: 'application/pdf', sizeBytes: PDF.length });
        expect(enviadas.map((n) => [n.type, n.toSnapshot().props.userId.toString()])).toEqual([['comprobante_subido', SELLER.toString()]]);
    });

    it('el de la comisión le avisa a la plataforma', async () => {
        const op = enCustodia();
        const { upload, enviadas } = armar(op);

        await upload.execute(op.id.toString(), 'platform', PNG, actor(BUYER, UserRole.BUYER));

        expect(enviadas.map((n) => n.type)).toEqual(['comprobante_subido']);
        expect(enviadas[0].toSnapshot().props.userId.toString()).not.toBe(SELLER.toString());
    });

    it('un archivo que no es imagen ni PDF, o demasiado grande, se rechaza', async () => {
        const op = enCustodia();
        const { upload } = armar(op);
        const message = 'El comprobante tiene que ser una imagen (JPG, PNG o WebP) o un PDF de hasta 5 MB.';

        await expect(upload.execute(op.id.toString(), 'seller', new Uint8Array([1, 2, 3, 4]), actor(BUYER, UserRole.BUYER))).rejects.toThrow(new ValidationError(message));
        const big = new Uint8Array(5 * 1024 * 1024 + 1);
        big.set(PDF);
        await expect(upload.execute(op.id.toString(), 'seller', big, actor(BUYER, UserRole.BUYER))).rejects.toThrow(new ValidationError(message));
    });

    it('solo el comprador sube comprobantes', async () => {
        const op = enCustodia();
        const { upload } = armar(op);

        await expect(upload.execute(op.id.toString(), 'seller', PDF, actor(SELLER, UserRole.SELLER))).rejects.toThrow(ForbiddenError);
    });

    it('el vendedor confirma el suyo; el de la comisión es del admin', async () => {
        const op = enCustodia();
        const { upload, decide } = armar(op);
        await upload.execute(op.id.toString(), 'seller', PDF, actor(BUYER, UserRole.BUYER));
        await upload.execute(op.id.toString(), 'platform', PDF, actor(BUYER, UserRole.BUYER));

        await expect(decide.execute(op.id.toString(), 'platform', { confirm: true }, actor(SELLER, UserRole.SELLER))).rejects.toThrow(ForbiddenError);
        await expect(decide.execute(op.id.toString(), 'seller', { confirm: true }, actor(ADMIN, UserRole.ADMIN))).rejects.toThrow(ForbiddenError);

        await decide.execute(op.id.toString(), 'seller', { confirm: true }, actor(SELLER, UserRole.SELLER));
        await decide.execute(op.id.toString(), 'platform', { confirm: true }, actor(ADMIN, UserRole.ADMIN));
        expect(op.status).toBe('payment_received');
    });

    it('si el vendedor no responde en 2 días hábiles, decide el admin', async () => {
        const op = enCustodia();
        const { upload, decide, clock } = armar(op);
        await upload.execute(op.id.toString(), 'seller', PDF, actor(BUYER, UserRole.BUYER));

        // Jueves 22: el plazo vence al terminar el lunes 26.
        clock.now = new Date('2026-10-27T09:00:00-03:00');
        await decide.execute(op.id.toString(), 'seller', { confirm: true }, actor(ADMIN, UserRole.ADMIN));

        expect(op.paymentReceipts[0].status).toBe('confirmed');
    });

    it('rechazar un comprobante le avisa al comprador', async () => {
        const op = enCustodia();
        const { upload, decide, enviadas } = armar(op);
        await upload.execute(op.id.toString(), 'seller', PDF, actor(BUYER, UserRole.BUYER));
        enviadas.length = 0;

        await decide.execute(op.id.toString(), 'seller', { confirm: false, code: 'not_credited' }, actor(SELLER, UserRole.SELLER));

        expect(enviadas.map((n) => [n.type, n.toSnapshot().props.userId.toString()])).toEqual([['comprobante_rechazado', BUYER.toString()]]);
    });

    it('el archivo lo ven el comprador, el admin y el vendedor el suyo, nadie más', async () => {
        const op = enCustodia();
        const { upload, file } = armar(op);
        await upload.execute(op.id.toString(), 'platform', PDF, actor(BUYER, UserRole.BUYER));

        expect((await file.execute(op.id.toString(), 'platform', actor(ADMIN, UserRole.ADMIN))).bytes).toEqual(PDF);
        expect((await file.execute(op.id.toString(), 'platform', actor(BUYER, UserRole.BUYER))).contentType).toBe('application/pdf');
        await expect(file.execute(op.id.toString(), 'platform', actor(SELLER, UserRole.SELLER))).rejects.toThrow(ForbiddenError);
        await expect(file.execute(op.id.toString(), 'platform', actor(new UniqueEntityID(), UserRole.BUYER))).rejects.toThrow(ForbiddenError);
    });
});
