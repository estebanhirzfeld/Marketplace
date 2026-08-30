import { describe, it, expect } from 'vitest';
import { Listing } from '../src/entities/Listing';
import { Money } from '../src/value-objects/Money';
import { UniqueEntityID } from '../src/value-objects/UniqueEntityID';
import { YouTubeStrategy } from '../src/strategies/YouTubeStrategy';
import { WebStrategy } from '../src/strategies/WebStrategy';
import { InvalidStateError, ValidationError } from '../src/errors/DomainError';

/**
 * La API de YouTube nunca va a poder decirnos si la plataforma tiene el
 * ownership de un canal: no existe campo que indique si un canal es Cuenta de
 * Marca ni que liste sus propietarios. El estado lo atestigua un admin, igual
 * que la custodia.
 *
 * Lo que sí se deriva es CUÁNDO ese acceso habilita la transferencia. YouTube
 * exige haber sido propietario 7 días antes de permitir el cambio de
 * propietario principal, así que el acceso registrado hoy no sirve hoy. La
 * fecha guardada es una sola —desde cuándo hay acceso—; los días se calculan.
 */

const ADMIN = new UniqueEntityID();
const DIA = 24 * 60 * 60 * 1000;

function haceDias(dias: number): Date {
    return new Date(Date.now() - dias * DIA);
}

function unCanal(): Listing {
    return Listing.create({
        sellerId: new UniqueEntityID(),
        assetStrategy: new YouTubeStrategy({
            monthlyRevenueUsd: Money.fromCents(120000, 'USD'),
            subscribers: 55000,
            isMonetized: true,
        }),
        askingPrice: Money.fromCents(1_500_000, 'USD'),
        isBlind: false,
    });
}

function unSitioWeb(): Listing {
    return Listing.create({
        sellerId: new UniqueEntityID(),
        assetStrategy: new WebStrategy(Money.fromCents(80000, 'USD'), 30),
        askingPrice: Money.fromCents(900000, 'USD'),
        isBlind: false,
    });
}

describe('Listing.registerPlatformAccess', () => {
    it('guarda quién lo verificó y desde cuándo hay acceso', () => {
        const listing = unCanal();

        listing.registerPlatformAccess({
            verifiedBy: ADMIN,
            accessSince: haceDias(2),
        });

        const constancia = listing.platformAccess;
        expect(constancia?.verifiedBy.toString()).toBe(ADMIN.toString());
        expect(constancia?.verifiedAt).toBeInstanceOf(Date);
        expect(constancia?.accessSince).toBeInstanceOf(Date);
    });

    it('rechaza un registro sin quién lo verificó', () => {
        const listing = unCanal();

        expect(() =>
            listing.registerPlatformAccess({
                verifiedBy: undefined as never,
                accessSince: haceDias(2),
            }),
        ).toThrow(ValidationError);
    });

    /** Adelantar la fecha sería adelantar el plazo de los 7 días. */
    it('rechaza una fecha de acceso futura', () => {
        const listing = unCanal();

        expect(() =>
            listing.registerPlatformAccess({
                verifiedBy: ADMIN,
                accessSince: new Date(Date.now() + DIA),
            }),
        ).toThrow(ValidationError);
    });
});

describe('Cuándo un listing queda listo para transferirse', () => {
    it('un canal no está listo el mismo día en que se registra el acceso', () => {
        const listing = unCanal();

        listing.registerPlatformAccess({ verifiedBy: ADMIN, accessSince: new Date() });

        expect(listing.isReadyToTransfer()).toBe(false);
    });

    it('un canal queda listo a los 7 días', () => {
        const listing = unCanal();

        listing.registerPlatformAccess({ verifiedBy: ADMIN, accessSince: haceDias(7) });

        expect(listing.isReadyToTransfer()).toBe(true);
    });

    it('sigue sin estar listo a los 6 días', () => {
        const listing = unCanal();

        listing.registerPlatformAccess({ verifiedBy: ADMIN, accessSince: haceDias(6) });

        expect(listing.isReadyToTransfer()).toBe(false);
    });

    it('sin constancia de acceso nunca está listo', () => {
        expect(unCanal().isReadyToTransfer()).toBe(false);
    });

    /**
     * La espera sale de la plataforma del activo, no de nosotros. Un sitio web
     * se transfiere cambiando registrador y hosting: no hay ventana que esperar.
     */
    it('un sitio web queda listo apenas se registra el acceso', () => {
        const listing = unSitioWeb();

        listing.registerPlatformAccess({ verifiedBy: ADMIN, accessSince: new Date() });

        expect(listing.isReadyToTransfer()).toBe(true);
    });
});

describe('Listing.transferableFrom — la fecha que ve el comprador', () => {
    it('devuelve la fecha en que se cumplen los 7 días', () => {
        const listing = unCanal();
        const desde = haceDias(2);

        listing.registerPlatformAccess({ verifiedBy: ADMIN, accessSince: desde });

        const esperada = new Date(desde.getTime() + 7 * DIA);
        expect(listing.transferableFrom()?.getTime()).toBe(esperada.getTime());
    });

    it('sin constancia no hay fecha que prometer', () => {
        expect(unCanal().transferableFrom()).toBeUndefined();
    });
});

describe('Listing.assertCanBeTransferred — el candado', () => {
    it('deja pasar un listing listo', () => {
        const listing = unCanal();
        listing.registerPlatformAccess({ verifiedBy: ADMIN, accessSince: haceDias(8) });

        expect(() => listing.assertCanBeTransferred()).not.toThrow();
    });

    it('frena un listing sin acceso registrado', () => {
        expect(() => unCanal().assertCanBeTransferred()).toThrow(InvalidStateError);
    });

    it('frena un listing dentro de la ventana de espera', () => {
        const listing = unCanal();
        listing.registerPlatformAccess({ verifiedBy: ADMIN, accessSince: haceDias(3) });

        expect(() => listing.assertCanBeTransferred()).toThrow(InvalidStateError);
    });
});

describe('Listing.revokePlatformAccess', () => {
    /**
     * El vendedor sigue siendo propietario principal durante la espera, así que
     * puede expulsar a la plataforma — y la API no nos lo va a avisar. Cuando
     * un admin lo detecta tiene que poder corregir la constancia: dejarla
     * mintiendo sería peor que no tenerla.
     */
    it('borra la constancia y el listing deja de estar listo', () => {
        const listing = unCanal();
        listing.registerPlatformAccess({ verifiedBy: ADMIN, accessSince: haceDias(10) });
        expect(listing.isReadyToTransfer()).toBe(true);

        listing.revokePlatformAccess();

        expect(listing.platformAccess).toBeUndefined();
        expect(listing.isReadyToTransfer()).toBe(false);
        expect(() => listing.assertCanBeTransferred()).toThrow(InvalidStateError);
    });

    /**
     * Volver a registrarlo arranca el conteo de nuevo: los días de la
     * invitación anterior no se recuperan porque el acceso se perdió.
     */
    it('registrar de nuevo reinicia la espera', () => {
        const listing = unCanal();
        listing.registerPlatformAccess({ verifiedBy: ADMIN, accessSince: haceDias(10) });
        listing.revokePlatformAccess();

        listing.registerPlatformAccess({ verifiedBy: ADMIN, accessSince: new Date() });

        expect(listing.isReadyToTransfer()).toBe(false);
    });
});
