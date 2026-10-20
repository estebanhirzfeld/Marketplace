import { describe, it, expect, vi } from 'vitest';
import { Notification } from '../src/entities/Notification';
import { UniqueEntityID } from '../src/value-objects/UniqueEntityID';
import { INotifier } from '../src/ports/INotifier';
import { NegotiationNotifier } from '../src/services/NegotiationNotifier';
import { Operation } from '../src/entities/Operation';
import { Money } from '../src/value-objects/Money';

/**
 * Los avisos existen porque la negociación tiene turnos y, sin ellos, saber
 * que te toca responder depende de entrar a mirar. Un marketplace donde nadie
 * se entera de nada está muerto aunque funcione.
 */

const BUYER = new UniqueEntityID();
const SELLER = new UniqueEntityID();

function unaOperacion(): Operation {
    return Operation.create({
        listingId: new UniqueEntityID(),
        buyerId: BUYER,
        sellerId: SELLER,
        offerPrice: Money.fromCents(1_000_000, 'USD'),
    });
}

describe('Notification', () => {
    it('nace sin leer', () => {
        const n = Notification.create({ userId: BUYER, type: 'oferta_recibida' });
        expect(n.isRead).toBe(false);
    });

    it('marcarla leída la deja leída', () => {
        const n = Notification.create({ userId: BUYER, type: 'oferta_recibida' });
        n.markAsRead();
        expect(n.isRead).toBe(true);
    });

    it('marcarla dos veces no rompe ni cambia la fecha', () => {
        const n = Notification.create({ userId: BUYER, type: 'oferta_recibida' });
        n.markAsRead();
        const primera = n.toSnapshot().props.readAt;

        n.markAsRead();

        expect(n.toSnapshot().props.readAt).toBe(primera);
    });

    /**
     * El texto se redacta en la vista. Guardar la redacción obligaría a migrar
     * la base para cambiar una palabra, y metería copy en el dominio.
     */
    it('no guarda el texto del mensaje', () => {
        const n = Notification.create({ userId: BUYER, type: 'oferta_recibida' });
        const claves = Object.keys(n.toSnapshot().props);

        expect(claves).not.toContain('message');
        expect(claves).not.toContain('title');
    });
});

describe('NegotiationNotifier', () => {
    function unNotificadorFalso(): INotifier & { enviadas: Notification[] } {
        const enviadas: Notification[] = [];
        return {
            enviadas,
            notify: vi.fn(async (ns: Notification[]) => {
                enviadas.push(...ns);
            }),
        };
    }

    it('una oferta nueva avisa al vendedor, no al comprador', async () => {
        const notifier = unNotificadorFalso();
        const op = unaOperacion();

        await new NegotiationNotifier(notifier).offerReceived(op);

        expect(notifier.enviadas).toHaveLength(1);
        expect(notifier.enviadas[0].userId.toString()).toBe(SELLER.toString());
        expect(notifier.enviadas[0].type).toBe('oferta_recibida');
    });

    it('una contraoferta avisa a quien tiene que responder', async () => {
        const notifier = unNotificadorFalso();
        const op = unaOperacion();
        op.counterOffer(Money.fromCents(1_800_000, 'USD'), 'seller');

        await new NegotiationNotifier(notifier).counterOfferMade(op);

        // Contraofertó el vendedor, así que le toca al comprador.
        expect(notifier.enviadas[0].userId.toString()).toBe(BUYER.toString());
    });

    /**
     * `contractSigned()` dejó de mandar `contrato_firmado` a las dos partes:
     * al vendedor le toca ceder el control, y ese aviso no puede seguir
     * enunciando su paso en voz pasiva.
     */
    it('al firmarse el contrato, el comprador recibe contrato_firmado y el vendedor cesion_pendiente', async () => {
        const notifier = unNotificadorFalso();
        const op = unaOperacion();

        await new NegotiationNotifier(notifier).contractSigned(op);

        expect(notifier.enviadas).toHaveLength(2);

        const paraComprador = notifier.enviadas.find((n) => n.userId.toString() === BUYER.toString());
        const paraVendedor = notifier.enviadas.find((n) => n.userId.toString() === SELLER.toString());

        expect(paraComprador?.type).toBe('contrato_firmado');
        expect(paraVendedor?.type).toBe('cesion_pendiente');
    });

    it('ninguna de las dos partes recibe el aviso de la otra', async () => {
        const notifier = unNotificadorFalso();
        const op = unaOperacion();

        await new NegotiationNotifier(notifier).contractSigned(op);

        const tiposDelComprador = notifier.enviadas
            .filter((n) => n.userId.toString() === BUYER.toString())
            .map((n) => n.type);
        const tiposDelVendedor = notifier.enviadas
            .filter((n) => n.userId.toString() === SELLER.toString())
            .map((n) => n.type);

        expect(tiposDelComprador).not.toContain('cesion_pendiente');
        expect(tiposDelVendedor).not.toContain('contrato_firmado');
    });

    /**
     * `contractSigned()` no recibe ni consulta ninguna estrategia de activo:
     * el aviso al vendedor sale igual sin importar si su tipo de activo
     * enumera algún paso posterior a la firma (el caso de un listing web).
     */
    it('el vendedor recibe cesion_pendiente aunque su estrategia no enumere ningún paso posterior a la firma', async () => {
        const notifier = unNotificadorFalso();
        const op = unaOperacion();

        await new NegotiationNotifier(notifier).contractSigned(op);

        expect(notifier.enviadas.some((n) => n.type === 'cesion_pendiente')).toBe(true);
    });

    it('aceptar avisa a la otra parte', async () => {
        const notifier = unNotificadorFalso();
        const op = unaOperacion();
        op.acceptCurrentOffer('seller');

        await new NegotiationNotifier(notifier).offerAccepted(op, 'seller');

        expect(notifier.enviadas[0].userId.toString()).toBe(BUYER.toString());
        expect(notifier.enviadas[0].type).toBe('oferta_aceptada');
    });

    /**
     * La cascada híbrida cancela las ofertas rivales. Sin aviso, esos
     * compradores quedan esperando una respuesta que nunca va a llegar.
     */
    it('la cascada avisa a cada comprador rival', async () => {
        const notifier = unNotificadorFalso();
        const rivales = [unaOperacion(), unaOperacion(), unaOperacion()];
        rivales.forEach((op) => op.cancel());

        await new NegotiationNotifier(notifier).offersCancelledByCascade(rivales);

        expect(notifier.enviadas).toHaveLength(3);
        expect(notifier.enviadas.every((n) => n.type === 'oferta_cancelada')).toBe(true);
    });

    it('sin rivales no manda nada', async () => {
        const notifier = unNotificadorFalso();

        await new NegotiationNotifier(notifier).offersCancelledByCascade([]);

        expect(notifier.notify).not.toHaveBeenCalled();
    });

    /**
     * Que un aviso falle no puede tumbar la venta que lo originó.
     */
    it('un notificador que falla no propaga el error', async () => {
        const roto: INotifier = {
            notify: vi.fn().mockRejectedValue(new Error('SMTP caído')),
        };

        await expect(
            new NegotiationNotifier(roto).offerReceived(unaOperacion()),
        ).resolves.toBeUndefined();
    });
});
