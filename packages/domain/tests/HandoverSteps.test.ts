import { describe, it, expect } from 'vitest';
import { Listing } from '../src/entities/Listing';
import { Money } from '../src/value-objects/Money';
import { UniqueEntityID } from '../src/value-objects/UniqueEntityID';
import { YouTubeStrategy } from '../src/strategies/YouTubeStrategy';
import { WebStrategy } from '../src/strategies/WebStrategy';
import { IAssetStrategy, TransferContext, TransferStage } from '../src/strategies/IAssetStrategy';

/**
 * Todo paso del traspaso dice quién lo hace, cómo se comprueba y en qué etapa
 * está, y si lo hace una persona, qué tiene que hacer. Antes la etapa se
 * deducía de un `phase` que solo tenían los pasos del vendedor, y los del
 * comprador de un canal no se mostraban nunca.
 */

const STAGE_ORDER: readonly TransferStage[] = ['listing', 'custody', 'payment', 'delivery', 'closing'];

const STRATEGIES: [string, IAssetStrategy][] = [
    [
        'canal de YouTube',
        new YouTubeStrategy({ monthlyRevenueUsd: Money.fromCents(50000, 'USD'), subscribers: 10000, isMonetized: true }),
    ],
    ['sitio', new WebStrategy({ monthlyRevenueUsd: Money.fromCents(120000, 'USD'), domain: 'ejemplo.com' })],
];

const CONTEXTS: [string, TransferContext | undefined][] = [
    ['sin contexto', undefined],
    ['con cuentas', { custodyAccountIdentifier: 'custodia@traspaso.com', recipientIdentifier: 'comprador@correo.com' }],
];

function listingOf(strategy: IAssetStrategy): Listing {
    return Listing.create({
        sellerId: new UniqueEntityID(),
        assetStrategy: strategy,
        askingPrice: Money.fromCents(1_000_000, 'USD'),
    });
}

describe.each(STRATEGIES)('los pasos de un %s', (_name, strategy) => {
    it.each(CONTEXTS)('%s, cada paso tiene dueño, comprobación y etapa', (_c, context) => {
        for (const step of strategy.getTransferSteps(context)) {
            expect(step.requiredActor, step.key).toBeDefined();
            expect(step.check, step.key).toBeDefined();
            expect(STAGE_ORDER, step.key).toContain(step.stage);
        }
    });

    it.each(CONTEXTS)('%s, cada paso que hace una persona tiene instrucción', (_c, context) => {
        for (const step of strategy.getTransferSteps(context)) {
            if (step.requiredActor === 'platform' || step.check === 'automatic') continue;
            expect(step.instruction?.trim(), step.key).toBeTruthy();
        }
    });

    it('handoverSteps devuelve todos los pasos, ordenados por etapa', () => {
        const steps = listingOf(strategy).handoverSteps();

        expect(steps.map((s) => s.key).sort()).toEqual(strategy.getTransferSteps().map((s) => s.key).sort());
        const stages = steps.map((s) => STAGE_ORDER.indexOf(s.stage));
        expect(stages).toEqual([...stages].sort((a, b) => a - b));
    });

    it('la fase que ven las pantallas sale de la etapa', () => {
        for (const step of listingOf(strategy).handoverSteps()) {
            expect(step.phase, step.key).toBe(step.stage === 'listing' ? 'listing' : 'operation');
            expect(step.afterPlatformStarts, step.key).toBe(step.phase === 'operation');
        }
    });
});

describe('el comprador de un canal tiene sus pasos', () => {
    it('pagar, aceptar la invitación y asegurar sus accesos', () => {
        const [, youtube] = STRATEGIES[0];
        const buyer = listingOf(youtube)
            .handoverSteps()
            .filter((s) => s.requiredActor === 'buyer')
            .map((s) => s.key);

        expect(buyer).toEqual(['buyer-pays', 'buyer-accepts', 'buyer-secures-access']);
    });

    it('la entrega: la plataforma invita, el comprador acepta, la plataforma lo hace propietario y el comprador confirma', () => {
        const [, youtube] = STRATEGIES[0];
        const delivery = youtube.getTransferSteps().filter((s) => s.stage === 'delivery');

        expect(delivery.map((s) => [s.key, s.requiredActor])).toEqual([
            ['invite-buyer', 'platform'],
            ['buyer-accepts', 'buyer'],
            ['make-buyer-owner', 'platform'],
            ['buyer-secures-access', 'buyer'],
        ]);
        const receipt = delivery[3];
        expect(receipt.title).toBe('Confirmá la recepción');
        expect(receipt.instruction).toBe(
            'Comprobá que sos propietario principal, que el vendedor ya no figura en los permisos y que los mails y teléfonos de recuperación son tuyos.',
        );
    });
});

/*
 * Las pantallas de hoy muestran los pasos del vendedor de una fase. Mientras
 * la página de la operación no se rehaga, `sellerSteps` tiene que devolver
 * exactamente lo mismo que el filtro viejo por `phase`.
 */
describe('Listing.sellerSteps', () => {
    it('antes de la venta, los del vendedor de la publicación', () => {
        expect(listingOf(STRATEGIES[0][1]).sellerSteps(undefined, 'listing').map((s) => s.key)).toEqual([
            'brand-account',
            'invite-platform',
        ]);
        expect(listingOf(STRATEGIES[1][1]).sellerSteps(undefined, 'listing').map((s) => s.key)).toEqual([
            'domain-at-hostinger',
        ]);
    });

    it('con la venta firmada, los del vendedor de la operación', () => {
        expect(listingOf(STRATEGIES[0][1]).sellerSteps(undefined, 'operation').map((s) => s.key)).toEqual([
            'leave-channel-permissions',
            'promote-platform-owner',
        ]);
        expect(listingOf(STRATEGIES[1][1]).sellerSteps(undefined, 'operation').map((s) => s.key)).toEqual([
            'domain-to-platform',
            'hosting',
            'code',
            'accounts',
        ]);
    });
});
