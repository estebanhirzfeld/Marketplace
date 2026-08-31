import { describe, it, expect } from 'vitest';
import { Operation } from '../src/entities/Operation';
import { Money } from '../src/value-objects/Money';
import { UniqueEntityID } from '../src/value-objects/UniqueEntityID';
import { InvalidStateError, ValidationError } from '../src/errors/DomainError';

/**
 * Convergencia de la negociación.
 *
 * Las contraofertas del comprador nunca bajan y las del vendedor nunca suben,
 * así el rango se cierra en cada paso.
 *
 * El motivo principal no es la equidad sino la terminación: `TIMEOUT` figura
 * en OperationMachine pero nadie lo implementa, así que sin monotonía dos
 * partes pueden oscilar para siempre y dejar el listing bloqueado.
 *
 * El caso del comprador que firma el NDA y descubre algo malo no se resuelve
 * acá: cancela y vuelve a ofertar. Es explícito y deja el historial viejo
 * intacto, en vez de un retroceso silencioso a mitad del ida y vuelta.
 */

const USD = (pesos: number) => Money.fromCents(pesos * 100, 'USD');

/** Arranca con la oferta inicial del comprador, así que el turno es del vendedor. */
function unaNegociacion(ofertaInicial = 10_000): Operation {
    return Operation.create({
        listingId: new UniqueEntityID(),
        buyerId: new UniqueEntityID(),
        sellerId: new UniqueEntityID(),
        offerPrice: USD(ofertaInicial),
    });
}

describe('Convergencia — el vendedor nunca sube', () => {
    it('su primera contraoferta puede ser cualquier monto por encima de la oferta', () => {
        const op = unaNegociacion();

        expect(() => op.counterOffer(USD(18_000), 'seller')).not.toThrow();
        expect(op.currentOfferPrice.getCents()).toBe(1_800_000);
    });

    /**
     * Igualar la oferta del comprador dejaba dos propuestas idénticas
     * enfrentadas y movía el turno sin que nada avanzara. Aceptar tiene su
     * propia acción y es la que corresponde.
     */
    it('rechaza que iguale la oferta del comprador', () => {
        const op = unaNegociacion(10_000);

        expect(() => op.counterOffer(USD(10_000), 'seller')).toThrow(InvalidStateError);
    });

    it('rechaza que pida menos de lo que ya le ofrecieron', () => {
        const op = unaNegociacion(10_000);

        expect(() => op.counterOffer(USD(9_000), 'seller')).toThrow(InvalidStateError);
    });

    it('al rechazar le dice que lo que corresponde es aceptar', () => {
        const op = unaNegociacion(10_000);

        expect(() => op.counterOffer(USD(10_000), 'seller')).toThrow(/aceptá la oferta/i);
    });

    it('la segunda tiene que ser menor que la suya anterior', () => {
        const op = unaNegociacion();
        op.counterOffer(USD(18_000), 'seller');
        op.counterOffer(USD(12_000), 'buyer');

        expect(() => op.counterOffer(USD(16_000), 'seller')).not.toThrow();
    });

    it('rechaza que suba respecto de su propia contraoferta anterior', () => {
        const op = unaNegociacion();
        op.counterOffer(USD(18_000), 'seller');
        op.counterOffer(USD(12_000), 'buyer');

        expect(() => op.counterOffer(USD(19_000), 'seller')).toThrow(InvalidStateError);
    });

    it('rechaza que repita el mismo monto', () => {
        const op = unaNegociacion();
        op.counterOffer(USD(18_000), 'seller');
        op.counterOffer(USD(12_000), 'buyer');

        // Repetir no aporta nada y solo alarga el ida y vuelta.
        expect(() => op.counterOffer(USD(18_000), 'seller')).toThrow(InvalidStateError);
    });
});

describe('Convergencia — el comprador nunca baja', () => {
    it('su contraoferta tiene que superar su oferta inicial', () => {
        const op = unaNegociacion(10_000);
        op.counterOffer(USD(18_000), 'seller');

        expect(() => op.counterOffer(USD(12_000), 'buyer')).not.toThrow();
    });

    it('rechaza que baje respecto de su oferta inicial', () => {
        const op = unaNegociacion(10_000);
        op.counterOffer(USD(18_000), 'seller');

        expect(() => op.counterOffer(USD(9_000), 'buyer')).toThrow(InvalidStateError);
    });

    it('rechaza que repita su oferta inicial', () => {
        const op = unaNegociacion(10_000);
        op.counterOffer(USD(18_000), 'seller');

        expect(() => op.counterOffer(USD(10_000), 'buyer')).toThrow(InvalidStateError);
    });

    it('rechaza que baje respecto de una contraoferta suya posterior', () => {
        const op = unaNegociacion(10_000);
        op.counterOffer(USD(18_000), 'seller');
        op.counterOffer(USD(14_000), 'buyer');
        op.counterOffer(USD(16_000), 'seller');

        expect(() => op.counterOffer(USD(13_000), 'buyer')).toThrow(InvalidStateError);
    });
});

describe('Convergencia — el rango se cierra', () => {
    it('una negociación completa termina con las partes más cerca', () => {
        const op = unaNegociacion(10_000);

        op.counterOffer(USD(18_000), 'seller');
        op.counterOffer(USD(13_000), 'buyer');
        op.counterOffer(USD(16_000), 'seller');
        op.counterOffer(USD(15_000), 'buyer');

        const montos = op.negotiations.map((n) => n.amount / 100);
        expect(montos).toEqual([10_000, 18_000, 13_000, 16_000, 15_000]);

        // Distancia inicial 8.000; final 1.000.
        expect(Math.abs(16_000 - 15_000)).toBeLessThan(Math.abs(18_000 - 10_000));
    });

    it('aceptar sigue tomando el precio que está sobre la mesa', () => {
        const op = unaNegociacion(10_000);
        op.counterOffer(USD(18_000), 'seller');
        op.counterOffer(USD(15_000), 'buyer');

        op.acceptCurrentOffer('seller');

        expect(op.finalPrice?.getCents()).toBe(1_500_000);
        expect(op.status).toBe('contract_pending');
    });
});

describe('Convergencia — moneda', () => {
    it('rechaza contraofertar en otra moneda', () => {
        const op = unaNegociacion(10_000);
        op.counterOffer(USD(18_000), 'seller');

        expect(() => op.counterOffer(Money.fromCents(1_200_000, 'ARS'), 'buyer'))
            .toThrow(ValidationError);
    });
});
