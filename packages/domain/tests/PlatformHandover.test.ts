import { describe, it, expect } from 'vitest';
import { Listing } from '../src/entities/Listing';
import { YouTubeStrategy } from '../src/strategies/YouTubeStrategy';
import { WebStrategy } from '../src/strategies/WebStrategy';
import { Money } from '../src/value-objects/Money';
import { UniqueEntityID } from '../src/value-objects/UniqueEntityID';
import { ValidationError } from '../src/errors/DomainError';

/*
 * Qué tiene que hacer el vendedor para cedernos el activo.
 *
 * La lista completa de traspaso describe el recorrido entero, incluido lo que
 * pasa después de la venta. Lo que el vendedor necesita ver mientras publica
 * es solo el tramo del principio: lo que le toca a él antes de que intervenga
 * nadie más. Cumplirlo es lo que arranca el plazo y lo que después deja al
 * activo marcado como de transferencia inmediata.
 */

function youtubeListing() {
    return Listing.create({
        sellerId: new UniqueEntityID(),
        assetStrategy: new YouTubeStrategy({
            monthlyRevenueUsd: Money.fromCents(50000, 'USD'),
            subscribers: 10000,
            growthFactor: 1.2,
            isMonetized: true,
        }),
        askingPrice: Money.fromCents(1000000, 'USD'),
    });
}

function webListing() {
    return Listing.create({
        sellerId: new UniqueEntityID(),
        assetStrategy: new WebStrategy(Money.fromCents(210000, 'USD'), 52, 'ejemplo.com'),
        askingPrice: Money.fromCents(6800000, 'USD'),
    });
}

describe('Listing.handoverSteps', () => {
    it('debería devolver lo que le toca al vendedor de un canal antes de que entremos nosotros', () => {
        const pasos = youtubeListing().handoverSteps();

        // Convertir a Cuenta de Marca, salir de los permisos de canal, invitar.
        expect(pasos).toHaveLength(3);
        expect(pasos[0].description).toContain('Cuenta de Marca');
        expect(pasos[1].description).toMatch(/permisos de canal/i);
        expect(pasos[2].description).toContain('invita a');
    });

    it('reenvía el contexto a la estrategia: el paso de invitación nombra la cuenta de custodia', () => {
        const pasos = youtubeListing().handoverSteps({ custodyAccountIdentifier: 'custodia1@gmail.com' });
        expect(pasos.some((p) => p.description.includes('custodia1@gmail.com'))).toBe(true);
    });

    it('debería devolver el único paso del vendedor de un sitio web', () => {
        const pasos = webListing().handoverSteps();

        expect(pasos).toHaveLength(1);
        expect(pasos[0].description).toContain('EPP');
    });

    it('no debería incluir pasos de otras partes', () => {
        for (const listing of [youtubeListing(), webListing()]) {
            expect(listing.handoverSteps().every((p) => p.requiredActor === 'seller')).toBe(true);
        }
    });

    it('exige la cuenta de custodia al registrar el acceso', () => {
        const listing = youtubeListing();
        expect(() =>
            listing.registerPlatformAccess({
                verifiedBy: new UniqueEntityID(),
                accessSince: new Date(),
            } as never),
        ).toThrow(ValidationError);
    });

    it('revokePlatformAccess deja la constancia y su custodyAccountId en nulo', () => {
        const listing = youtubeListing();
        listing.registerPlatformAccess({
            verifiedBy: new UniqueEntityID(),
            custodyAccountId: new UniqueEntityID(),
            accessSince: new Date(),
        });
        expect(listing.platformAccess?.custodyAccountId).toBeDefined();

        listing.revokePlatformAccess();
        expect(listing.platformAccess).toBeUndefined();
    });

    it('debería cortar en cuanto interviene otra parte, no filtrar toda la lista', () => {
        // Un sitio web tiene pasos del vendedor DESPUÉS del comprador (migrar
        // hosting, ceder AdSense). Esos son parte de la venta, no de la cesión
        // a la plataforma: filtrar por rol en vez de cortar los incluiría y le
        // pediría al vendedor cosas que todavía no corresponden.
        const listing = webListing();
        const delVendedor = listing
            .toSnapshot()
            .props.assetStrategy.getTransferSteps()
            .filter((p) => p.requiredActor === 'seller');

        expect(delVendedor.length).toBeGreaterThan(listing.handoverSteps().length);
    });
});
