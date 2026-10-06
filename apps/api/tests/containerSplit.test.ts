import { describe, it, expect, afterEach, vi } from 'vitest';
import { createContainer } from '../src/container';

/**
 * El cableado del cobro con split según el entorno. No toca la base: armar el
 * contenedor solo construye repositorios.
 *
 * Los casos de uso guardan sus dependencias en campos privados; se leen con
 * `Reflect.get` para comprobar qué se cableó de verdad, sin castear tipos.
 */

const CLAVE = Buffer.alloc(32, 7).toString('base64');

const CON_TODO: Record<string, string> = {
    MERCADOPAGO_ACCESS_TOKEN: 'TEST-token-de-la-plataforma',
    MP_TOKEN_ENCRYPTION_KEY: CLAVE,
    MP_OAUTH_CLIENT_ID: '1234567890',
    MP_OAUTH_CLIENT_SECRET: 'secreto',
    MP_OAUTH_REDIRECT_URI: 'https://traspaso.forzalabs.online/mercadopago/callback',
};

function configurar(valores: Record<string, string>) {
    for (const [nombre, valor] of Object.entries({ ...CON_TODO, ...valores })) {
        vi.stubEnv(nombre, valor);
    }
}

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('Contenedor — cobro con split de Mercado Pago', () => {
    it('apagado por defecto: el cobro queda como siempre', () => {
        configurar({ MERCADOPAGO_SPLIT_ENABLED: '' });

        const c = createContainer();

        expect(c.crearCheckout).toBeDefined();
        expect(c.confirmarPagoDePasarela).toBeDefined();
        expect(Reflect.get(c.crearCheckout!, 'sellerTokens')).toBeUndefined();
        expect(Reflect.get(c.confirmarPagoDePasarela!, 'sellerTokens')).toBeUndefined();
        expect(Reflect.get(c.confirmarPagoDePasarela!, 'paymentAccounts')).toBeUndefined();
    });

    it.each(['0', 'false', 'si', 'yes', 'TRUE'])('solo `1` o `true` lo encienden: %s lo deja apagado', (valor) => {
        configurar({ MERCADOPAGO_SPLIT_ENABLED: valor });

        const c = createContainer();

        expect(Reflect.get(c.crearCheckout!, 'sellerTokens')).toBeUndefined();
    });

    it('apagado, no exige OAuth ni la clave de cifrado', () => {
        configurar({
            MERCADOPAGO_SPLIT_ENABLED: '',
            MP_TOKEN_ENCRYPTION_KEY: '',
            MP_OAUTH_CLIENT_ID: '',
        });

        expect(() => createContainer()).not.toThrow();
    });

    it.each(['1', 'true'])('encendido con %s y todos los requisitos cablea el split', (valor) => {
        configurar({ MERCADOPAGO_SPLIT_ENABLED: valor });

        const c = createContainer();

        expect(c.getSellerAccessToken).toBeDefined();
        // La misma instancia en los dos casos de uso: el candado del refresco es uno solo.
        expect(Reflect.get(c.crearCheckout!, 'sellerTokens')).toBe(c.getSellerAccessToken);
        expect(Reflect.get(c.confirmarPagoDePasarela!, 'sellerTokens')).toBe(c.getSellerAccessToken);
        expect(Reflect.get(c.confirmarPagoDePasarela!, 'paymentAccounts')).toBe(c.sellerPaymentAccounts);
        expect(c.sellerPaymentAccounts).toBeDefined();
    });

    it('encendido sin la clave de cifrado no arranca, con un mensaje claro', () => {
        configurar({ MERCADOPAGO_SPLIT_ENABLED: '1', MP_TOKEN_ENCRYPTION_KEY: '' });

        expect(() => createContainer()).toThrow(/MERCADOPAGO_SPLIT_ENABLED.*MP_TOKEN_ENCRYPTION_KEY/s);
    });

    it.each(['MP_OAUTH_CLIENT_ID', 'MP_OAUTH_CLIENT_SECRET', 'MP_OAUTH_REDIRECT_URI'])(
        'encendido sin %s no arranca, con un mensaje claro',
        (faltante) => {
            configurar({ MERCADOPAGO_SPLIT_ENABLED: 'true', [faltante]: '   ' });

            expect(() => createContainer()).toThrow(/MERCADOPAGO_SPLIT_ENABLED.*MP_OAUTH_/s);
        },
    );

    it('el mensaje de error no incluye secretos', () => {
        configurar({ MERCADOPAGO_SPLIT_ENABLED: '1', MP_OAUTH_CLIENT_ID: '' });

        let mensaje = '';
        try {
            createContainer();
        } catch (error) {
            mensaje = (error as Error).message;
        }

        expect(mensaje).not.toContain('secreto');
        expect(mensaje).not.toContain(CLAVE);
        expect(mensaje).not.toContain('TEST-token-de-la-plataforma');
    });
});
