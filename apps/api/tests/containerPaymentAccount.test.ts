import { describe, it, expect, afterEach, vi } from 'vitest';
import { createContainer } from '../src/container';

/**
 * El cableado de la vinculación de Mercado Pago según el entorno. No toca la
 * base: armar el contenedor solo construye repositorios.
 */

const CLAVE = Buffer.alloc(32, 7).toString('base64');

function configurar(valores: Record<string, string>) {
    const todas: Record<string, string> = {
        MP_TOKEN_ENCRYPTION_KEY: CLAVE,
        MP_OAUTH_CLIENT_ID: '1234567890',
        MP_OAUTH_CLIENT_SECRET: 'secreto',
        MP_OAUTH_REDIRECT_URI: 'https://traspaso.forzalabs.online/mercadopago/callback',
        ...valores,
    };
    for (const [nombre, valor] of Object.entries(todas)) {
        vi.stubEnv(nombre, valor);
    }
}

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('Contenedor — vinculación de Mercado Pago', () => {
    it('con las tres variables de OAuth y la clave de cifrado arma los casos de uso', () => {
        configurar({});

        const c = createContainer();

        expect(c.mercadoPagoOAuth).toBeDefined();
        expect(c.linkSellerPaymentAccount).toBeDefined();
        expect(c.getSellerPaymentAccountStatus).toBeDefined();
        expect(c.unlinkSellerPaymentAccount).toBeDefined();
        expect(c.getSellerAccessToken).toBeDefined();
    });

    it.each(['MP_OAUTH_CLIENT_ID', 'MP_OAUTH_CLIENT_SECRET', 'MP_OAUTH_REDIRECT_URI'])(
        'si falta %s no arma nada',
        (faltante) => {
            configurar({ [faltante]: '   ' });

            const c = createContainer();

            expect(c.mercadoPagoOAuth).toBeUndefined();
            expect(c.linkSellerPaymentAccount).toBeUndefined();
            expect(c.getSellerPaymentAccountStatus).toBeUndefined();
            expect(c.unlinkSellerPaymentAccount).toBeUndefined();
            expect(c.getSellerAccessToken).toBeUndefined();
        },
    );

    it('sin la clave de cifrado no hay dónde guardar los tokens: no arma nada', () => {
        configurar({ MP_TOKEN_ENCRYPTION_KEY: '' });

        const c = createContainer();

        expect(c.sellerPaymentAccounts).toBeUndefined();
        expect(c.linkSellerPaymentAccount).toBeUndefined();
    });
});
