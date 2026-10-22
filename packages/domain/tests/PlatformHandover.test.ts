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
        assetStrategy: new WebStrategy({ monthlyRevenueUsd: Money.fromCents(210000, 'USD'), domain: 'ejemplo.com' }),
        askingPrice: Money.fromCents(6800000, 'USD'),
    });
}

describe('Listing.sellerSteps de un sitio', () => {
    it('en la fase de operación entrega los pasos del traslado del dominio, con su clave', () => {
        const pasos = webListing().sellerSteps(undefined, 'operation');

        expect(pasos.map((p) => p.key)).toContain('domain-to-platform');
        expect(pasos.every((p) => p.afterPlatformStarts)).toBe(true);
    });
});

describe('Listing.sellerSteps', () => {
    it('antes de la venta le pide al vendedor solo la cuenta de marca y la invitación', () => {
        const pasos = youtubeListing().sellerSteps();

        expect(pasos).toHaveLength(2);
        expect(pasos[0].title).toBe('Pasá tu canal a una cuenta de marca');
        expect(pasos[1].title).toBe('Invitanos como administrador');
        expect(pasos.every((p) => p.phase === 'listing')).toBe(true);
    });

    it('no adelanta ni el acceso directo ni el propietario principal ni la mecánica de los 7 días', () => {
        const texto = youtubeListing()
            .sellerSteps()
            .map((p) => `${p.description} ${p.instruction ?? ''} ${(p.details ?? []).join(' ')}`)
            .join(' ');

        expect(texto).not.toMatch(/propietari[oa] principal/i);
        expect(texto).not.toMatch(/permisos de canal/i);
        expect(texto).not.toMatch(/7 días|siete días/i);
    });

    it('en la operación le pide quitar su acceso directo y hacernos propietarios principales', () => {
        const pasos = youtubeListing().sellerSteps(undefined, 'operation');

        expect(pasos).toHaveLength(2);
        expect(pasos[0].title).toBe('Quitá tu acceso directo al canal');
        expect(pasos[1].title).toBe('Hacenos propietario principal');
        expect(pasos.every((p) => p.phase === 'operation' && p.afterPlatformStarts)).toBe(true);
    });

    it('los pasos de antes de la venta no marcan afterPlatformStarts', () => {
        expect(youtubeListing().sellerSteps().every((p) => !p.afterPlatformStarts)).toBe(true);
    });

    it('pide administrador y no propietario, y dice qué no podemos hacer', () => {
        const invitacion = youtubeListing().sellerSteps()[1];

        expect(invitacion.description).toMatch(/administrador/i);
        expect(invitacion.description).not.toMatch(/como propietari/i);
        // La promesa va en negativo: el vendedor la puede verificar en la
        // interfaz de Google en vez de tener que creernos.
        expect(`${invitacion.instruction} ${(invitacion.details ?? []).join(' ')}`).toMatch(/no puede/i);
    });

    it('reenvía el contexto a la estrategia: el paso de invitación nombra la cuenta de custodia', () => {
        const pasos = youtubeListing().sellerSteps({ custodyAccountIdentifier: 'custodia1@gmail.com' });
        expect(pasos.some((p) => p.description.includes('custodia1@gmail.com'))).toBe(true);
    });

    it('debería devolver lo que le toca al vendedor de un sitio antes de cederlo', () => {
        const pasos = webListing().sellerSteps();

        // Antes de la venta solo se le pide tener el dominio en Hostinger. El
        // traslado a la plataforma, el hosting, el código y las cuentas son
        // de la operación y se le piden recién con el contrato firmado.
        expect(pasos).toHaveLength(1);
        expect(pasos[0].key).toBe('domain-at-hostinger');
        expect(pasos[0].description).toContain('Hostinger');
        expect(pasos.every((p) => p.phase === 'listing')).toBe(true);
        expect(webListing().sellerSteps(undefined, 'operation').map((p) => p.key)).toEqual([
            'domain-to-platform',
            'hosting',
            'code',
            'accounts',
        ]);
    });

    it('no debería incluir pasos de otras partes', () => {
        for (const listing of [youtubeListing(), webListing()]) {
            expect(listing.sellerSteps().every((p) => p.requiredActor === 'seller')).toBe(true);
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
            heldRole: 'manager',
            accessSince: new Date(),
        });
        expect(listing.platformAccess?.custodyAccountId).toBeDefined();

        listing.revokePlatformAccess();
        expect(listing.platformAccess).toBeUndefined();
    });

    it('debería cortar donde entra el comprador, no filtrar toda la lista', () => {
        // Un sitio web tiene pasos del vendedor DESPUÉS del comprador (migrar
        // hosting, ceder AdSense). Esos son parte de la entrega al comprador,
        // no de la cesión a la plataforma: filtrar por rol los incluiría y le
        // pediría al vendedor cosas que todavía no corresponden.
        const listing = webListing();
        const delVendedor = listing
            .toSnapshot()
            .props.assetStrategy.getTransferSteps()
            .filter((p) => p.requiredActor === 'seller');

        expect(delVendedor.length).toBeGreaterThan(listing.sellerSteps().length);
    });

    it('exige el rol al registrar el acceso', () => {
        const listing = youtubeListing();
        expect(() =>
            listing.registerPlatformAccess({
                verifiedBy: new UniqueEntityID(),
                custodyAccountId: new UniqueEntityID(),
                accessSince: new Date(),
            } as never),
        ).toThrow(ValidationError);
    });

    it('guarda con qué rol quedó la plataforma', () => {
        const listing = youtubeListing();
        listing.registerPlatformAccess({
            verifiedBy: new UniqueEntityID(),
            custodyAccountId: new UniqueEntityID(),
            heldRole: 'manager',
            accessSince: new Date(),
        });

        expect(listing.platformAccess?.heldRole).toBe('manager');
    });

    it('el plazo no depende del rol: administrador y propietario cuentan igual', () => {
        const hace8Dias = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);

        for (const heldRole of ['manager', 'owner'] as const) {
            const listing = youtubeListing();
            listing.registerPlatformAccess({
                verifiedBy: new UniqueEntityID(),
                custodyAccountId: new UniqueEntityID(),
                heldRole,
                accessSince: hace8Dias,
            });

            // La regla de Google admite las dos antigüedades, y por eso el
            // vendedor puede sumarnos con permisos mínimos sin perder tiempo.
            expect(listing.isReadyToTransfer()).toBe(true);
        }
    });
});
