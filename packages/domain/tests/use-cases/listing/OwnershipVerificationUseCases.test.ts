import { describe, it, expect, vi } from 'vitest';
import {
    GetDomainOwnershipChallengeUseCase,
    VerifyChannelOwnershipUseCase,
    VerifyDomainOwnershipUseCase,
    VerifyWebsiteRevenueUseCase,
} from '../../../src/use-cases/listing/VerifyOwnershipUseCases';
import { IListingRepository } from '../../../src/ports/Repositories';
import { IYouTubeChannelReader } from '../../../src/ports/IYouTubeChannelReader';
import {
    AdSenseEarnings,
    IAdSenseReader,
    IDnsResolver,
    IOwnershipChallengeIssuer,
    IYouTubeOwnershipReader,
    OwnedYouTubeChannel,
} from '../../../src/ports/IOwnershipReaders';
import { Actor } from '../../../src/ports/Actor';
import { Listing } from '../../../src/entities/Listing';
import { Money } from '../../../src/value-objects/Money';
import { UniqueEntityID } from '../../../src/value-objects/UniqueEntityID';
import { YouTubeStrategy } from '../../../src/strategies/YouTubeStrategy';
import { WebStrategy } from '../../../src/strategies/WebStrategy';
import { ForbiddenError, NotFoundError, ServiceUnavailableError, ValidationError } from '../../../src/errors/DomainError';
import { UserRole } from '@marketplace/shared-types';

const SELLER_ID = new UniqueEntityID();
const CANAL_ID = 'UCq-Fj5jknLsUf-MWSy4_brA';
const GRANT = 'codigo-de-autorizacion';

const SELLER: Actor = { id: SELLER_ID.toString(), role: UserRole.SELLER };
const ADMIN: Actor = { id: 'admin-1', role: UserRole.ADMIN };
const AJENO: Actor = { id: new UniqueEntityID().toString(), role: UserRole.BUYER };

function createMockListingRepo(listing: Listing | null): IListingRepository {
    return {
        findById: vi.fn().mockResolvedValue(listing),
        findPublished: vi.fn().mockResolvedValue([]),
        findBySeller: vi.fn().mockResolvedValue([]),
        findByStatus: vi.fn().mockResolvedValue([]),
        findHeldBy: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
    };
}

function unCanalPublicado(channelUrl = 'https://youtube.com/@canaldeprueba'): Listing {
    return Listing.create({
        sellerId: SELLER_ID,
        assetStrategy: new YouTubeStrategy({
            monthlyRevenueUsd: Money.fromCents(120000, 'USD'),
            subscribers: 55000,
            isMonetized: true,
            channelUrl,
        }),
        askingPrice: Money.fromCents(1_500_000, 'USD'),
    });
}

function unSitio(domain = 'ejemplo.com'): Listing {
    return Listing.create({
        sellerId: SELLER_ID,
        assetStrategy: new WebStrategy(Money.fromCents(80000, 'USD'), 42, domain),
        askingPrice: Money.fromCents(900_000, 'USD'),
    });
}

const lectorPublico = (channelId: string | null): IYouTubeChannelReader => ({
    read: vi.fn().mockResolvedValue(
        channelId === null
            ? null
            : { channelId, title: 'Canal', views: 1, publicVideos: 1, readAt: new Date() },
    ),
});

const lectorDePropios = (canales: OwnedYouTubeChannel[]): IYouTubeOwnershipReader => ({
    channelsOf: vi.fn().mockResolvedValue(canales),
});

const lectorAdSense = (ingreso: AdSenseEarnings | null): IAdSenseReader => ({
    monthlyEarningsFor: vi.fn().mockResolvedValue(ingreso),
});

const UN_INGRESO: AdSenseEarnings = {
    earningsCents: 78_450,
    currency: 'USD',
    from: new Date('2026-07-01'),
    to: new Date('2026-07-31'),
};

// ═════════════════════════════════════════════════════════

describe('VerifyChannelOwnershipUseCase', () => {
    function armar(
        listing: Listing | null,
        propios: OwnedYouTubeChannel[],
        publicado: string | null = CANAL_ID,
    ) {
        const repo = createMockListingRepo(listing);
        const uso = new VerifyChannelOwnershipUseCase(
            repo,
            lectorDePropios(propios),
            lectorPublico(publicado),
        );
        return { uso, repo };
    }

    it('deja constancia cuando el canal publicado está entre los que controla', async () => {
        const listing = unCanalPublicado();
        const { uso, repo } = armar(listing, [{ channelId: CANAL_ID, title: 'Canal' }]);

        const constancia = await uso.execute('l1', GRANT, SELLER);

        expect(constancia.assetId).toBe(CANAL_ID);
        expect(constancia.source).toBe('youtube');
        expect(listing.isOwnershipVerified()).toBe(true);
        expect(repo.save).toHaveBeenCalledOnce();
    });

    /**
     * El fraude que esto elimina: publicar un canal ajeno. La cuenta que
     * autoriza controla canales, pero no el que está a la venta.
     */
    it('rechaza si la cuenta controla otros canales pero no el publicado', async () => {
        const listing = unCanalPublicado();
        const { uso } = armar(listing, [{ channelId: 'UCotroCanalxxxxxxxxxxxx', title: 'Otro' }]);

        await expect(uso.execute('l1', GRANT, SELLER)).rejects.toThrow(ForbiddenError);
        expect(listing.isOwnershipVerified()).toBe(false);
    });

    it('menciona las Cuentas de Marca al explicar el rechazo', async () => {
        const { uso } = armar(unCanalPublicado(), []);

        await expect(uso.execute('l1', GRANT, SELLER)).rejects.toThrow(/Cuenta de Marca/);
    });

    /**
     * La comparación va por ID y no por handle porque un handle se puede
     * cambiar: publicar `@canalA`, cambiarlo a `@canalB` y verificar contra
     * otro canal sería trivial si comparáramos texto.
     */
    it('resuelve el handle publicado a su identificador antes de comparar', async () => {
        const listing = unCanalPublicado('https://youtube.com/@canaldeprueba');
        const { uso } = armar(listing, [{ channelId: CANAL_ID, title: 'Canal' }]);

        const constancia = await uso.execute('l1', GRANT, SELLER);

        expect(constancia.assetId).toBe(CANAL_ID);
    });

    it('deja verificar a un admin', async () => {
        const { uso } = armar(unCanalPublicado(), [{ channelId: CANAL_ID, title: 'Canal' }]);

        await expect(uso.execute('l1', GRANT, ADMIN)).resolves.toBeDefined();
    });

    it('rechaza a un tercero', async () => {
        const { uso } = armar(unCanalPublicado(), [{ channelId: CANAL_ID, title: 'Canal' }]);

        await expect(uso.execute('l1', GRANT, AJENO)).rejects.toThrow(ForbiddenError);
    });

    it('falla si el canal publicado ya no está en YouTube', async () => {
        const { uso } = armar(unCanalPublicado(), [], null);

        await expect(uso.execute('l1', GRANT, SELLER)).rejects.toThrow(NotFoundError);
    });

    it('falla si el activo no es un canal', async () => {
        const { uso } = armar(unSitio(), []);

        await expect(uso.execute('l1', GRANT, SELLER)).rejects.toThrow(ValidationError);
    });

    it('falla si el listing no existe', async () => {
        const { uso } = armar(null, []);

        await expect(uso.execute('l1', GRANT, SELLER)).rejects.toThrow(NotFoundError);
    });
});

// ═════════════════════════════════════════════════════════

describe('VerifyWebsiteRevenueUseCase', () => {
    function armar(listing: Listing | null, ingreso: AdSenseEarnings | null) {
        const repo = createMockListingRepo(listing);
        return { uso: new VerifyWebsiteRevenueUseCase(repo, lectorAdSense(ingreso)), repo };
    }

    /**
     * La única verificación que alcanza el dato que fija el precio. Que la
     * cuenta reporte ese dominio prueba dos cosas de una: que el vendedor
     * controla la cuenta que cobra y que ese sitio es el que genera el ingreso.
     */
    it('guarda el ingreso comprobado, no el declarado', async () => {
        const listing = unSitio();
        const { uso } = armar(listing, UN_INGRESO);

        const constancia = await uso.execute('l1', GRANT, SELLER);

        expect(constancia.monthlyRevenueCents).toBe(78_450);
        expect(constancia.assetId).toBe('ejemplo.com');
        expect(constancia.source).toBe('adsense');
    });

    it('deja el listing con la titularidad comprobada', async () => {
        const listing = unSitio();
        const { uso, repo } = armar(listing, UN_INGRESO);

        await uso.execute('l1', GRANT, SELLER);

        expect(listing.isOwnershipVerified()).toBe(true);
        expect(repo.save).toHaveBeenCalledOnce();
    });

    /**
     * Que la cuenta no reporte el dominio no es un error técnico: es la
     * respuesta. Quien autorizó no es quien monetiza ese sitio.
     */
    it('rechaza si la cuenta de AdSense no reporta ese dominio', async () => {
        const listing = unSitio();
        const { uso } = armar(listing, null);

        await expect(uso.execute('l1', GRANT, SELLER)).rejects.toThrow(ForbiddenError);
        expect(listing.isOwnershipVerified()).toBe(false);
    });

    it('consulta por el dominio publicado', async () => {
        const repo = createMockListingRepo(unSitio('otrodominio.com'));
        const adsense = lectorAdSense(UN_INGRESO);
        await new VerifyWebsiteRevenueUseCase(repo, adsense).execute('l1', GRANT, SELLER);

        expect(adsense.monthlyEarningsFor).toHaveBeenCalledWith(GRANT, 'otrodominio.com');
    });

    it('falla si el activo no es un sitio web', async () => {
        const { uso } = armar(unCanalPublicado(), UN_INGRESO);

        await expect(uso.execute('l1', GRANT, SELLER)).rejects.toThrow(ValidationError);
    });

    it('rechaza a un tercero', async () => {
        const { uso } = armar(unSitio(), UN_INGRESO);

        await expect(uso.execute('l1', GRANT, AJENO)).rejects.toThrow(ForbiddenError);
    });
});

// ═════════════════════════════════════════════════════════

const VALOR_TXT = 'traspaso-verificacion=0123456789abcdef01234567';

const emisor = (): IOwnershipChallengeIssuer => ({
    tokenFor: vi.fn().mockReturnValue(VALOR_TXT),
});

const resolvedor = (txt: string[], nameservers: string[] = ['ns1.nsone.net']): IDnsResolver => ({
    nameserversOf: vi.fn().mockResolvedValue(nameservers),
    txtRecordsOf: vi.fn().mockResolvedValue(txt),
});

describe('GetDomainOwnershipChallengeUseCase', () => {
    function armar(listing: Listing | null, dns: IDnsResolver = resolvedor([])) {
        const repo = createMockListingRepo(listing);
        const issuer = emisor();
        return { uso: new GetDomainOwnershipChallengeUseCase(repo, issuer, dns), repo, issuer, dns };
    }

    it('devuelve el registro TXT que el vendedor tiene que cargar', async () => {
        const { uso } = armar(unSitio());

        const desafio = await uso.execute('l1', SELLER);

        expect(desafio).toEqual({
            domain: 'ejemplo.com',
            host: '@',
            value: VALOR_TXT,
            nameservers: ['ns1.nsone.net'],
        });
    });

    it('deriva el valor del listing y del dominio normalizado', async () => {
        const listing = unSitio('https://WWW.Ejemplo.com/inicio');
        const { uso, issuer } = armar(listing);

        const desafio = await uso.execute('l1', SELLER);

        expect(desafio.domain).toBe('ejemplo.com');
        expect(issuer.tokenFor).toHaveBeenCalledWith(listing.id.toString(), 'ejemplo.com');
    });

    it('consulta los servidores de nombres del dominio normalizado', async () => {
        const { uso, dns } = armar(unSitio('www.ejemplo.com'));

        await uso.execute('l1', SELLER);

        expect(dns.nameserversOf).toHaveBeenCalledWith('ejemplo.com');
    });

    it('deja pedirlo a un admin', async () => {
        const { uso } = armar(unSitio());

        await expect(uso.execute('l1', ADMIN)).resolves.toBeDefined();
    });

    it('rechaza a un tercero', async () => {
        const { uso } = armar(unSitio());

        await expect(uso.execute('l1', AJENO)).rejects.toThrow(ForbiddenError);
    });

    it('falla si el listing no existe', async () => {
        const { uso } = armar(null);

        await expect(uso.execute('l1', SELLER)).rejects.toThrow(NotFoundError);
    });

    it('falla si el activo no es un sitio web', async () => {
        const { uso } = armar(unCanalPublicado());

        await expect(uso.execute('l1', SELLER)).rejects.toThrow(ValidationError);
    });

    it('falla si el sitio no tiene dominio cargado', async () => {
        const { uso } = armar(unSitio(''));

        await expect(uso.execute('l1', SELLER)).rejects.toThrow(ValidationError);
    });

    it('falla si el dominio cargado no es válido', async () => {
        const { uso } = armar(unSitio('sin extension'));

        await expect(uso.execute('l1', SELLER)).rejects.toThrow(ValidationError);
    });

    it('no oculta una falla del resolvedor', async () => {
        const dns = resolvedor([]);
        dns.nameserversOf = vi.fn().mockRejectedValue(new ServiceUnavailableError('sin red'));
        const { uso } = armar(unSitio(), dns);

        await expect(uso.execute('l1', SELLER)).rejects.toThrow(ServiceUnavailableError);
    });
});

describe('VerifyDomainOwnershipUseCase', () => {
    function armar(listing: Listing | null, txt: string[]) {
        const repo = createMockListingRepo(listing);
        const dns = resolvedor(txt);
        return { uso: new VerifyDomainOwnershipUseCase(repo, emisor(), dns), repo, dns };
    }

    it('deja constancia cuando el TXT esperado está publicado', async () => {
        const listing = unSitio();
        const { uso, repo } = armar(listing, ['v=spf1 -all', VALOR_TXT]);

        const resultado = await uso.execute('l1', SELLER);

        expect(resultado).toEqual({ verified: true });
        expect(listing.isOwnershipVerified()).toBe(true);
        expect(listing.ownershipVerification?.source).toBe('dns');
        expect(listing.ownershipVerification?.assetId).toBe('ejemplo.com');
        expect(listing.ownershipVerification?.verifiedBy.toString()).toBe(SELLER.id);
        expect(listing.ownershipVerification?.monthlyRevenueCents).toBeUndefined();
        expect(repo.save).toHaveBeenCalledOnce();
    });

    it('consulta los TXT del dominio normalizado', async () => {
        const { uso, dns } = armar(unSitio('https://www.Ejemplo.com/'), [VALOR_TXT]);

        await uso.execute('l1', SELLER);

        expect(dns.txtRecordsOf).toHaveBeenCalledWith('ejemplo.com');
    });

    /**
     * Como en las otras fuentes, la constancia nombra al vendedor: el TXT prueba
     * que él controla el DNS, aunque la consulta la dispare un admin.
     */
    it('registra al vendedor aunque la comprobación la pida un admin', async () => {
        const listing = unSitio();
        const { uso } = armar(listing, [VALOR_TXT]);

        await uso.execute('l1', ADMIN);

        expect(listing.ownershipVerification?.verifiedBy.toString()).toBe(SELLER.id);
    });

    it('acepta el valor aunque venga con espacios alrededor', async () => {
        const listing = unSitio();
        const { uso } = armar(listing, [`  ${VALOR_TXT}\t`]);

        await expect(uso.execute('l1', SELLER)).resolves.toEqual({ verified: true });
        expect(listing.isOwnershipVerified()).toBe(true);
    });

    it('responde que no está verificado, sin guardar, si el TXT no aparece', async () => {
        const listing = unSitio();
        const { uso, repo } = armar(listing, ['v=spf1 -all', 'google-site-verification=abc']);

        await expect(uso.execute('l1', SELLER)).resolves.toEqual({ verified: false });
        expect(listing.isOwnershipVerified()).toBe(false);
        expect(repo.save).not.toHaveBeenCalled();
    });

    it('responde que no está verificado si el dominio no existe (sin registros)', async () => {
        const { uso, repo } = armar(unSitio(), []);

        await expect(uso.execute('l1', SELLER)).resolves.toEqual({ verified: false });
        expect(repo.save).not.toHaveBeenCalled();
    });

    it('ignora un valor parecido pero no idéntico', async () => {
        const { uso } = armar(unSitio(), ['traspaso-verificacion=0123456789abcdef0123456']);

        await expect(uso.execute('l1', SELLER)).resolves.toEqual({ verified: false });
    });

    /**
     * Si ya hay una constancia por DNS del mismo dominio, volver a comprobar no
     * debe reescribirla (cambiaría la fecha) ni exigir que el TXT siga ahí:
     * revocar la constancia por un TXT borrado queda fuera del alcance.
     */
    it('es idempotente: con constancia previa de DNS para el mismo dominio no consulta ni guarda', async () => {
        const listing = unSitio();
        listing.registerOwnershipVerification({
            verifiedBy: SELLER_ID,
            assetId: 'ejemplo.com',
            source: 'dns',
        });
        const antes = listing.ownershipVerification;
        const { uso, repo, dns } = armar(listing, []);

        await expect(uso.execute('l1', SELLER)).resolves.toEqual({ verified: true });
        expect(listing.ownershipVerification).toBe(antes);
        expect(dns.txtRecordsOf).not.toHaveBeenCalled();
        expect(repo.save).not.toHaveBeenCalled();
    });

    /**
     * AdSense también prueba la titularidad y además trae los ingresos
     * verificados: pisarla con DNS los perdería.
     */
    it('respeta una constancia de AdSense del mismo dominio: no consulta ni guarda', async () => {
        const listing = unSitio();
        listing.registerOwnershipVerification({
            verifiedBy: SELLER_ID,
            assetId: 'Ejemplo.com ',
            source: 'adsense',
            monthlyRevenueCents: 78_450,
        });
        const antes = listing.ownershipVerification;
        const { uso, repo, dns } = armar(listing, [VALOR_TXT]);

        await expect(uso.execute('l1', SELLER)).resolves.toEqual({ verified: true });
        expect(listing.ownershipVerification).toBe(antes);
        expect(dns.txtRecordsOf).not.toHaveBeenCalled();
        expect(repo.save).not.toHaveBeenCalled();
    });

    it('comprueba el TXT si la constancia previa es de otro dominio', async () => {
        const listing = unSitio();
        listing.registerOwnershipVerification({
            verifiedBy: SELLER_ID,
            assetId: 'otrodominio.com',
            source: 'adsense',
        });
        const { uso, repo } = armar(listing, [VALOR_TXT]);

        await expect(uso.execute('l1', SELLER)).resolves.toEqual({ verified: true });
        expect(listing.ownershipVerification?.source).toBe('dns');
        expect(listing.ownershipVerification?.assetId).toBe('ejemplo.com');
        expect(repo.save).toHaveBeenCalledOnce();
    });

    it('rechaza a un tercero', async () => {
        const { uso } = armar(unSitio(), [VALOR_TXT]);

        await expect(uso.execute('l1', AJENO)).rejects.toThrow(ForbiddenError);
    });

    it('falla si el listing no existe', async () => {
        const { uso } = armar(null, [VALOR_TXT]);

        await expect(uso.execute('l1', SELLER)).rejects.toThrow(NotFoundError);
    });

    it('falla si el activo no es un sitio web', async () => {
        const { uso } = armar(unCanalPublicado(), [VALOR_TXT]);

        await expect(uso.execute('l1', SELLER)).rejects.toThrow(ValidationError);
    });

    it('falla si el sitio no tiene dominio cargado', async () => {
        const { uso } = armar(unSitio(''), [VALOR_TXT]);

        await expect(uso.execute('l1', SELLER)).rejects.toThrow(ValidationError);
    });

    it('no oculta una falla del resolvedor ni guarda nada', async () => {
        const listing = unSitio();
        const { uso, repo, dns } = armar(listing, []);
        dns.txtRecordsOf = vi.fn().mockRejectedValue(new ServiceUnavailableError('sin red'));

        await expect(uso.execute('l1', SELLER)).rejects.toThrow(ServiceUnavailableError);
        expect(repo.save).not.toHaveBeenCalled();
    });
});
