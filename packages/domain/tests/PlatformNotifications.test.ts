import { describe, it, expect, vi } from 'vitest';
import { PlatformNotifier } from '../src/services/PlatformNotifier';
import { INotifier } from '../src/ports/INotifier';
import { IUserRepository } from '../src/ports/Repositories';
import { Notification } from '../src/entities/Notification';
import { User } from '../src/entities/User';
import { Listing } from '../src/entities/Listing';
import { Operation } from '../src/entities/Operation';
import { Email } from '../src/value-objects/Email';
import { Money } from '../src/value-objects/Money';
import { UniqueEntityID } from '../src/value-objects/UniqueEntityID';
import { WebStrategy } from '../src/strategies/WebStrategy';
import { AssetNiche, UserRole } from '@marketplace/shared-types';

/*
 * Los avisos que le tocan a la plataforma.
 *
 * Un aviso apunta siempre a una persona, y "la plataforma" es un rol, así que
 * antes no había forma de nombrarla como destinataria: la campana de un
 * administrador estaba vacía por construcción. Una operación podía quedarse
 * días detenida esperando un movimiento suyo sin que nadie se lo dijera.
 */

function admin(email: string) {
    return User.create({
        email: Email.create(email),
        fullName: `Admin ${email}`,
        passwordHash: 'x'.repeat(60),
        role: UserRole.ADMIN,
    });
}

function repoConAdmins(...admins: User[]): IUserRepository {
    return {
        findById: vi.fn().mockResolvedValue(null),
        findByEmail: vi.fn().mockResolvedValue(null),
        findByRole: vi.fn(async (role) => (role === UserRole.ADMIN ? admins : [])),
        save: vi.fn().mockResolvedValue(undefined),
    };
}

function armar(...admins: User[]) {
    const enviadas: Notification[] = [];
    const notifier: INotifier = {
        notify: vi.fn(async (ns: Notification[]) => {
            enviadas.push(...ns);
        }),
    };
    return {
        enviadas,
        notifier,
        avisos: new PlatformNotifier(notifier, repoConAdmins(...admins)),
    };
}

function unActivo() {
    return Listing.create({
        sellerId: new UniqueEntityID(),
        assetStrategy: new WebStrategy(
            Money.fromCents(120000, 'USD'),
            44,
            'ejemplo.com',
            AssetNiche.TECHNOLOGY,
            'Ejemplo',
        ),
        askingPrice: Money.fromCents(3600000, 'USD'),
    });
}

function unaOperacion() {
    return Operation.create({
        listingId: new UniqueEntityID(),
        buyerId: new UniqueEntityID(),
        sellerId: new UniqueEntityID(),
        offerPrice: Money.fromCents(3000000, 'USD'),
    });
}

describe('PlatformNotifier', () => {
    it('le avisa a la plataforma que hay un activo esperando revisión', async () => {
        const { avisos, enviadas } = armar(admin('uno@traspaso.com'));

        await avisos.listingSubmitted(unActivo());

        expect(enviadas).toHaveLength(1);
        expect(enviadas[0].type).toBe('revision_pendiente');
    });

    it('le avisa a TODOS los administradores, no solo al primero', async () => {
        const { avisos, enviadas } = armar(
            admin('uno@traspaso.com'),
            admin('dos@traspaso.com'),
            admin('tres@traspaso.com'),
        );

        await avisos.custodyNeeded(unaOperacion());

        // Hoy hay un solo admin en la base, pero asumirlo sería construir una
        // plataforma de una sola persona.
        expect(enviadas).toHaveLength(3);
        expect(new Set(enviadas.map((n) => n.toSnapshot().props.userId.toString())).size).toBe(3);
    });

    it('avisa que una firma quedó trabada esperando el acceso al activo', async () => {
        const { avisos, enviadas } = armar(admin('uno@traspaso.com'));

        await avisos.platformAccessNeeded(unaOperacion());

        expect(enviadas[0].type).toBe('acceso_pendiente');
    });

    it('lleva el monto que hay que liquidarle al vendedor', async () => {
        const operation = unaOperacion();
        operation.acceptCurrentOffer('seller');

        const { avisos, enviadas } = armar(admin('uno@traspaso.com'));
        await avisos.payoutNeeded(operation);

        expect(enviadas[0].type).toBe('liquidacion_pendiente');
        expect(enviadas[0].toSnapshot().props.amountCents).toBe(
            operation.sellerReceives!.getCents(),
        );
    });

    it('no tumba la operación si el aviso falla', async () => {
        const roto: IUserRepository = {
            findById: vi.fn().mockResolvedValue(null),
            findByEmail: vi.fn().mockResolvedValue(null),
            findByRole: vi.fn().mockRejectedValue(new Error('la base no responde')),
            save: vi.fn(),
        };
        const notifier: INotifier = { notify: vi.fn() };

        // Que un aviso no salga es molesto; que se caiga una venta porque el
        // aviso no salió es inaceptable.
        await expect(
            new PlatformNotifier(notifier, roto).custodyNeeded(unaOperacion()),
        ).resolves.toBeUndefined();
        expect(notifier.notify).not.toHaveBeenCalled();
    });

    it('no manda nada si no hay ningún administrador', async () => {
        const { avisos, enviadas } = armar();

        await avisos.listingSubmitted(unActivo());

        expect(enviadas).toHaveLength(0);
    });
});
