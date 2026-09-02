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
    it('debería devolver lo que le toca al vendedor para que el activo entre en custodia', () => {
        const pasos = youtubeListing().handoverSteps();

        // Convertir a Cuenta de Marca, salir de los permisos de canal, invitar
        // como administrador, y —después de dos pasos nuestros— promovernos.
        expect(pasos).toHaveLength(4);
        expect(pasos[0].description).toContain('Cuenta de Marca');
        expect(pasos[1].description).toMatch(/permisos de canal/i);
        expect(pasos[2].description).toContain('invita a');
        expect(pasos[3].description).toMatch(/propietari[oa] principal/i);
    });

    it('incluye el paso del vendedor que ocurre entre dos pasos nuestros', () => {
        const listing = youtubeListing();
        const todos = listing.toSnapshot().props.assetStrategy.getTransferSteps();

        const promocion = listing.handoverSteps().at(-1)!;
        const posicion = todos.findIndex((p) => p.id === promocion.id);
        const nuestrosAntes = todos.slice(0, posicion).filter((p) => p.requiredActor === 'platform');

        // Es el punto entero del cambio: si se cortara la lista en el primer
        // paso ajeno al vendedor, este quedaría invisible y él nunca vería
        // cuándo se le va a pedir ceder el control.
        expect(nuestrosAntes.length).toBeGreaterThan(0);
    });

    it('pide administrador y no propietario, y dice qué no podemos hacer', () => {
        const invitacion = youtubeListing().handoverSteps()[2];

        expect(invitacion.description).toMatch(/administrador/i);
        expect(invitacion.description).not.toMatch(/como propietari/i);
        // La promesa va en negativo: el vendedor la puede verificar en la
        // interfaz de Google en vez de tener que creernos.
        expect(invitacion.instruction).toMatch(/no puede/i);
    });

    it('reenvía el contexto a la estrategia: el paso de invitación nombra la cuenta de custodia', () => {
        const pasos = youtubeListing().handoverSteps({ custodyAccountIdentifier: 'custodia1@gmail.com' });
        expect(pasos.some((p) => p.description.includes('custodia1@gmail.com'))).toBe(true);
    });

    it('debería devolver lo que le toca al vendedor de un sitio antes de cederlo', () => {
        const pasos = webListing().handoverSteps();

        // Eximirse del bloqueo de 60 días y entregar el código: los dos van
        // antes de que el comprador aparezca. Lo posterior —migrar el hosting,
        // ceder las cuentas afiliadas— es de la entrega y no se le pide acá.
        expect(pasos).toHaveLength(2);
        expect(pasos[0].description).toContain('60 días');
        expect(pasos[1].description).toContain('EPP');
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

        expect(delVendedor.length).toBeGreaterThan(listing.handoverSteps().length);
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
