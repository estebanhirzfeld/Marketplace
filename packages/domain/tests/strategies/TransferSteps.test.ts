import { describe, it, expect } from 'vitest';
import { YouTubeStrategy } from '../../src/strategies/YouTubeStrategy';
import { WebStrategy } from '../../src/strategies/WebStrategy';
import { Money } from '../../src/value-objects/Money';

/**
 * `getTransferSteps(context?)` deja que la estrategia escriba la frase —es la
 * única que sabe cómo se dice el paso en su plataforma— y que quien la llama
 * aporte los identificadores concretos. Sin contexto, la variante genérica que
 * usa el catálogo antes de que exista ninguna operación.
 *
 * YouTube suma el paso que faltaba: salir de los permisos de canal de YouTube
 * Studio antes de invitar. Es el que rompe el traspaso con un error
 * incomprensible —la invitación parece funcionar y el cambio de propietario
 * principal falla sin explicar por qué.
 */

function youtube() {
    return new YouTubeStrategy({
        monthlyRevenueUsd: Money.fromCents(50000, 'USD'),
        subscribers: 10000,
        isMonetized: true,
    });
}

function web() {
    return new WebStrategy(Money.fromCents(210000, 'USD'), 52, 'ejemplo.com');
}

const mencionaPermisosDeCanal = (texto: string) =>
    /permisos de canal/i.test(texto);

describe('YouTubeStrategy.getTransferSteps sin contexto', () => {
    it('el paso de invitación a la plataforma es genérico y no nombra ninguna cuenta', () => {
        const pasos = youtube().getTransferSteps();
        const invitacion = pasos.find((p) => /invita a la plataforma/i.test(p.description));

        expect(invitacion).toBeDefined();
        expect(invitacion!.description).not.toContain('@');
    });

    it('incluye el paso de salir de los permisos de canal, con requiredActor seller', () => {
        const pasos = youtube().getTransferSteps();
        const optOut = pasos.find((p) => mencionaPermisosDeCanal(p.description));

        expect(optOut).toBeDefined();
        expect(optOut!.requiredActor).toBe('seller');
    });

    it('el opt-out aparece ANTES del paso de invitación a la plataforma', () => {
        const pasos = youtube().getTransferSteps();
        const iOptOut = pasos.findIndex((p) => mencionaPermisosDeCanal(p.description));
        const iInvitacion = pasos.findIndex((p) => /invita a la plataforma/i.test(p.description));

        expect(iOptOut).toBeGreaterThanOrEqual(0);
        expect(iOptOut).toBeLessThan(iInvitacion);
    });

    it('los id son posicionales y correlativos', () => {
        const pasos = youtube().getTransferSteps();
        expect(pasos.map((p) => p.id)).toEqual(pasos.map((_, i) => String(i + 1)));
    });
});

describe('YouTubeStrategy.getTransferSteps con contexto', () => {
    it('el identificador de custodia aparece en description e instruction del paso de invitación', () => {
        const pasos = youtube().getTransferSteps({ custodyAccountIdentifier: 'custodia1@gmail.com' });
        const invitacion = pasos.find((p) => /invita/i.test(p.description) && p.requiredActor === 'seller')!;

        expect(invitacion.description).toContain('custodia1@gmail.com');
        expect(invitacion.instruction).toContain('custodia1@gmail.com');
    });

    it('el identificador del comprador aparece en el paso en que se lo invita', () => {
        const pasos = youtube().getTransferSteps({ recipientIdentifier: 'comprador@gmail.com' });
        const invitacionComprador = pasos.find(
            (p) => p.requiredActor === 'platform' && /invita al comprador/i.test(p.description),
        )!;

        expect(invitacionComprador.description).toContain('comprador@gmail.com');
    });
});

describe('WebStrategy.getTransferSteps', () => {
    it('acepta contexto con o sin datos y devuelve su lista sin error', () => {
        expect(() => web().getTransferSteps()).not.toThrow();
        expect(() => web().getTransferSteps({ custodyAccountIdentifier: 'x@y.com' })).not.toThrow();
        expect(web().getTransferSteps().length).toBeGreaterThan(0);
    });

    it('ningún paso menciona permisos de canal', () => {
        const pasos = web().getTransferSteps();
        expect(pasos.some((p) => mencionaPermisosDeCanal(p.description))).toBe(false);
    });

    it('nombra el identificador del comprador en el paso de la transferencia de dominio', () => {
        const pasos = web().getTransferSteps({ recipientIdentifier: 'comprador@gmail.com' });
        const delComprador = pasos.find((p) => p.requiredActor === 'buyer')!;
        expect(delComprador.description).toContain('comprador@gmail.com');
    });
});
