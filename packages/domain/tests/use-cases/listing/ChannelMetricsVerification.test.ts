import { describe, it, expect, vi } from 'vitest';
import { VerifyChannelMetricsUseCase } from '../../../src/use-cases/listing/VerifyChannelMetricsUseCase';
import { IListingRepository } from '../../../src/ports/Repositories';
import {
    IYouTubeChannelReader,
    YouTubeChannelSnapshot,
} from '../../../src/ports/IYouTubeChannelReader';
import { Actor } from '../../../src/ports/Actor';
import { Listing } from '../../../src/entities/Listing';
import { Money } from '../../../src/value-objects/Money';
import { UniqueEntityID } from '../../../src/value-objects/UniqueEntityID';
import { YouTubeStrategy } from '../../../src/strategies/YouTubeStrategy';
import { WebStrategy } from '../../../src/strategies/WebStrategy';
import { ForbiddenError, NotFoundError, ValidationError } from '../../../src/errors/DomainError';
import { UserRole } from '@marketplace/shared-types';

/**
 * La verificación contrasta lo declarado contra lo que informa la API. No
 * valida el precio: el ingreso mensual, que es lo que lo fija, no es
 * consultable por ninguna vía que tengamos.
 */

const SELLER_ID = new UniqueEntityID();

function createMockListingRepo(over: Partial<IListingRepository> = {}): IListingRepository {
    return {
        findById: vi.fn().mockResolvedValue(null),
        findPublished: vi.fn().mockResolvedValue([]),
        findBySeller: vi.fn().mockResolvedValue([]),
        findByStatus: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
        ...over,
    };
}

function unaFoto(over: Partial<YouTubeChannelSnapshot> = {}): YouTubeChannelSnapshot {
    return {
        channelId: 'UCq-Fj5jknLsUf-MWSy4_brA',
        title: 'Canal de prueba',
        subscribers: 55400,
        views: 12_000_000,
        publicVideos: 320,
        readAt: new Date('2026-08-30T12:00:00Z'),
        ...over,
    };
}

function unLector(foto: YouTubeChannelSnapshot | null): IYouTubeChannelReader {
    return { read: vi.fn().mockResolvedValue(foto) };
}

function unCanal(over: { subscribers?: number; channelUrl?: string } = {}): Listing {
    return Listing.create({
        sellerId: SELLER_ID,
        assetStrategy: new YouTubeStrategy({
            monthlyRevenueUsd: Money.fromCents(120000, 'USD'),
            subscribers: over.subscribers ?? 55432,
            isMonetized: true,
            channelUrl: over.channelUrl ?? 'https://youtube.com/@canaldeprueba',
        }),
        askingPrice: Money.fromCents(1_500_000, 'USD'),
        isBlind: true,
    });
}

function armar(listing: Listing | null, foto: YouTubeChannelSnapshot | null = unaFoto()) {
    return new VerifyChannelMetricsUseCase(
        createMockListingRepo({ findById: vi.fn().mockResolvedValue(listing) }),
        unLector(foto),
    );
}

const ADMIN: Actor = { id: 'admin-1', role: UserRole.ADMIN };
const SELLER: Actor = { id: SELLER_ID.toString(), role: UserRole.SELLER };
const AJENO: Actor = { id: new UniqueEntityID().toString(), role: UserRole.BUYER };

describe('VerifyChannelMetricsUseCase — el contraste', () => {
    it('da por consistente un declarado que redondea a lo informado', async () => {
        // 55432 declarados redondean a 55400, que es lo que informa la API.
        const reporte = await armar(unCanal({ subscribers: 55432 })).execute('l1', ADMIN);

        expect(reporte.subscribersMatch).toBe(true);
        expect(reporte.declaredSubscribers).toBe(55432);
        expect(reporte.reportedSubscribers).toBe(55400);
    });

    /** El caso que justifica toda la integración. */
    it('detecta un declarado inflado diez veces', async () => {
        const reporte = await armar(unCanal({ subscribers: 554_000 })).execute('l1', ADMIN);

        expect(reporte.subscribersMatch).toBe(false);
    });

    it('no se pronuncia si el canal oculta sus suscriptores', async () => {
        const uso = armar(unCanal(), unaFoto({ subscribers: undefined }));

        const reporte = await uso.execute('l1', ADMIN);

        expect(reporte.subscribersMatch).toBeUndefined();
        expect(reporte.reportedSubscribers).toBeUndefined();
    });

    it('trae el resto de lo que la API sí expone', async () => {
        const reporte = await armar(unCanal()).execute('l1', ADMIN);

        expect(reporte.title).toBe('Canal de prueba');
        expect(reporte.views).toBe(12_000_000);
        expect(reporte.publicVideos).toBe(320);
        expect(reporte.checkedAt).toBeInstanceOf(Date);
    });
});

describe('VerifyChannelMetricsUseCase — quién puede pedirla', () => {
    it('deja verificar a la plataforma', async () => {
        await expect(armar(unCanal()).execute('l1', ADMIN)).resolves.toBeDefined();
    });

    it('deja verificar al vendedor su propio activo', async () => {
        await expect(armar(unCanal()).execute('l1', SELLER)).resolves.toBeDefined();
    });

    /**
     * La dirección del canal es un dato reservado. Si cualquiera pudiera
     * disparar la verificación, el título del canal en la respuesta revelaría
     * la identidad de un listing blind sin pasar por el NDA.
     */
    it('rechaza a un tercero', async () => {
        await expect(armar(unCanal()).execute('l1', AJENO)).rejects.toThrow(ForbiddenError);
    });
});

describe('VerifyChannelMetricsUseCase — lo que no se puede verificar', () => {
    it('falla si el listing no existe', async () => {
        await expect(armar(null).execute('l1', ADMIN)).rejects.toThrow(NotFoundError);
    });

    it('falla si el activo no es un canal de YouTube', async () => {
        const web = Listing.create({
            sellerId: SELLER_ID,
            assetStrategy: new WebStrategy(Money.fromCents(80000, 'USD'), 42, 'ejemplo.com'),
            askingPrice: Money.fromCents(900_000, 'USD'),
            isBlind: false,
        });

        await expect(armar(web).execute('l1', ADMIN)).rejects.toThrow(ValidationError);
    });

    it('falla si el listing no tiene cargada la dirección del canal', async () => {
        await expect(armar(unCanal({ channelUrl: '' })).execute('l1', ADMIN)).rejects.toThrow(
            ValidationError,
        );
    });

    it('explica qué dirección hace falta si la cargada no sirve', async () => {
        const uso = armar(unCanal({ channelUrl: 'https://youtube.com/c/MiCanal' }));

        await expect(uso.execute('l1', ADMIN)).rejects.toThrow(/@/);
    });

    it('avisa si el canal ya no está en YouTube', async () => {
        await expect(armar(unCanal(), null).execute('l1', ADMIN)).rejects.toThrow(NotFoundError);
    });
});
