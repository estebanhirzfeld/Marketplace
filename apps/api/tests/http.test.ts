import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { createContainer } from '../src/container';
import { prisma } from '@marketplace/db';
import { UserRole } from '@marketplace/shared-types';
import { User } from '@marketplace/domain/src/entities/User';
import { Listing } from '@marketplace/domain/src/entities/Listing';
import { Operation } from '@marketplace/domain/src/entities/Operation';
import { Email } from '@marketplace/domain/src/value-objects/Email';
import { Money } from '@marketplace/domain/src/value-objects/Money';
import { UniqueEntityID } from '@marketplace/domain/src/value-objects/UniqueEntityID';
import { YouTubeStrategy } from '@marketplace/domain/src/strategies/YouTubeStrategy';
import { IPasswordHasher } from '@marketplace/domain/src/ports/IPasswordHasher';
import {
    PrismaUserRepository,
    PrismaListingRepository,
    PrismaOperationRepository,
} from '@marketplace/db';

/**
 * Tests HTTP end-to-end contra la base real, sin levantar un servidor:
 * `app.inject()` corre el ciclo completo de Fastify en memoria.
 *
 * Se inyecta un hasher trivial en lugar de bcrypt: cada `hash` con 12 rondas
 * cuesta ~250ms y acá no se está verificando criptografía sino el transporte.
 */
const fakeHasher: IPasswordHasher = {
    hash: async (plain) => `hashed:${plain}`,
    compare: async (plain, hash) => hash === `hashed:${plain}`,
};

const userRepo = new PrismaUserRepository();
const listingRepo = new PrismaListingRepository();

let app: FastifyInstance;

async function crearUsuario(
    email: string,
    role: UserRole,
    conKyc = true,
): Promise<User> {
    const user = User.create({
        email: Email.create(email),
        fullName: 'Usuario HTTP',
        dni: '20123456789',
        role,
        country: 'AR',
        passwordHash: 'hashed:marketplace1',
    });
    if (conKyc) user.verifyKyc();
    await userRepo.save(user);
    return user;
}

async function crearListingPublicado(sellerId: UniqueEntityID, isBlind = false): Promise<Listing> {
    const listing = Listing.create({
        sellerId,
        assetStrategy: new YouTubeStrategy({
            monthlyRevenueUsd: Money.fromCents(120000, 'USD'),
            subscribers: 55000,
            isMonetized: true,
        }),
        askingPrice: Money.fromCents(1500000, 'USD'),
        isBlind,
    });
    listing.submitForReview();
    listing.approve();
    await listingRepo.save(listing);
    return listing;
}

async function tokenDe(email: string): Promise<string> {
    const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email, password: 'marketplace1' },
    });
    return res.json().token;
}

async function limpiar() {
    await prisma.report.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.contract.deleteMany();
    await prisma.operation.deleteMany();
    await prisma.listing.deleteMany();
    await prisma.user.deleteMany();
}

beforeEach(async () => {
    await limpiar();
    app = await buildApp({
        container: createContainer(fakeHasher),
        jwtSecret: 'secreto-de-test',
    });
});

afterAll(async () => {
    await limpiar();
    await prisma.$disconnect();
});

// ═════════════════════════════════════════════════════════

describe('POST /auth/register y /auth/login', () => {
    it('registra un usuario y devuelve 201', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/auth/register',
            payload: {
                email: 'nuevo@test.com',
                fullName: 'Usuario Nuevo',
                password: 'marketplace1',
                role: UserRole.BUYER,
            },
        });

        expect(res.statusCode).toBe(201);
        expect(res.json().email).toBe('nuevo@test.com');
        expect(res.json().isKycVerified).toBe(false);
        // El hash nunca sale por la API.
        expect(res.json()).not.toHaveProperty('passwordHash');
    });

    it('rechaza una contraseña débil con 400', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/auth/register',
            payload: {
                email: 'debil@test.com',
                fullName: 'Clave Débil',
                password: 'corta',
                role: UserRole.BUYER,
            },
        });

        expect(res.statusCode).toBe(400);
        expect(res.json().code).toBe('VALIDATION');
    });

    it('devuelve un token con credenciales correctas', async () => {
        await crearUsuario('login@test.com', UserRole.BUYER);

        const res = await app.inject({
            method: 'POST',
            url: '/auth/login',
            payload: { email: 'login@test.com', password: 'marketplace1' },
        });

        expect(res.statusCode).toBe(200);
        expect(typeof res.json().token).toBe('string');
        expect(res.json().actor.role).toBe(UserRole.BUYER);
    });

    it('devuelve 403 con la contraseña incorrecta', async () => {
        await crearUsuario('login@test.com', UserRole.BUYER);

        const res = await app.inject({
            method: 'POST',
            url: '/auth/login',
            payload: { email: 'login@test.com', password: 'otraClave1' },
        });

        expect(res.statusCode).toBe(403);
    });
});

describe('Autenticación de rutas protegidas', () => {
    it('devuelve 401 sin token', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/listings/cualquiera/approve',
        });

        expect(res.statusCode).toBe(401);
        expect(res.json().code).toBe('UNAUTHORIZED');
    });

    it('devuelve 401 con un token firmado con otra clave', async () => {
        const otraApp = await buildApp({
            container: createContainer(fakeHasher),
            jwtSecret: 'otra-clave',
        });
        const tokenAjeno = otraApp.jwt.sign({ id: 'x', role: UserRole.ADMIN });

        const res = await app.inject({
            method: 'POST',
            url: '/listings/cualquiera/approve',
            headers: { authorization: `Bearer ${tokenAjeno}` },
        });

        expect(res.statusCode).toBe(401);
    });
});

describe('Autorización por rol y por pertenencia', () => {
    it('403 cuando un buyer intenta aprobar un listing', async () => {
        const seller = await crearUsuario('seller@test.com', UserRole.SELLER);
        await crearUsuario('buyer@test.com', UserRole.BUYER);
        const listing = await crearListingPublicado(seller.id);

        const res = await app.inject({
            method: 'POST',
            url: `/listings/${listing.id.toString()}/approve`,
            headers: { authorization: `Bearer ${await tokenDe('buyer@test.com')}` },
        });

        expect(res.statusCode).toBe(403);
        expect(res.json().code).toBe('FORBIDDEN');
    });

    it('403 cuando alguien que no es dueño pide las ofertas del listing', async () => {
        const seller = await crearUsuario('seller@test.com', UserRole.SELLER);
        await crearUsuario('curioso@test.com', UserRole.BUYER);
        const listing = await crearListingPublicado(seller.id);

        const res = await app.inject({
            method: 'GET',
            url: `/listings/${listing.id.toString()}/offers`,
            headers: { authorization: `Bearer ${await tokenDe('curioso@test.com')}` },
        });

        expect(res.statusCode).toBe(403);
    });

    it('200 cuando el dueño pide las ofertas de su listing', async () => {
        const seller = await crearUsuario('seller@test.com', UserRole.SELLER);
        const listing = await crearListingPublicado(seller.id);

        const res = await app.inject({
            method: 'GET',
            url: `/listings/${listing.id.toString()}/offers`,
            headers: { authorization: `Bearer ${await tokenDe('seller@test.com')}` },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual([]);
    });

    it('403 cuando el seller intenta ofertar sobre su propio listing', async () => {
        const seller = await crearUsuario('seller@test.com', UserRole.SELLER);
        const listing = await crearListingPublicado(seller.id);

        const res = await app.inject({
            method: 'POST',
            url: `/listings/${listing.id.toString()}/offers`,
            headers: { authorization: `Bearer ${await tokenDe('seller@test.com')}` },
            payload: { offerPrice: { cents: 800000, currency: 'USD' } },
        });

        expect(res.statusCode).toBe(403);
    });
});

describe('Mapeo de errores de dominio a HTTP', () => {
    it('404 para un listing inexistente', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/listings/no-existe',
        });

        expect(res.statusCode).toBe(404);
        expect(res.json().code).toBe('NOT_FOUND');
    });

    it('409 al ofertar sobre un listing que no está publicado', async () => {
        const seller = await crearUsuario('seller@test.com', UserRole.SELLER);
        await crearUsuario('buyer@test.com', UserRole.BUYER);

        const draft = Listing.create({
            sellerId: seller.id,
            assetStrategy: new YouTubeStrategy({
                monthlyRevenueUsd: Money.fromCents(120000, 'USD'),
                subscribers: 55000,
                isMonetized: true,
            }),
            askingPrice: Money.fromCents(1500000, 'USD'),
            isBlind: false,
        });
        await listingRepo.save(draft);

        const res = await app.inject({
            method: 'POST',
            url: `/listings/${draft.id.toString()}/offers`,
            headers: { authorization: `Bearer ${await tokenDe('buyer@test.com')}` },
            payload: { offerPrice: { cents: 800000, currency: 'USD' } },
        });

        expect(res.statusCode).toBe(409);
        expect(res.json().code).toBe('INVALID_STATE');
    });

    it('400 cuando falta un campo obligatorio del body', async () => {
        await crearUsuario('admin@test.com', UserRole.ADMIN);

        const res = await app.inject({
            method: 'POST',
            url: '/listings/x/reject',
            headers: { authorization: `Bearer ${await tokenDe('admin@test.com')}` },
            payload: {},
        });

        expect(res.statusCode).toBe(400);
    });
});

describe('Flujo blind sobre HTTP', () => {
    it('un anónimo ve el listing filtrado y tras firmar el NDA lo ve completo', async () => {
        const seller = await crearUsuario('seller@test.com', UserRole.SELLER);
        await crearUsuario('buyer@test.com', UserRole.BUYER);
        const listing = await crearListingPublicado(seller.id, true);
        const url = `/listings/${listing.id.toString()}`;

        const anonimo = await app.inject({ method: 'GET', url });
        expect(anonimo.statusCode).toBe(200);
        expect(anonimo.json().hiddenFields.length).toBeGreaterThan(0);

        const token = await tokenDe('buyer@test.com');

        const firma = await app.inject({
            method: 'POST',
            url: `${url}/nda`,
            headers: { authorization: `Bearer ${token}` },
        });
        expect(firma.statusCode).toBe(201);
        expect(firma.json().isFullySigned).toBe(true);

        const conNda = await app.inject({
            method: 'GET',
            url,
            headers: { authorization: `Bearer ${token}` },
        });
        expect(conNda.json().hiddenFields).toHaveLength(0);
        expect(conNda.json().assetData.subscribers).toBe(55000);
    });
});

describe('GET /listings — no filtra datos confidenciales', () => {
    /**
     * La ruta leía el repositorio directo y salteaba el filtrado blind. Este
     * test fija que ya no: los campos que la strategy declara confidenciales
     * no pueden aparecer en la grilla pública.
     */
    it('un listing blind expone solo campos públicos, aun sin sesión', async () => {
        const seller = await crearUsuario('seller@test.com', UserRole.SELLER);
        await crearListingPublicado(seller.id, true);

        const res = await app.inject({ method: 'GET', url: '/listings' });

        expect(res.statusCode).toBe(200);
        const [listing] = res.json();

        expect(listing.isBlind).toBe(true);
        expect(listing.hiddenFields.length).toBeGreaterThan(0);

        // Ninguna clave confidencial puede estar presente.
        for (const campo of listing.hiddenFields) {
            expect(listing.assetData).not.toHaveProperty(campo);
        }

        // Y los públicos sí llegan, porque la grilla tiene que servir de algo.
        expect(listing.assetData.subscribers).toBe(55000);
        expect(listing.assetType).toBe('youtube');
    });

    it('un listing no confidencial expone todo y no declara campos ocultos', async () => {
        const seller = await crearUsuario('seller@test.com', UserRole.SELLER);
        await crearListingPublicado(seller.id, false);

        const res = await app.inject({ method: 'GET', url: '/listings' });
        const [listing] = res.json();

        expect(listing.isBlind).toBe(false);
        expect(listing.hiddenFields).toHaveLength(0);
        expect(listing.assetData.monthlyRevenueUsdCents).toBe(120000);
    });
});

describe('GET /listings — filtros', () => {
    it('filtra por tipo de activo', async () => {
        const seller = await crearUsuario('seller@test.com', UserRole.SELLER);
        await crearListingPublicado(seller.id, false);

        const conYoutube = await app.inject({ method: 'GET', url: '/listings?assetType=youtube' });
        const conWeb = await app.inject({ method: 'GET', url: '/listings?assetType=web' });

        expect(conYoutube.json()).toHaveLength(1);
        expect(conWeb.json()).toHaveLength(0);
    });

    it('filtra por rango de precio en centavos', async () => {
        const seller = await crearUsuario('seller@test.com', UserRole.SELLER);
        await crearListingPublicado(seller.id, false); // 1.500.000 centavos

        const dentro = await app.inject({ method: 'GET', url: '/listings?minPrice=1000000&maxPrice=2000000' });
        const fuera = await app.inject({ method: 'GET', url: '/listings?minPrice=2000000' });

        expect(dentro.json()).toHaveLength(1);
        expect(fuera.json()).toHaveLength(0);
    });

    it('400 si el rango está invertido', async () => {
        const res = await app.inject({ method: 'GET', url: '/listings?minPrice=900000&maxPrice=100000' });

        expect(res.statusCode).toBe(400);
        expect(res.json().code).toBe('VALIDATION');
    });

    /**
     * Antes el repositorio hacía spread del objeto de filtros dentro del
     * `where` de Prisma: una clave arbitraria del cliente llegaba a la
     * consulta. El schema del query la descarta y el repositorio traduce
     * criterio por criterio.
     */
    it('ignora un parámetro que no está en el contrato', async () => {
        const seller = await crearUsuario('seller@test.com', UserRole.SELLER);
        await crearListingPublicado(seller.id, false);

        const res = await app.inject({ method: 'GET', url: '/listings?sellerId=cualquiera' });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toHaveLength(1);
    });
});

describe('POST /listings', () => {
    it('crea un listing en draft desde el JSON del activo', async () => {
        await crearUsuario('seller@test.com', UserRole.SELLER);

        const res = await app.inject({
            method: 'POST',
            url: '/listings',
            headers: { authorization: `Bearer ${await tokenDe('seller@test.com')}` },
            payload: {
                assetType: 'youtube',
                assetData: {
                    monthlyRevenueUsdCents: 120000,
                    currency: 'USD',
                    subscribers: 55000,
                    isMonetized: true,
                },
                askingPrice: { cents: 1500000, currency: 'USD' },
                isBlind: true,
            },
        });

        expect(res.statusCode).toBe(201);
        expect(res.json().status).toBe('draft');
        // El precio estimado lo calcula la strategy, no el cliente.
        expect(res.json().estimatedPrice.cents).toBeGreaterThan(0);
    });

    it('400 ante un tipo de activo desconocido', async () => {
        await crearUsuario('seller@test.com', UserRole.SELLER);

        const res = await app.inject({
            method: 'POST',
            url: '/listings',
            headers: { authorization: `Bearer ${await tokenDe('seller@test.com')}` },
            payload: {
                assetType: 'podcast',
                assetData: {},
                askingPrice: { cents: 1500000, currency: 'USD' },
                isBlind: false,
            },
        });

        expect(res.statusCode).toBe(400);
        expect(res.json().code).toBe('VALIDATION');
    });

    it('400 cuando falta un campo que la strategy requiere', async () => {
        await crearUsuario('seller@test.com', UserRole.SELLER);

        const res = await app.inject({
            method: 'POST',
            url: '/listings',
            headers: { authorization: `Bearer ${await tokenDe('seller@test.com')}` },
            payload: {
                assetType: 'youtube',
                assetData: { monthlyRevenueUsdCents: 120000, isMonetized: true },
                askingPrice: { cents: 1500000, currency: 'USD' },
                isBlind: false,
            },
        });

        expect(res.statusCode).toBe(400);
        expect(res.json().message).toContain('subscribers');
    });

    it('401 sin token', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/listings',
            payload: {
                assetType: 'youtube',
                assetData: {},
                askingPrice: { cents: 1, currency: 'USD' },
                isBlind: false,
            },
        });

        expect(res.statusCode).toBe(401);
    });
});

describe('Verificación de identidad', () => {
    /**
     * El agujero que esto tapa: un usuario recién registrado no tenía forma
     * de verificarse, y el KYC bloquea publicar y firmar. Quedaba trabado sin
     * salida.
     */
    it('un usuario nuevo arranca sin verificar y no puede firmar', async () => {
        const seller = await crearUsuario('otro@test.com', UserRole.SELLER);
        const listing = await crearListingPublicado(seller.id, true);
        await crearUsuario('nuevo@test.com', UserRole.BUYER, false);
        const token = await tokenDe('nuevo@test.com');

        const perfil = await app.inject({
            method: 'GET',
            url: '/me',
            headers: { authorization: `Bearer ${token}` },
        });
        expect(perfil.json().isKycVerified).toBe(false);

        const firma = await app.inject({
            method: 'POST',
            url: `/listings/${listing.id.toString()}/nda`,
            headers: { authorization: `Bearer ${token}` },
        });
        expect(firma.statusCode).toBe(403);
    });

    it('verificar la identidad desbloquea la firma', async () => {
        const seller = await crearUsuario('otro@test.com', UserRole.SELLER);
        const listing = await crearListingPublicado(seller.id, true);
        await crearUsuario('nuevo@test.com', UserRole.BUYER, false);
        const token = await tokenDe('nuevo@test.com');

        const kyc = await app.inject({
            method: 'POST',
            url: '/me/kyc',
            headers: { authorization: `Bearer ${token}` },
            payload: { dni: '20.123.456', country: 'AR' },
        });

        expect(kyc.statusCode).toBe(200);
        expect(kyc.json().isKycVerified).toBe(true);
        // Se guarda normalizado, sin puntos.
        expect(kyc.json().dni).toBe('20123456');

        const firma = await app.inject({
            method: 'POST',
            url: `/listings/${listing.id.toString()}/nda`,
            headers: { authorization: `Bearer ${token}` },
        });
        expect(firma.statusCode).toBe(201);
    });

    it('400 ante un documento inválido', async () => {
        await crearUsuario('nuevo@test.com', UserRole.BUYER, false);

        const res = await app.inject({
            method: 'POST',
            url: '/me/kyc',
            headers: { authorization: `Bearer ${await tokenDe('nuevo@test.com')}` },
            payload: { dni: 'ABC123' },
        });

        expect(res.statusCode).toBe(400);
        expect(res.json().code).toBe('VALIDATION');
    });

    it('409 al intentar verificar dos veces', async () => {
        await crearUsuario('yaverificado@test.com', UserRole.BUYER, true);

        const res = await app.inject({
            method: 'POST',
            url: '/me/kyc',
            headers: { authorization: `Bearer ${await tokenDe('yaverificado@test.com')}` },
            payload: { dni: '20123456' },
        });

        expect(res.statusCode).toBe(409);
    });

    it('el perfil nunca devuelve el hash de la contraseña', async () => {
        await crearUsuario('alguien@test.com', UserRole.BUYER);

        const res = await app.inject({
            method: 'GET',
            url: '/me',
            headers: { authorization: `Bearer ${await tokenDe('alguien@test.com')}` },
        });

        expect(res.json()).not.toHaveProperty('passwordHash');
    });
});

describe('Convergencia de la negociación', () => {
    /**
     * La regla vive en la entidad; acá se verifica que llegue al cliente como
     * un 409 y no como un 500.
     */
    async function unaNegociacionAbierta() {
        const seller = await crearUsuario('seller@test.com', UserRole.SELLER);
        await crearUsuario('buyer@test.com', UserRole.BUYER);
        const listing = await crearListingPublicado(seller.id, false);
        const tokenBuyer = await tokenDe('buyer@test.com');

        const oferta = await app.inject({
            method: 'POST',
            url: `/listings/${listing.id.toString()}/offers`,
            headers: { authorization: `Bearer ${tokenBuyer}` },
            payload: { offerPrice: { cents: 1_000_000, currency: 'USD' } },
        });

        return {
            operationId: oferta.json().id,
            tokenBuyer,
            tokenSeller: await tokenDe('seller@test.com'),
        };
    }

    it('el vendedor puede contraofertar libre la primera vez', async () => {
        const { operationId, tokenSeller } = await unaNegociacionAbierta();

        const res = await app.inject({
            method: 'POST',
            url: `/operations/${operationId}/counter`,
            headers: { authorization: `Bearer ${tokenSeller}` },
            payload: { price: { cents: 1_800_000, currency: 'USD' } },
        });

        expect(res.statusCode).toBe(204);
    });

    it('409 si el comprador contraoferta por debajo de su oferta anterior', async () => {
        const { operationId, tokenBuyer, tokenSeller } = await unaNegociacionAbierta();

        await app.inject({
            method: 'POST',
            url: `/operations/${operationId}/counter`,
            headers: { authorization: `Bearer ${tokenSeller}` },
            payload: { price: { cents: 1_800_000, currency: 'USD' } },
        });

        const res = await app.inject({
            method: 'POST',
            url: `/operations/${operationId}/counter`,
            headers: { authorization: `Bearer ${tokenBuyer}` },
            payload: { price: { cents: 900_000, currency: 'USD' } },
        });

        expect(res.statusCode).toBe(409);
        expect(res.json().code).toBe('INVALID_STATE');
    });

    it('409 si el vendedor sube respecto de su contraoferta anterior', async () => {
        const { operationId, tokenBuyer, tokenSeller } = await unaNegociacionAbierta();

        await app.inject({
            method: 'POST',
            url: `/operations/${operationId}/counter`,
            headers: { authorization: `Bearer ${tokenSeller}` },
            payload: { price: { cents: 1_800_000, currency: 'USD' } },
        });
        await app.inject({
            method: 'POST',
            url: `/operations/${operationId}/counter`,
            headers: { authorization: `Bearer ${tokenBuyer}` },
            payload: { price: { cents: 1_300_000, currency: 'USD' } },
        });

        const res = await app.inject({
            method: 'POST',
            url: `/operations/${operationId}/counter`,
            headers: { authorization: `Bearer ${tokenSeller}` },
            payload: { price: { cents: 1_900_000, currency: 'USD' } },
        });

        expect(res.statusCode).toBe(409);
    });

    it('una negociación que converge llega hasta el final', async () => {
        const { operationId, tokenBuyer, tokenSeller } = await unaNegociacionAbierta();

        const paso = (token: string, cents: number) =>
            app.inject({
                method: 'POST',
                url: `/operations/${operationId}/counter`,
                headers: { authorization: `Bearer ${token}` },
                payload: { price: { cents, currency: 'USD' } },
            });

        expect((await paso(tokenSeller, 1_800_000)).statusCode).toBe(204);
        expect((await paso(tokenBuyer, 1_300_000)).statusCode).toBe(204);
        expect((await paso(tokenSeller, 1_600_000)).statusCode).toBe(204);
        expect((await paso(tokenBuyer, 1_500_000)).statusCode).toBe(204);

        const detalle = await app.inject({
            method: 'GET',
            url: `/operations/${operationId}`,
            headers: { authorization: `Bearer ${tokenSeller}` },
        });

        expect(detalle.json().negotiations).toHaveLength(5);
        expect(detalle.json().currentOfferPrice.cents).toBe(1_500_000);
    });
});

describe('Avisos', () => {
    /**
     * El aviso es lo que hace que la negociación funcione sin que las partes
     * tengan que estar mirando la pantalla.
     */
    it('ofertar le deja un aviso al vendedor, no al comprador', async () => {
        const seller = await crearUsuario('seller@test.com', UserRole.SELLER);
        await crearUsuario('buyer@test.com', UserRole.BUYER);
        const listing = await crearListingPublicado(seller.id, false);

        await app.inject({
            method: 'POST',
            url: `/listings/${listing.id.toString()}/offers`,
            headers: { authorization: `Bearer ${await tokenDe('buyer@test.com')}` },
            payload: { offerPrice: { cents: 1_000_000, currency: 'USD' } },
        });

        const delVendedor = await app.inject({
            method: 'GET',
            url: '/me/notifications',
            headers: { authorization: `Bearer ${await tokenDe('seller@test.com')}` },
        });
        const delComprador = await app.inject({
            method: 'GET',
            url: '/me/notifications',
            headers: { authorization: `Bearer ${await tokenDe('buyer@test.com')}` },
        });

        expect(delVendedor.json().sinLeer).toBe(1);
        expect(delVendedor.json().items[0].type).toBe('oferta_recibida');
        expect(delVendedor.json().items[0].amount.cents).toBe(1_000_000);
        expect(delComprador.json().sinLeer).toBe(0);
    });

    it('marcar leído baja el contador', async () => {
        const seller = await crearUsuario('seller@test.com', UserRole.SELLER);
        await crearUsuario('buyer@test.com', UserRole.BUYER);
        const listing = await crearListingPublicado(seller.id, false);
        const tokenSeller = await tokenDe('seller@test.com');

        await app.inject({
            method: 'POST',
            url: `/listings/${listing.id.toString()}/offers`,
            headers: { authorization: `Bearer ${await tokenDe('buyer@test.com')}` },
            payload: { offerPrice: { cents: 1_000_000, currency: 'USD' } },
        });

        const bandeja = await app.inject({
            method: 'GET',
            url: '/me/notifications',
            headers: { authorization: `Bearer ${tokenSeller}` },
        });
        const avisoId = bandeja.json().items[0].id;

        const marcado = await app.inject({
            method: 'POST',
            url: `/me/notifications/${avisoId}/read`,
            headers: { authorization: `Bearer ${tokenSeller}` },
        });
        expect(marcado.statusCode).toBe(204);

        const despues = await app.inject({
            method: 'GET',
            url: '/me/notifications',
            headers: { authorization: `Bearer ${tokenSeller}` },
        });
        expect(despues.json().sinLeer).toBe(0);
    });

    /** El id es adivinable: sin el chequeo de pertenencia sería un agujero. */
    it('403 al marcar leído un aviso ajeno', async () => {
        const seller = await crearUsuario('seller@test.com', UserRole.SELLER);
        await crearUsuario('buyer@test.com', UserRole.BUYER);
        await crearUsuario('curioso@test.com', UserRole.BUYER);
        const listing = await crearListingPublicado(seller.id, false);

        await app.inject({
            method: 'POST',
            url: `/listings/${listing.id.toString()}/offers`,
            headers: { authorization: `Bearer ${await tokenDe('buyer@test.com')}` },
            payload: { offerPrice: { cents: 1_000_000, currency: 'USD' } },
        });

        const bandeja = await app.inject({
            method: 'GET',
            url: '/me/notifications',
            headers: { authorization: `Bearer ${await tokenDe('seller@test.com')}` },
        });

        const res = await app.inject({
            method: 'POST',
            url: `/me/notifications/${bandeja.json().items[0].id}/read`,
            headers: { authorization: `Bearer ${await tokenDe('curioso@test.com')}` },
        });

        expect(res.statusCode).toBe(403);
    });

});

describe('Documento del contrato', () => {
    /**
     * Antes el documento se generaba, se hasheaba y nadie lo veía. Firmar algo
     * que no se puede leer es apenas mejor que firmar nada.
     */
    async function unNdaFirmado() {
        const seller = await crearUsuario('seller@test.com', UserRole.SELLER);
        await crearUsuario('buyer@test.com', UserRole.BUYER);
        const listing = await crearListingPublicado(seller.id, true);
        const token = await tokenDe('buyer@test.com');

        const firma = await app.inject({
            method: 'POST',
            url: `/listings/${listing.id.toString()}/nda`,
            headers: { authorization: `Bearer ${token}` },
        });

        return { contractId: firma.json().id, token };
    }

    it('el firmante puede leer el documento y su huella coincide', async () => {
        const { contractId, token } = await unNdaFirmado();

        const res = await app.inject({
            method: 'GET',
            url: `/contracts/${contractId}/documento`,
            headers: { authorization: `Bearer ${token}` },
        });

        expect(res.statusCode).toBe(200);
        const doc = res.json();

        expect(doc.text).toContain('ACUERDO DE CONFIDENCIALIDAD');
        expect(doc.hash).toMatch(/^[0-9a-f]{64}$/);
        expect(doc.signed).toBe(true);

        // Lo que se regenera es exactamente lo que se firmó.
        expect(doc.matches).toBe(true);
        expect(doc.signedHash).toBe(doc.hash);
    });

    it('el documento arranca con el aviso de borrador', async () => {
        const { contractId, token } = await unNdaFirmado();

        const res = await app.inject({
            method: 'GET',
            url: `/contracts/${contractId}/documento`,
            headers: { authorization: `Bearer ${token}` },
        });

        expect(res.json().text.startsWith('DOCUMENTO EN BORRADOR')).toBe(true);
    });

    it('403 para quien no es parte del acuerdo', async () => {
        const { contractId } = await unNdaFirmado();
        await crearUsuario('ajeno@test.com', UserRole.BUYER);

        const res = await app.inject({
            method: 'GET',
            url: `/contracts/${contractId}/documento`,
            headers: { authorization: `Bearer ${await tokenDe('ajeno@test.com')}` },
        });

        expect(res.statusCode).toBe(403);
    });

    it('401 sin sesión', async () => {
        const { contractId } = await unNdaFirmado();

        const res = await app.inject({
            method: 'GET',
            url: `/contracts/${contractId}/documento`,
        });

        expect(res.statusCode).toBe(401);
    });
});

/**
 * Confirmar la custodia dejó de ser un botón: el admin declara qué verificó.
 * La ruta se probó aparte del resto de los pasos porque es la única con cuerpo.
 */
describe('POST /operations/:id/custody', () => {
    async function unaOperacionEnTransferencia(): Promise<string> {
        const buyer = await crearUsuario('buyer-cust@test.com', UserRole.BUYER);
        const seller = await crearUsuario('seller-cust@test.com', UserRole.SELLER);
        await crearUsuario('admin-cust@test.com', UserRole.ADMIN);
        const listing = await crearListingPublicado(seller.id);

        const operation = Operation.create({
            listingId: listing.id,
            buyerId: buyer.id,
            sellerId: seller.id,
            offerPrice: Money.fromCents(1500000, 'USD'),
        });
        operation.acceptCurrentOffer('seller');
        operation.signContract();
        operation.initiateTransfer();
        await new PrismaOperationRepository().save(operation);

        return operation.id.toString();
    }

    const verificacion = {
        isPrimaryOwner: true,
        accessSecured: true,
        metrics: { suscriptores: 55000 },
        notes: 'Sin strikes activos.',
    };

    async function confirmar(id: string, email: string, payload: unknown) {
        return app.inject({
            method: 'POST',
            url: `/operations/${id}/custody`,
            headers: { authorization: `Bearer ${await tokenDe(email)}` },
            payload,
        });
    }

    it('registra la constancia y la devuelve en el detalle', async () => {
        const id = await unaOperacionEnTransferencia();

        const res = await confirmar(id, 'admin-cust@test.com', verificacion);
        expect(res.statusCode).toBe(204);

        const detalle = await app.inject({
            method: 'GET',
            url: `/operations/${id}`,
            headers: { authorization: `Bearer ${await tokenDe('buyer-cust@test.com')}` },
        });

        const cuerpo = detalle.json();
        expect(cuerpo.status).toBe('asset_in_custody');
        expect(cuerpo.custody.metrics.suscriptores).toBe(55000);
        expect(cuerpo.custody.verifiedAt).toEqual(expect.any(String));
    });

    /**
     * El hallazgo de la investigación llega hasta acá: mientras la plataforma
     * sea propietaria pero no principal, el vendedor puede expulsarla. Declarar
     * la custodia ahí habilitaría el pedido de pago sobre un activo que todavía
     * puede volverse atrás.
     */
    it('409 si la plataforma todavía no es propietaria principal', async () => {
        const id = await unaOperacionEnTransferencia();

        const res = await confirmar(id, 'admin-cust@test.com', {
            ...verificacion,
            isPrimaryOwner: false,
        });

        expect(res.statusCode).toBe(409);
        expect(res.json().code).toBe('INVALID_STATE');
    });

    it('400 si falta declarar qué se verificó', async () => {
        const id = await unaOperacionEnTransferencia();

        const res = await confirmar(id, 'admin-cust@test.com', {});

        expect(res.statusCode).toBe(400);
    });

    it('403 si quien confirma no es admin', async () => {
        const id = await unaOperacionEnTransferencia();

        const res = await confirmar(id, 'seller-cust@test.com', verificacion);

        expect(res.statusCode).toBe(403);
    });
});

/**
 * El acceso de la plataforma al activo: lo único que habilita firmar el
 * tripartito, y lo único de todo el flujo que ninguna API puede comprobar.
 */
describe('POST y DELETE /admin/listings/:id/acceso', () => {
    const DIA = 24 * 60 * 60 * 1000;

    async function unListingPublicado(): Promise<string> {
        const seller = await crearUsuario('seller-acc@test.com', UserRole.SELLER);
        await crearUsuario('admin-acc@test.com', UserRole.ADMIN);
        const listing = await crearListingPublicado(seller.id);
        return listing.id.toString();
    }

    async function registrar(id: string, email: string, payload: unknown) {
        return app.inject({
            method: 'POST',
            url: `/admin/listings/${id}/acceso`,
            headers: { authorization: `Bearer ${await tokenDe(email)}` },
            payload,
        });
    }

    it('registra el acceso y el listing queda transferible pasado el plazo', async () => {
        const id = await unListingPublicado();

        const res = await registrar(id, 'admin-acc@test.com', {
            accessSince: new Date(Date.now() - 9 * DIA).toISOString(),
        });
        expect(res.statusCode).toBe(204);

        const detalle = await app.inject({ method: 'GET', url: `/listings/${id}` });
        expect(detalle.json().transferable).toBe(true);
    });

    it('dentro del plazo devuelve la fecha en que va a poder transferirse', async () => {
        const id = await unListingPublicado();

        await registrar(id, 'admin-acc@test.com', {
            accessSince: new Date(Date.now() - 2 * DIA).toISOString(),
        });

        const cuerpo = (await app.inject({ method: 'GET', url: `/listings/${id}` })).json();
        expect(cuerpo.transferable).toBe(false);
        expect(cuerpo.transferableFrom).toEqual(expect.any(String));
    });

    it('sin acceso registrado no promete ninguna fecha', async () => {
        const id = await unListingPublicado();

        const cuerpo = (await app.inject({ method: 'GET', url: `/listings/${id}` })).json();
        expect(cuerpo.transferable).toBe(false);
        expect(cuerpo.transferableFrom).toBeUndefined();
    });

    it('400 si la fecha de acceso es futura', async () => {
        const id = await unListingPublicado();

        const res = await registrar(id, 'admin-acc@test.com', {
            accessSince: new Date(Date.now() + DIA).toISOString(),
        });

        expect(res.statusCode).toBe(400);
        expect(res.json().code).toBe('VALIDATION');
    });

    it('403 si quien registra no es admin', async () => {
        const id = await unListingPublicado();

        const res = await registrar(id, 'seller-acc@test.com', {
            accessSince: new Date(Date.now() - DIA).toISOString(),
        });

        expect(res.statusCode).toBe(403);
    });

    it('revocar devuelve el listing a no transferible', async () => {
        const id = await unListingPublicado();
        await registrar(id, 'admin-acc@test.com', {
            accessSince: new Date(Date.now() - 9 * DIA).toISOString(),
        });

        const res = await app.inject({
            method: 'DELETE',
            url: `/admin/listings/${id}/acceso`,
            headers: { authorization: `Bearer ${await tokenDe('admin-acc@test.com')}` },
        });
        expect(res.statusCode).toBe(204);

        const cuerpo = (await app.inject({ method: 'GET', url: `/listings/${id}` })).json();
        expect(cuerpo.transferable).toBe(false);
        expect(cuerpo.transferableFrom).toBeUndefined();
    });
});

/**
 * La verificación contra YouTube. En los tests no hay `YOUTUBE_API_KEY`, así
 * que el contenedor la deja apagada: la ruta tiene que decirlo con claridad en
 * vez de fallar con un 500, y la autorización se resuelve antes de necesitar
 * la clave para nada.
 */
describe('POST /listings/:id/verificar-metricas', () => {
    it('503 mientras la integración no esté configurada', async () => {
        const seller = await crearUsuario('seller-yt@test.com', UserRole.SELLER);
        const listing = await crearListingPublicado(seller.id);

        const res = await app.inject({
            method: 'POST',
            url: `/listings/${listing.id.toString()}/verificar-metricas`,
            headers: { authorization: `Bearer ${await tokenDe('seller-yt@test.com')}` },
        });

        expect(res.statusCode).toBe(503);
    });

    it('401 sin sesión', async () => {
        const seller = await crearUsuario('seller-yt2@test.com', UserRole.SELLER);
        const listing = await crearListingPublicado(seller.id);

        const res = await app.inject({
            method: 'POST',
            url: `/listings/${listing.id.toString()}/verificar-metricas`,
        });

        expect(res.statusCode).toBe(401);
    });
});

/**
 * El consentimiento de Google. En los tests no hay cliente de OAuth
 * configurado, así que ambas rutas tienen que decirlo con claridad —503, no un
 * 500— y la autenticación tiene que resolverse antes de necesitarlo.
 */
describe('Verificación de titularidad con Google', () => {
    async function unListing(): Promise<string> {
        const seller = await crearUsuario('seller-own@test.com', UserRole.SELLER);
        const listing = await crearListingPublicado(seller.id);
        return listing.id.toString();
    }

    it('503 al pedir la dirección de autorización sin credenciales', async () => {
        const id = await unListing();

        const res = await app.inject({
            method: 'GET',
            url: `/listings/${id}/autorizacion/youtube`,
            headers: { authorization: `Bearer ${await tokenDe('seller-own@test.com')}` },
        });

        expect(res.statusCode).toBe(503);
    });

    it('503 al completar la verificación sin credenciales', async () => {
        const id = await unListing();

        const res = await app.inject({
            method: 'POST',
            url: `/listings/${id}/verificar/youtube`,
            headers: { authorization: `Bearer ${await tokenDe('seller-own@test.com')}` },
            payload: { code: 'un-codigo' },
        });

        expect(res.statusCode).toBe(503);
    });

    it('400 si no viene el código', async () => {
        const id = await unListing();

        const res = await app.inject({
            method: 'POST',
            url: `/listings/${id}/verificar/youtube`,
            headers: { authorization: `Bearer ${await tokenDe('seller-own@test.com')}` },
            payload: {},
        });

        expect(res.statusCode).toBe(400);
    });

    it('401 sin sesión', async () => {
        const id = await unListing();

        const res = await app.inject({ method: 'GET', url: `/listings/${id}/autorizacion/youtube` });

        expect(res.statusCode).toBe(401);
    });
});

/**
 * Las denuncias y el legajo. Lo que se prueba acá es quién puede abrir una,
 * cuándo, y —lo más importante— que el denunciado vea la misma evidencia que
 * quien lo denunció.
 */
describe('Denuncias y legajo', () => {
    const DETALLE = 'El canal factura mucho menos de lo que decía la publicación al momento de la oferta.';

    async function unaOperacionFirmada(): Promise<string> {
        const seller = await crearUsuario('seller-den@test.com', UserRole.SELLER);
        const buyer = await crearUsuario('buyer-den@test.com', UserRole.BUYER);
        await crearUsuario('ajeno-den@test.com', UserRole.BUYER);
        const listing = await crearListingPublicado(seller.id);

        const operation = Operation.create({
            listingId: listing.id,
            buyerId: buyer.id,
            sellerId: seller.id,
            offerPrice: Money.fromCents(1500000, 'USD'),
        });
        operation.acceptCurrentOffer('seller');
        operation.signContract();
        await new PrismaOperationRepository().save(operation);

        return operation.id.toString();
    }

    async function denunciar(operationId: string, email: string) {
        return app.inject({
            method: 'POST',
            url: '/reports',
            headers: { authorization: `Bearer ${await tokenDe(email)}` },
            payload: { operationId, reason: 'ingreso_falso', detail: DETALLE },
        });
    }

    it('el comprador denuncia y queda asentado contra el vendedor', async () => {
        const id = await unaOperacionFirmada();

        const res = await denunciar(id, 'buyer-den@test.com');

        expect(res.statusCode).toBe(201);
        expect(res.json().status).toBe('open');
        expect(res.json().miRol).toBe('denunciante');
    });

    it('400 si el detalle es demasiado corto para sostener nada', async () => {
        const id = await unaOperacionFirmada();

        const res = await app.inject({
            method: 'POST',
            url: '/reports',
            headers: { authorization: `Bearer ${await tokenDe('buyer-den@test.com')}` },
            payload: { operationId: id, reason: 'otro', detail: 'me estafaron' },
        });

        expect(res.statusCode).toBe(400);
    });

    it('403 si quien denuncia no es parte de la operación', async () => {
        const id = await unaOperacionFirmada();

        const res = await denunciar(id, 'ajeno-den@test.com');

        expect(res.statusCode).toBe(403);
    });

    /**
     * La prueba que le da sentido al sistema: el denunciado accede al mismo
     * legajo. Un reclamo que la otra parte no puede ver ni responder no sirve.
     */
    it('el denunciado ve el mismo legajo que quien lo denunció', async () => {
        const id = await unaOperacionFirmada();
        const reportId = (await denunciar(id, 'buyer-den@test.com')).json().id;

        const res = await app.inject({
            method: 'GET',
            url: `/reports/${reportId}/legajo`,
            headers: { authorization: `Bearer ${await tokenDe('seller-den@test.com')}` },
        });

        expect(res.statusCode).toBe(200);
        const legajo = res.json();
        expect(legajo.reporter.fullName).toEqual(expect.any(String));
        expect(legajo.reported.fullName).toEqual(expect.any(String));
        expect(legajo.negotiations.length).toBeGreaterThan(0);
    });

    it('403 si un tercero pide el legajo', async () => {
        const id = await unaOperacionFirmada();
        const reportId = (await denunciar(id, 'buyer-den@test.com')).json().id;

        const res = await app.inject({
            method: 'GET',
            url: `/reports/${reportId}/legajo`,
            headers: { authorization: `Bearer ${await tokenDe('ajeno-den@test.com')}` },
        });

        expect(res.statusCode).toBe(403);
    });

    it('la denuncia aparece en la lista de las dos partes', async () => {
        const id = await unaOperacionFirmada();
        await denunciar(id, 'buyer-den@test.com');

        for (const [email, rol] of [
            ['buyer-den@test.com', 'denunciante'],
            ['seller-den@test.com', 'denunciado'],
        ]) {
            const res = await app.inject({
                method: 'GET',
                url: '/me/reports',
                headers: { authorization: `Bearer ${await tokenDe(email)}` },
            });

            expect(res.json()).toHaveLength(1);
            expect(res.json()[0].miRol).toBe(rol);
        }
    });

    it('solo quien la abrió puede cerrarla', async () => {
        const id = await unaOperacionFirmada();
        const reportId = (await denunciar(id, 'buyer-den@test.com')).json().id;

        const rechazado = await app.inject({
            method: 'POST',
            url: `/reports/${reportId}/cerrar`,
            headers: { authorization: `Bearer ${await tokenDe('seller-den@test.com')}` },
            payload: { reason: 'Que se cierre.' },
        });
        expect(rechazado.statusCode).toBe(403);

        const aceptado = await app.inject({
            method: 'POST',
            url: `/reports/${reportId}/cerrar`,
            headers: { authorization: `Bearer ${await tokenDe('buyer-den@test.com')}` },
            payload: { reason: 'Nos arreglamos.' },
        });
        expect(aceptado.statusCode).toBe(204);
    });
});

/**
 * El webhook de MercadoPago. Siempre responde 200: devolver un 500 haría que
 * la pasarela reintente indefinidamente un aviso que no vamos a poder procesar.
 */
describe('POST /webhooks/mercadopago', () => {
    it('acepta el aviso sin autenticación de usuario: lo llama MercadoPago', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/webhooks/mercadopago',
            payload: { type: 'payment', data: { id: '1234567890' } },
        });

        expect(res.statusCode).toBe(200);
    });

    it('responde 200 aunque el aviso venga sin identificador', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/webhooks/mercadopago',
            payload: { type: 'payment' },
        });

        expect(res.statusCode).toBe(200);
    });

    it('ignora los avisos que no son de pago', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/webhooks/mercadopago',
            payload: { type: 'plan', data: { id: '1' } },
        });

        expect(res.statusCode).toBe(200);
    });
});

describe('POST /operations/:id/checkout', () => {
    it('503 mientras MercadoPago no esté configurado', async () => {
        const seller = await crearUsuario('seller-mp@test.com', UserRole.SELLER);
        const buyer = await crearUsuario('buyer-mp@test.com', UserRole.BUYER);
        const listing = await crearListingPublicado(seller.id);

        const operation = Operation.create({
            listingId: listing.id,
            buyerId: buyer.id,
            sellerId: seller.id,
            offerPrice: Money.fromCents(1000000, 'USD'),
        });
        await new PrismaOperationRepository().save(operation);

        const res = await app.inject({
            method: 'POST',
            url: `/operations/${operation.id.toString()}/checkout`,
            headers: { authorization: `Bearer ${await tokenDe('buyer-mp@test.com')}` },
        });

        expect(res.statusCode).toBe(503);
    });
});

describe('GET /health', () => {
    it('responde ok', async () => {
        const res = await app.inject({ method: 'GET', url: '/health' });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ status: 'ok' });
    });
});
