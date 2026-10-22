import { describe, it, expect } from 'vitest';
import { Listing } from '../src/entities/Listing';
import { Money } from '../src/value-objects/Money';
import { UniqueEntityID } from '../src/value-objects/UniqueEntityID';
import { YouTubeStrategy } from '../src/strategies/YouTubeStrategy';
import { WebStrategy } from '../src/strategies/WebStrategy';
import { DomainRegistryRecord } from '../src/ports/IDomainRegistryLookup';
import { InvalidStateError } from '../src/errors/DomainError';

/**
 * Antes de firmar el tripartito, el activo tiene que poder pasar a custodia
 * sin esperas: después de firmar nadie se puede bajar. Cada tipo de activo
 * define qué significa eso. Un canal necesita a la plataforma como
 * administradora hace siete días, porque YouTube no deja cambiar el
 * propietario principal antes. Un sitio necesita su dominio en Hostinger,
 * activo y lejos de vencer: la API de Hostinger no ve la cuenta del vendedor,
 * así que eso se consulta en el registro público (RDAP).
 */

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-21T12:00:00Z');

function unCanal(): Listing {
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

function conAccesoDesde(listing: Listing, diasAtras: number): Listing {
    listing.registerPlatformAccess({
        verifiedBy: new UniqueEntityID(),
        heldRole: 'manager',
        custodyAccountId: new UniqueEntityID(),
        accessSince: new Date(NOW.getTime() - diasAtras * DAY),
    });
    return listing;
}

function unSitio(domain = 'deliaorrego.online'): Listing {
    return Listing.create({
        sellerId: new UniqueEntityID(),
        assetStrategy: new WebStrategy({ monthlyRevenueUsd: Money.fromCents(120000, 'USD'), domain }),
        askingPrice: Money.fromCents(3600000, 'USD'),
    });
}

/** El registro de `deliaorrego.online` tal como lo devolvió RDAP el 21/10/2026. */
function enHostinger(overrides: Partial<DomainRegistryRecord> = {}): DomainRegistryRecord {
    return {
        registrarIanaId: '1636',
        registrarName: 'HOSTINGER operations, UAB',
        statuses: ['client transfer prohibited'],
        expiresAt: new Date(NOW.getTime() + 200 * DAY),
        ...overrides,
    };
}

function instruccion(listing: Listing, registry?: DomainRegistryRecord | null): string {
    const readiness = listing.transferReadiness(registry, NOW);
    if (readiness.ready) throw new Error('se esperaba que no estuviera listo');
    return readiness.instruction;
}

describe('Listo para firmar — canal de YouTube', () => {
    it('con la plataforma como administradora hace siete días está listo', () => {
        expect(conAccesoDesde(unCanal(), 7).transferReadiness(undefined, NOW)).toEqual({ ready: true });
    });

    it('dentro de la espera no está listo y dice desde cuándo', () => {
        const listing = conAccesoDesde(unCanal(), 3);

        expect(instruccion(listing)).toContain('25/10/2026');
    });

    it('sin acceso de la plataforma no está listo', () => {
        expect(instruccion(unCanal())).toBe(
            'La plataforma todavía no tiene acceso al activo: no puede garantizar la custodia.',
        );
    });

    it('necesita el acceso de la plataforma y no consulta ningún registro de dominios', () => {
        const listing = unCanal();

        expect(listing.requiresPlatformAccess()).toBe(true);
        expect(listing.registryDomain()).toBeUndefined();
    });
});

describe('Listo para firmar — sitio', () => {
    it('en Hostinger, sin estados que lo traben y lejos de vencer está listo sin acceso de la plataforma', () => {
        const listing = unSitio();

        expect(listing.requiresPlatformAccess()).toBe(false);
        expect(listing.registryDomain()?.value).toBe('deliaorrego.online');
        expect(listing.transferReadiness(enHostinger(), NOW)).toEqual({ ready: true });
    });

    it('reconoce a Hostinger por el nombre si el registro no trae el número IANA', () => {
        const registry = enHostinger({ registrarIanaId: undefined });

        expect(unSitio().transferReadiness(registry, NOW)).toEqual({ ready: true });
    });

    it('en otro registrador pide mudarlo a Hostinger con el código EPP y avisa del bloqueo de 60 días', () => {
        const text = instruccion(
            unSitio(),
            enHostinger({ registrarIanaId: '146', registrarName: 'GoDaddy.com, LLC' }),
        );

        expect(text).toContain('Hostinger');
        expect(text).toContain('EPP');
        expect(text).toContain('60 días');
    });

    it('a menos de 45 días de vencer pide renovarlo', () => {
        const text = instruccion(unSitio(), enHostinger({ expiresAt: new Date(NOW.getTime() + 30 * DAY) }));

        expect(text).toContain('Renová');
    });

    it.each([['pending delete'], ['redemption period'], ['server hold'], ['client hold'], ['pending transfer']])(
        'con el estado «%s» no está listo',
        (status) => {
            const text = instruccion(unSitio(), enHostinger({ statuses: ['client transfer prohibited', status] }));

            expect(text).toContain(status);
        },
    );

    it('si el registro no publica el vencimiento no está listo: no se puede saber si vence en medio del traspaso', () => {
        const text = instruccion(unSitio(), enHostinger({ expiresAt: undefined }));

        expect(text).toContain('vencimiento');
    });

    it('si el registro no conoce el dominio no está listo', () => {
        expect(instruccion(unSitio(), null)).toContain('deliaorrego.online');
    });

    it('sin dominio cargado no tiene nada que consultar y no está listo', () => {
        const listing = unSitio('');

        expect(listing.registryDomain()).toBeUndefined();
        expect(instruccion(listing)).toContain('dominio');
    });
});

describe('Listing.assertReadyToSign', () => {
    it('frena con la instrucción de la estrategia', () => {
        expect(() => unCanal().assertReadyToSign(undefined, NOW)).toThrow(
            new InvalidStateError('La plataforma todavía no tiene acceso al activo: no puede garantizar la custodia.'),
        );
    });

    it('deja pasar un activo listo', () => {
        expect(() => unSitio().assertReadyToSign(enHostinger(), NOW)).not.toThrow();
    });
});
