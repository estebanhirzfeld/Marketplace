import { describe, it, expect, vi } from 'vitest';
import { Operation } from '../../../src/entities/Operation';
import { Listing } from '../../../src/entities/Listing';
import { Report } from '../../../src/entities/Report';
import { Notification } from '../../../src/entities/Notification';
import { Money } from '../../../src/value-objects/Money';
import { UniqueEntityID } from '../../../src/value-objects/UniqueEntityID';
import { HandoverDeadlines } from '../../../src/value-objects/HandoverDeadlines';
import { ForbiddenError, InvalidStateError, NotFoundError } from '../../../src/errors/DomainError';
import {
    IContractRepository,
    IListingRepository,
    IOperationRepository,
    IReportRepository,
    IUserRepository,
} from '../../../src/ports/Repositories';
import { GetOperationDetailsUseCase } from '../../../src/use-cases/operation/GetOperationDetailsUseCase';
import { INotifier } from '../../../src/ports/INotifier';
import { NegotiationNotifier } from '../../../src/services/NegotiationNotifier';
import { YouTubeStrategy } from '../../../src/strategies/YouTubeStrategy';
import { WebStrategy } from '../../../src/strategies/WebStrategy';
import {
    AcceptInvitationUseCase,
    ConfirmAssetReceiptUseCase,
    DeemAssetReceivedUseCase,
    MakeBuyerOwnerUseCase,
    MarkBuyerInvitedUseCase,
} from '../../../src/use-cases/operation/AssetDeliveryUseCases';
import { UserRole } from '@marketplace/shared-types';

/**
 * La entrega de un canal (S2a): la plataforma invita al comprador a la cuenta
 * de marca, el comprador acepta, a los 7 días la plataforma lo hace
 * propietario principal —eso es la entrega—, y el comprador confirma la
 * recepción en 3 días o se da por recibido. Un reclamo frena ese silencio.
 */

const DAY = 24 * 60 * 60 * 1000;
const BUYER = new UniqueEntityID();
const SELLER = new UniqueEntityID();
const ADMIN = new UniqueEntityID();
const INVITED = new Date('2026-10-28T12:00:00Z');
const ACCEPTED = new Date('2026-10-29T12:00:00Z');
const OWNER_FROM = new Date(ACCEPTED.getTime() + 7 * DAY);
const DELIVERED = new Date(OWNER_FROM.getTime() + 60 * 60 * 1000);
const RECEIPT_DEADLINE = new Date(DELIVERED.getTime() + 3 * DAY);

const buyerActor = { id: BUYER.toString(), role: UserRole.BUYER };
const sellerActor = { id: SELLER.toString(), role: UserRole.SELLER };
const adminActor = { id: ADMIN.toString(), role: UserRole.ADMIN };

function pagada(conDestino = true): Operation {
    const op = Operation.create({
        listingId: new UniqueEntityID(),
        buyerId: BUYER,
        sellerId: SELLER,
        offerPrice: Money.fromCents(1_500_000, 'USD'),
    });
    op.acceptCurrentOffer('seller');
    op.signContract();
    op.initiateTransfer({ declaredBy: SELLER, controlCeded: true });
    op.confirmAssetCustody({ verifiedBy: ADMIN, isPrimaryOwner: true, accessSecured: true, metrics: {} });
    op.confirmBuyerPayment({
        provider: 'transferencia',
        method: 'transferencia_bancaria',
        amountCents: op.buyerPays!.getCents(),
        currency: op.buyerPays!.getCurrency(),
    });
    if (conDestino) op.declareRecipientIdentity('comprador@gmail.com', BUYER.toString());
    return op;
}

function enCustodia(): Operation {
    const op = Operation.create({
        listingId: new UniqueEntityID(),
        buyerId: BUYER,
        sellerId: SELLER,
        offerPrice: Money.fromCents(1_500_000, 'USD'),
    });
    op.acceptCurrentOffer('seller');
    op.signContract();
    op.initiateTransfer({ declaredBy: SELLER, controlCeded: true });
    op.confirmAssetCustody({ verifiedBy: ADMIN, isPrimaryOwner: true, accessSecured: true, metrics: {} });
    op.declareRecipientIdentity('comprador@gmail.com', BUYER.toString());
    return op;
}

function invitada(): Operation {
    const op = pagada();
    op.markBuyerInvited(INVITED);
    return op;
}

function aceptada(): Operation {
    const op = invitada();
    op.acceptInvitation(BUYER.toString(), ACCEPTED);
    return op;
}

function entregada(): Operation {
    const op = aceptada();
    op.makeBuyerOwner(DELIVERED);
    return op;
}

describe('Operation.markBuyerInvited', () => {
    it('con el pago confirmado y el destino declarado, guarda cuándo se invitó al comprador', () => {
        const op = invitada();

        expect(op.milestones.buyerInvitedAt).toEqual(INVITED);
        expect(op.status).toBe('payment_received');
    });

    it('sin el pago confirmado no se invita', () => {
        expect(() => enCustodia().markBuyerInvited(INVITED)).toThrow(InvalidStateError);
        expect(() => enCustodia().markBuyerInvited(INVITED)).toThrow('La invitación al comprador es con el pago confirmado.');
    });

    it('sin el destino declarado no se invita', () => {
        expect(() => pagada(false).markBuyerInvited(INVITED)).toThrow(
            'El comprador todavía no declaró la cuenta de Google donde quiere recibir el canal.',
        );
    });

    it('no se invita dos veces', () => {
        expect(() => invitada().markBuyerInvited(INVITED)).toThrow('El comprador ya está invitado.');
    });
});

describe('Operation.acceptInvitation', () => {
    it('el comprador declara que aceptó: desde ahí corren los 7 días de Google', () => {
        const op = aceptada();

        expect(op.milestones.invitationAcceptedAt).toEqual(ACCEPTED);
        expect(op.buyerOwnershipFrom()).toEqual(OWNER_FROM);
    });

    it('solo el comprador', () => {
        expect(() => invitada().acceptInvitation(SELLER.toString(), ACCEPTED)).toThrow(ForbiddenError);
    });

    it('sin invitación no hay nada que aceptar', () => {
        expect(() => pagada().acceptInvitation(BUYER.toString(), ACCEPTED)).toThrow(InvalidStateError);
        expect(() => pagada().acceptInvitation(BUYER.toString(), ACCEPTED)).toThrow('Todavía no te invitamos al canal.');
    });

    it('no se acepta dos veces', () => {
        expect(() => aceptada().acceptInvitation(BUYER.toString(), ACCEPTED)).toThrow('Ya aceptaste la invitación.');
    });

    it('sin aceptar, no hay fecha para hacerlo propietario', () => {
        expect(invitada().buyerOwnershipFrom()).toBeUndefined();
    });
});

describe('Operation.makeBuyerOwner', () => {
    it('cumplidos los 7 días, es la entrega: guarda la fecha y ancla los 3 días del comprador', () => {
        const op = entregada();

        expect(op.milestones.deliveredAt).toEqual(DELIVERED);
        expect(op.assetReceiptDeadline()).toEqual(RECEIPT_DEADLINE);
    });

    it('justo a los 7 días ya se puede', () => {
        const op = aceptada();
        op.makeBuyerOwner(OWNER_FROM);

        expect(op.milestones.deliveredAt).toEqual(OWNER_FROM);
    });

    it('antes de los 7 días no se puede, y dice desde cuándo', () => {
        const op = aceptada();

        expect(() => op.makeBuyerOwner(new Date(OWNER_FROM.getTime() - 1))).toThrow(InvalidStateError);
        expect(() => op.makeBuyerOwner(new Date(OWNER_FROM.getTime() - 1))).toThrow(
            'Google permite hacer propietario principal al comprador desde el 5/11/2026.',
        );
        expect(op.milestones.deliveredAt).toBeUndefined();
    });

    it('sin la invitación aceptada no se puede', () => {
        expect(() => invitada().makeBuyerOwner(DELIVERED)).toThrow('El comprador todavía no aceptó la invitación.');
    });

    it('no se entrega dos veces', () => {
        expect(() => entregada().makeBuyerOwner(DELIVERED)).toThrow('El comprador ya es propietario principal.');
    });
});

describe('Operation.confirmAssetReceipt', () => {
    it('el comprador confirma la recepción', () => {
        const op = entregada();
        const at = new Date(DELIVERED.getTime() + DAY);
        op.confirmAssetReceipt(BUYER.toString(), at);

        expect(op.milestones.receivedAt).toEqual(at);
        expect(op.receivedBySilence).toBe(false);
    });

    it('solo el comprador', () => {
        expect(() => entregada().confirmAssetReceipt(SELLER.toString(), DELIVERED)).toThrow(ForbiddenError);
    });

    it('sin la entrega no hay nada que confirmar', () => {
        expect(() => aceptada().confirmAssetReceipt(BUYER.toString(), DELIVERED)).toThrow(
            'Todavía no sos propietario principal del canal.',
        );
    });

    it('no se confirma dos veces', () => {
        const op = entregada();
        op.confirmAssetReceipt(BUYER.toString(), DELIVERED);

        expect(() => op.confirmAssetReceipt(BUYER.toString(), DELIVERED)).toThrow('La recepción ya está confirmada.');
    });
});

describe('Operation.deemAssetReceived', () => {
    it('vencidos los 3 días sin respuesta, se da por recibido', () => {
        const op = entregada();

        expect(op.deemAssetReceived(RECEIPT_DEADLINE)).toBe(true);
        expect(op.milestones.receivedAt).toEqual(RECEIPT_DEADLINE);
        expect(op.receivedBySilence).toBe(true);
    });

    it('antes del plazo no cambia nada', () => {
        const op = entregada();

        expect(op.deemAssetReceived(new Date(RECEIPT_DEADLINE.getTime() - 1))).toBe(false);
        expect(op.milestones.receivedAt).toBeUndefined();
    });

    it('sin entrega, o ya recibido, no cambia nada', () => {
        const recibida = entregada();
        recibida.confirmAssetReceipt(BUYER.toString(), DELIVERED);

        expect(aceptada().deemAssetReceived(RECEIPT_DEADLINE)).toBe(false);
        expect(recibida.deemAssetReceived(RECEIPT_DEADLINE)).toBe(false);
        expect(recibida.receivedBySilence).toBe(false);
    });
});

// ── Casos de uso ─────────────────────────────────────────

function repoCon(...ops: Operation[]) {
    const store = new Map(ops.map((o) => [o.id.toString(), o]));
    const repo: IOperationRepository = {
        findById: vi.fn(async (id: string) => store.get(id) ?? null),
        findByListing: vi.fn(),
        findByParty: vi.fn(),
        findByStatuses: vi.fn(async () => [...store.values()].filter((o) => o.status === 'payment_received')),
        save: vi.fn(async () => {}),
    };
    return repo;
}

function avisosFalsos() {
    const notify = vi.fn(async (_n: Notification[]) => {});
    const notifier: INotifier = { notify };
    return { avisos: new NegotiationNotifier(notifier), notify };
}

function enviados(notify: ReturnType<typeof avisosFalsos>['notify']) {
    return notify.mock.calls.flatMap(([ns]) =>
        ns.map((n) => {
            const { props } = n.toSnapshot();
            return { userId: props.userId.toString(), type: props.type, occursAt: props.occursAt };
        }),
    );
}

function listingRepoCon(strategy: 'youtube' | 'web'): IListingRepository {
    const listing = Listing.create({
        sellerId: SELLER,
        assetStrategy:
            strategy === 'youtube'
                ? new YouTubeStrategy({ monthlyRevenueUsd: Money.fromCents(50000, 'USD'), subscribers: 10000, isMonetized: true })
                : new WebStrategy({ monthlyRevenueUsd: Money.fromCents(50000, 'USD'), domain: 'ejemplo.com' }),
        askingPrice: Money.fromCents(1_000_000, 'USD'),
    });
    return {
        findById: vi.fn().mockResolvedValue(listing),
        findPublished: vi.fn().mockResolvedValue([]),
        findBySeller: vi.fn().mockResolvedValue([]),
        findByStatus: vi.fn().mockResolvedValue([]),
        findHeldBy: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
    };
}

function reportsCon(...reports: Report[]): IReportRepository {
    return {
        findById: vi.fn(),
        findByUser: vi.fn(),
        findByOperation: vi.fn(async (id: string) => reports.filter((r) => r.operationId.toString() === id)),
        findOpen: vi.fn(),
        save: vi.fn(),
    };
}

function reclamo(op: Operation, reason: Report['reason'] = 'activo_no_entregado'): Report {
    return Report.create({
        operationId: op.id,
        reportedBy: BUYER,
        reporterRole: 'buyer',
        reportedUserId: SELLER,
        reason,
        detail: 'No soy propietario principal del canal todavía.',
    });
}

describe('MarkBuyerInvitedUseCase', () => {
    it('el admin marca la invitación, se guarda y se le avisa al comprador', async () => {
        const op = pagada();
        const repo = repoCon(op);
        const { avisos, notify } = avisosFalsos();

        await new MarkBuyerInvitedUseCase(repo, listingRepoCon('youtube'), avisos, () => INVITED).execute(op.id.toString(), adminActor);

        expect(op.milestones.buyerInvitedAt).toEqual(INVITED);
        expect(repo.save).toHaveBeenCalledWith(op);
        expect(enviados(notify)).toEqual([{ userId: BUYER.toString(), type: 'invitacion_enviada', occursAt: undefined }]);
    });

    it('solo un admin', async () => {
        const op = pagada();
        const repo = repoCon(op);

        await expect(
            new MarkBuyerInvitedUseCase(repo, listingRepoCon('youtube')).execute(op.id.toString(), sellerActor),
        ).rejects.toThrow(ForbiddenError);
        expect(repo.save).not.toHaveBeenCalled();
    });

    it('un sitio no se entrega por invitación', async () => {
        const op = pagada();
        const repo = repoCon(op);

        await expect(
            new MarkBuyerInvitedUseCase(repo, listingRepoCon('web')).execute(op.id.toString(), adminActor),
        ).rejects.toThrow('Solo un canal se entrega con una invitación a la cuenta de marca.');
        expect(repo.save).not.toHaveBeenCalled();
    });

    it('una operación inexistente es NotFoundError', async () => {
        const op = pagada();
        await expect(
            new MarkBuyerInvitedUseCase(repoCon(), listingRepoCon('youtube')).execute('nada', adminActor),
        ).rejects.toThrow(NotFoundError);
    });
});

describe('AcceptInvitationUseCase', () => {
    it('el comprador acepta y se guarda', async () => {
        const op = invitada();
        const repo = repoCon(op);

        await new AcceptInvitationUseCase(repo, () => ACCEPTED).execute(op.id.toString(), buyerActor);

        expect(op.milestones.invitationAcceptedAt).toEqual(ACCEPTED);
        expect(repo.save).toHaveBeenCalledWith(op);
    });

    it('ni el vendedor ni un admin aceptan por el comprador', async () => {
        const op = invitada();
        const repo = repoCon(op);

        await expect(new AcceptInvitationUseCase(repo).execute(op.id.toString(), sellerActor)).rejects.toThrow(ForbiddenError);
        await expect(new AcceptInvitationUseCase(repo).execute(op.id.toString(), adminActor)).rejects.toThrow(ForbiddenError);
        expect(repo.save).not.toHaveBeenCalled();
    });
});

describe('MakeBuyerOwnerUseCase', () => {
    it('el admin lo hace propietario: se guarda la entrega y se le avisa al comprador con su plazo', async () => {
        const op = aceptada();
        const repo = repoCon(op);
        const { avisos, notify } = avisosFalsos();

        await new MakeBuyerOwnerUseCase(repo, avisos, new HandoverDeadlines(), () => DELIVERED).execute(op.id.toString(), adminActor);

        expect(op.milestones.deliveredAt).toEqual(DELIVERED);
        expect(repo.save).toHaveBeenCalledWith(op);
        expect(enviados(notify)).toEqual([{ userId: BUYER.toString(), type: 'recepcion_pendiente', occursAt: RECEIPT_DEADLINE }]);
    });

    it('antes de los 7 días es InvalidStateError y no guarda', async () => {
        const op = aceptada();
        const repo = repoCon(op);

        await expect(
            new MakeBuyerOwnerUseCase(repo, undefined, new HandoverDeadlines(), () => ACCEPTED).execute(op.id.toString(), adminActor),
        ).rejects.toThrow(InvalidStateError);
        expect(repo.save).not.toHaveBeenCalled();
    });

    it('solo un admin', async () => {
        const op = aceptada();
        await expect(
            new MakeBuyerOwnerUseCase(repoCon(op), undefined, new HandoverDeadlines(), () => DELIVERED).execute(op.id.toString(), buyerActor),
        ).rejects.toThrow(ForbiddenError);
    });
});

describe('ConfirmAssetReceiptUseCase', () => {
    it('el comprador confirma: se guarda y se les avisa a las dos partes', async () => {
        const op = entregada();
        const repo = repoCon(op);
        const { avisos, notify } = avisosFalsos();
        const at = new Date(DELIVERED.getTime() + DAY);

        await new ConfirmAssetReceiptUseCase(repo, avisos, () => at).execute(op.id.toString(), buyerActor);

        expect(op.milestones.receivedAt).toEqual(at);
        expect(repo.save).toHaveBeenCalledWith(op);
        expect(enviados(notify)).toEqual([
            { userId: BUYER.toString(), type: 'activo_recibido', occursAt: undefined },
            { userId: SELLER.toString(), type: 'activo_recibido', occursAt: undefined },
        ]);
    });

    it('el vendedor no confirma por el comprador', async () => {
        const op = entregada();
        await expect(new ConfirmAssetReceiptUseCase(repoCon(op)).execute(op.id.toString(), sellerActor)).rejects.toThrow(ForbiddenError);
    });
});

describe('DeemAssetReceivedUseCase — la corrida horaria', () => {
    it('vencido el plazo sin respuesta, lo da por recibido y les avisa a las dos partes', async () => {
        const op = entregada();
        const repo = repoCon(op);
        const { avisos, notify } = avisosFalsos();

        const summary = await new DeemAssetReceivedUseCase(repo, reportsCon(), avisos, () => RECEIPT_DEADLINE).execute();

        expect(summary).toEqual({ deemed: 1, frozen: 0, failed: 0 });
        expect(op.milestones.receivedAt).toEqual(RECEIPT_DEADLINE);
        expect(op.receivedBySilence).toBe(true);
        expect(repo.save).toHaveBeenCalledWith(op);
        expect(enviados(notify).map((n) => n.type)).toEqual(['activo_recibido', 'activo_recibido']);
    });

    it('antes del plazo no toca nada', async () => {
        const op = entregada();
        const repo = repoCon(op);

        const summary = await new DeemAssetReceivedUseCase(repo, reportsCon(), undefined, () => new Date(RECEIPT_DEADLINE.getTime() - 1)).execute();

        expect(summary).toEqual({ deemed: 0, frozen: 0, failed: 0 });
        expect(repo.save).not.toHaveBeenCalled();
    });

    it('un reclamo abierto por el activo no entregado frena el silencio', async () => {
        const op = entregada();
        const repo = repoCon(op);

        const summary = await new DeemAssetReceivedUseCase(repo, reportsCon(reclamo(op)), undefined, () => RECEIPT_DEADLINE).execute();

        expect(summary).toEqual({ deemed: 0, frozen: 1, failed: 0 });
        expect(op.milestones.receivedAt).toBeUndefined();
        expect(repo.save).not.toHaveBeenCalled();
    });

    it('un reclamo cerrado, o por otro motivo, no lo frena', async () => {
        const cerradaOp = entregada();
        const otroOp = entregada();
        const cerrado = reclamo(cerradaOp);
        cerrado.close('El comprador confirmó que ya es propietario.');
        const repo = repoCon(cerradaOp, otroOp);

        const summary = await new DeemAssetReceivedUseCase(
            repo,
            reportsCon(cerrado, reclamo(otroOp, 'metricas_falsas')),
            undefined,
            () => RECEIPT_DEADLINE,
        ).execute();

        expect(summary).toEqual({ deemed: 2, frozen: 0, failed: 0 });
    });

    it('vuelve a leer cada operación antes de decidir: si el comprador ya confirmó, no la pisa', async () => {
        const listada = entregada();
        const releida = Operation.reconstitute(listada.toSnapshot().props, listada.id, listada.createdAt);
        releida.confirmAssetReceipt(BUYER.toString(), DELIVERED);
        const repo = repoCon(listada);
        repo.findById = vi.fn(async () => releida);

        const summary = await new DeemAssetReceivedUseCase(repo, reportsCon(), undefined, () => RECEIPT_DEADLINE).execute();

        expect(summary).toEqual({ deemed: 0, frozen: 0, failed: 0 });
        expect(releida.receivedBySilence).toBe(false);
        expect(repo.save).not.toHaveBeenCalled();
    });

    it('una operación que falla no frena a las demás', async () => {
        const rota = entregada();
        const sana = entregada();
        const repo = repoCon(rota, sana);
        const save = vi.fn(async (o: Operation) => {
            if (o === rota) throw new Error('base caída');
        });
        repo.save = save;

        const summary = await new DeemAssetReceivedUseCase(repo, reportsCon(), undefined, () => RECEIPT_DEADLINE).execute();

        expect(summary).toEqual({ deemed: 1, frozen: 0, failed: 1 });
        expect(sana.receivedBySilence).toBe(true);
    });
});

describe('GetOperationDetailsUseCase — la entrega de un canal', () => {
    const contratos: IContractRepository = {
        findById: vi.fn().mockResolvedValue(null),
        findByOperation: vi.fn().mockResolvedValue([]),
        findByListingAndSigner: vi.fn().mockResolvedValue(null),
        findAllByListing: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
    };
    const usuarios: IUserRepository = {
        findById: vi.fn().mockResolvedValue(null),
        findByEmail: vi.fn().mockResolvedValue(null),
        findByRole: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
    };

    function detalle(op: Operation, now: Date) {
        return new GetOperationDetailsUseCase(
            repoCon(op),
            contratos,
            usuarios,
            listingRepoCon('youtube'),
            undefined,
            undefined,
            undefined,
            new HandoverDeadlines(),
            () => now,
        ).execute(op.id.toString(), buyerActor);
    }

    it('expone las fechas de la entrega y desde cuándo se lo puede hacer propietario', async () => {
        const vista = await detalle(aceptada(), ACCEPTED);

        expect(vista.assetDelivery).toEqual({
            buyerInvitedAt: INVITED,
            invitationAcceptedAt: ACCEPTED,
            ownerFrom: OWNER_FROM,
            receivedBySilence: false,
        });
        expect(vista.next.byRole.buyer).toEqual({ kind: 'wait', waitingOn: ['platform'], deadline: OWNER_FROM });
    });

    it('con el reloj pasado los 7 días, le toca a la plataforma', async () => {
        const vista = await detalle(aceptada(), OWNER_FROM);

        expect(vista.next.turn).toEqual(['platform']);
        expect(vista.next.byRole.platform).toMatchObject({ kind: 'act', id: 'make_buyer_owner' });
    });

    it('entregado, el plazo de la recepción', async () => {
        const vista = await detalle(entregada(), DELIVERED);

        expect(vista.assetDelivery).toMatchObject({ deliveredAt: DELIVERED, receiptDeadline: RECEIPT_DEADLINE });
    });

    it('sin invitación, no hay datos de entrega', async () => {
        expect((await detalle(pagada(), INVITED)).assetDelivery).toBeUndefined();
    });
});
