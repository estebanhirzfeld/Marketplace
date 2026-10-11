import { describe, it, expect } from 'vitest';
import { Listing } from '../src/entities/Listing';
import { YouTubeStrategy } from '../src/strategies/YouTubeStrategy';
import { WebStrategy } from '../src/strategies/WebStrategy';
import { Money } from '../src/value-objects/Money';
import { UniqueEntityID } from '../src/value-objects/UniqueEntityID';
import { InvalidStateError } from '../src/errors/DomainError';

/*
 * El vendedor declara que ya invitó a la plataforma; el admin lo confirma
 * después con la constancia de acceso. Entre una cosa y la otra el activo está
 * «verificando»: la declaración no mueve el plazo, solo avisa que hay algo para
 * revisar.
 */

const DIA = 24 * 60 * 60 * 1000;
// `registerPlatformAccess` compara contra el reloj real, así que el «ahora» de
// los tests también lo es.
const AHORA = new Date();

function canal() {
    return Listing.create({
        sellerId: new UniqueEntityID(),
        assetStrategy: new YouTubeStrategy({
            monthlyRevenueUsd: Money.fromCents(50000, 'USD'),
            subscribers: 10000,
            isMonetized: true,
        }),
        askingPrice: Money.fromCents(1_000_000, 'USD'),
    });
}

function sitio() {
    return Listing.create({
        sellerId: new UniqueEntityID(),
        assetStrategy: new WebStrategy(Money.fromCents(210000, 'USD'), 52, 'ejemplo.com'),
        askingPrice: Money.fromCents(6_800_000, 'USD'),
    });
}

function conAcceso(listing: Listing, desde: Date) {
    listing.registerPlatformAccess({
        verifiedBy: new UniqueEntityID(),
        custodyAccountId: new UniqueEntityID(),
        heldRole: 'manager',
        accessSince: desde,
    });
    return listing;
}

describe('Listing.requestPlatformAccess', () => {
    it('guarda la fecha de la solicitud', () => {
        const listing = canal();
        expect(listing.platformAccessRequestedAt).toBeUndefined();

        listing.requestPlatformAccess(AHORA);

        expect(listing.platformAccessRequestedAt).toEqual(AHORA);
    });

    it('conserva la primera fecha si se pide de nuevo', () => {
        const listing = canal();
        listing.requestPlatformAccess(AHORA);

        listing.requestPlatformAccess(new Date(AHORA.getTime() + DIA));

        expect(listing.platformAccessRequestedAt).toEqual(AHORA);
    });

    it('con el acceso ya registrado no cambia nada', () => {
        const listing = conAcceso(canal(), new Date(AHORA.getTime() - 10 * DIA));

        listing.requestPlatformAccess(AHORA);

        expect(listing.platformAccessRequestedAt).toBeUndefined();
    });

    it('se puede pedir en borrador y publicado', () => {
        const borrador = canal();
        expect(() => borrador.requestPlatformAccess(AHORA)).not.toThrow();

        const publicado = canal();
        publicado.registerOwnershipVerification({
            verifiedBy: new UniqueEntityID(),
            assetId: 'UCq-Fj5jknLsUf-MWSy4_brA',
            source: 'youtube',
        });
        publicado.publish();
        expect(() => publicado.requestPlatformAccess(AHORA)).not.toThrow();
    });

    it.each(['under_review', 'rejected', 'in_operation', 'sold'] as const)(
        'se niega en un activo %s',
        (estado) => {
            const listing = Listing.reconstitute(
                { ...canal().toSnapshot().props, status: estado },
                new UniqueEntityID(),
                new Date(),
            );

            expect(() => listing.requestPlatformAccess(AHORA)).toThrow(InvalidStateError);
            expect(listing.platformAccessRequestedAt).toBeUndefined();
        },
    );

    it('si la plataforma pierde el acceso, la solicitud vieja también se descarta', () => {
        const listing = canal();
        listing.requestPlatformAccess(AHORA);
        conAcceso(listing, new Date(AHORA.getTime() - DIA));

        listing.revokePlatformAccess();

        expect(listing.platformAccessRequestedAt).toBeUndefined();
        expect(listing.platformAccessStatus(AHORA)).toBe('pending');
    });
});

describe('Listing.platformAccessStatus', () => {
    it('pending: no pidió nada y no hay constancia', () => {
        expect(canal().platformAccessStatus(AHORA)).toBe('pending');
    });

    it('verifying: lo pidió y falta que un admin lo confirme', () => {
        const listing = canal();
        listing.requestPlatformAccess(AHORA);

        expect(listing.platformAccessStatus(AHORA)).toBe('verifying');
    });

    it('waiting: constancia registrada pero sin cumplirse la espera', () => {
        const listing = conAcceso(canal(), new Date(AHORA.getTime() - 2 * DIA));

        expect(listing.platformAccessStatus(AHORA)).toBe('waiting');
    });

    it('immediate: constancia registrada y espera cumplida', () => {
        const listing = conAcceso(canal(), new Date(AHORA.getTime() - 8 * DIA));

        expect(listing.platformAccessStatus(AHORA)).toBe('immediate');
    });

    it('la constancia pesa más que la solicitud', () => {
        const listing = canal();
        listing.requestPlatformAccess(new Date(AHORA.getTime() - 3 * DIA));
        conAcceso(listing, new Date(AHORA.getTime() - 2 * DIA));

        expect(listing.platformAccessStatus(AHORA)).toBe('waiting');
    });

    it('un sitio web sin espera es immediate apenas hay constancia', () => {
        const listing = conAcceso(sitio(), AHORA);

        expect(listing.platformAccessStatus(AHORA)).toBe('immediate');
    });
});
