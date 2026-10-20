import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError } from '@marketplace/api-client';
import {
    ACCESS_STATE_COOKIE,
    createAccessVerificationState,
    listingIdFromAccessState,
    parseAccessResult,
    accessResultAlert,
    isOtherAccountMessage,
} from '@/lib/platformAccessVerification';

/**
 * La verificación del acceso con la cuenta de custodia usa el mismo callback
 * de Google que el resto, pero con un `state` propio: `acceso:<activo>:<azar>`.
 * Ata la vuelta al activo del que salió y a la cookie del navegador del admin.
 */

const platformAccessAuthorization = vi.fn();
const rejectPlatformAccessRequestApi = vi.fn();
const cookieSet = vi.fn();

vi.mock('next/headers', () => ({ cookies: async () => ({ set: cookieSet }) }));
vi.mock('next/navigation', () => ({
    redirect: (url: string) => {
        throw new Error(`NEXT_REDIRECT:${url}`);
    },
}));
vi.mock('@/lib/guards', () => ({ requireAdmin: async () => ({ id: 'admin-1' }) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/api', () => ({
    api: () => ({ platformAccessAuthorization, rejectPlatformAccessRequest: rejectPlatformAccessRequestApi }),
}));

import { rejectPlatformAccessRequest, startPlatformAccessVerification } from '@/app/admin/actions';

async function redirigeA(promesa: Promise<unknown>): Promise<string> {
    try {
        await promesa;
    } catch (e) {
        if (e instanceof Error && e.message.startsWith('NEXT_REDIRECT:')) {
            return e.message.slice('NEXT_REDIRECT:'.length);
        }
        throw e;
    }
    throw new Error('no redirigió');
}

beforeEach(() => {
    vi.resetAllMocks();
});

describe('state de la verificación del acceso', () => {
    it('lleva el activo y un azar distinto cada vez', () => {
        const a = createAccessVerificationState('l1');
        const b = createAccessVerificationState('l1');

        expect(a.startsWith('acceso:l1:')).toBe(true);
        expect(a).not.toBe(b);
    });

    it('recupera el activo y rechaza lo que no tiene la forma', () => {
        expect(listingIdFromAccessState(createAccessVerificationState('l-9'))).toBe('l-9');
        expect(listingIdFromAccessState('youtube:l1')).toBeUndefined();
        expect(listingIdFromAccessState('acceso::abc')).toBeUndefined();
        expect(listingIdFromAccessState('acceso:l1')).toBeUndefined();
        expect(listingIdFromAccessState('acceso:l1:')).toBeUndefined();
    });
});

describe('resultado de la verificación', () => {
    it('solo reconoce los resultados conocidos', () => {
        expect(parseAccessResult('ok')).toBe('ok');
        expect(parseAccessResult('sin-acceso')).toBe('sin-acceso');
        expect(parseAccessResult('cualquier-cosa')).toBeUndefined();
        expect(parseAccessResult(undefined)).toBeUndefined();
    });

    it('cada resultado tiene un aviso en español, y solo el ok es de éxito', () => {
        expect(accessResultAlert('ok').tone).toBe('ok');
        expect(accessResultAlert('sin-acceso').text).toContain('elegí el canal');
        expect(accessResultAlert('sin-acceso').text).not.toContain('Cuenta de Marca');
        expect(accessResultAlert('sin-acceso', 'Elegiste «A» y el activo es «B».').text).toBe('Elegiste «A» y el activo es «B».');
        expect(accessResultAlert('sin-acceso').tone).toBe('error');
        expect(accessResultAlert('error').tone).toBe('error');
    });

    it('«otra-cuenta» es un error que usa el mensaje de la API y tiene uno propio si falta', () => {
        expect(parseAccessResult('otra-cuenta')).toBe('otra-cuenta');
        const alert = accessResultAlert('otra-cuenta', 'Ingresaste con otra cuenta de Google. Usá la cuenta de custodia (c@t.com).');
        expect(alert.tone).toBe('error');
        expect(alert.text).toContain('(c@t.com)');
        expect(accessResultAlert('otra-cuenta').text).toContain('otra cuenta de Google');
    });

    it('distingue por el mensaje de la API cuándo el 403 es por otra cuenta', () => {
        expect(isOtherAccountMessage('Ingresaste con otra cuenta de Google. Usá la cuenta de custodia (c@t.com).')).toBe(true);
        expect(isOtherAccountMessage('Elegiste «A» y el activo es «B».')).toBe(false);
    });
});

describe('startPlatformAccessVerification', () => {
    it('pide la dirección con el state, guarda la cookie y manda a Google', async () => {
        platformAccessAuthorization.mockResolvedValue({ url: 'https://accounts.google.com/auth' });

        const destino = await redirigeA(startPlatformAccessVerification('l1'));

        expect(destino).toBe('https://accounts.google.com/auth');
        const state = platformAccessAuthorization.mock.calls[0][1];
        expect(platformAccessAuthorization).toHaveBeenCalledWith('l1', state);
        expect(listingIdFromAccessState(state)).toBe('l1');
        expect(cookieSet).toHaveBeenCalledWith(
            ACCESS_STATE_COOKIE,
            state,
            expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/api/youtube' }),
        );
    });

    it('si la API rechaza, vuelve al panel con el motivo y no deja cookie', async () => {
        platformAccessAuthorization.mockRejectedValue(
            new ApiError('INVALID_STATE', 'El vendedor todavía no avisó que invitó a la plataforma.', 409),
        );

        const destino = await redirigeA(startPlatformAccessVerification('l1'));

        expect(destino).toBe(`/admin?acceso=error&activo=l1&${new URLSearchParams({ detalle: 'El vendedor todavía no avisó que invitó a la plataforma.' })}`);
        expect(cookieSet).not.toHaveBeenCalled();
    });

    it('sin credenciales de Google (503) avisa que no está configurado', async () => {
        platformAccessAuthorization.mockRejectedValue(new ApiError('INTERNAL', 'x', 503));

        const destino = await redirigeA(startPlatformAccessVerification('l1'));

        expect(destino).toBe('/admin?acceso=no-configurado&activo=l1');
    });
});

describe('rejectPlatformAccessRequest', () => {
    it('avisa a la API y vuelve al panel con el resultado «rechazado»', async () => {
        rejectPlatformAccessRequestApi.mockResolvedValue(undefined);

        const destino = await redirigeA(rejectPlatformAccessRequest('l1'));

        expect(rejectPlatformAccessRequestApi).toHaveBeenCalledWith('l1');
        expect(destino).toBe('/admin?acceso=rechazado&activo=l1');
        expect(parseAccessResult('rechazado')).toBe('rechazado');
        expect(accessResultAlert('rechazado').text).toContain('vendedor');
    });

    it('si la API rechaza, vuelve al panel con el motivo', async () => {
        rejectPlatformAccessRequestApi.mockRejectedValue(
            new ApiError('INVALID_STATE', 'Este activo no está esperando la verificación del acceso.', 409),
        );

        const destino = await redirigeA(rejectPlatformAccessRequest('l1'));

        expect(destino).toBe(
            `/admin?acceso=error&activo=l1&${new URLSearchParams({ detalle: 'Este activo no está esperando la verificación del acceso.' })}`,
        );
    });
});
