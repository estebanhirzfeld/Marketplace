import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError } from '@marketplace/api-client';

/**
 * La comprobación por DNS son dos acciones: pedir el registro que hay que
 * cargar y preguntar si ya está. Se fija qué ve el vendedor cuando la
 * comprobación no está configurada (503), cuando falla otra cosa y que solo un
 * resultado positivo invalide la pantalla del activo.
 */

const domainOwnershipChallenge = vi.fn();
const verifyDomainOwnership = vi.fn();
const revalidatePath = vi.fn();

vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePath(p) }));
vi.mock('next/headers', () => ({ cookies: async () => ({ set: vi.fn() }) }));
vi.mock('next/navigation', () => ({
    redirect: (url: string) => {
        throw new Error(`NEXT_REDIRECT:${url}`);
    },
}));
vi.mock('@/lib/guards', () => ({ requireCounterparty: async () => ({ id: 'u1' }) }));
vi.mock('@/lib/session', () => ({ currentActor: async () => ({ id: 'u1' }) }));
vi.mock('@/lib/api', () => ({ api: () => ({ domainOwnershipChallenge, verifyDomainOwnership }) }));

import { checkDomainOwnership, getDomainOwnershipChallenge } from '@/app/vender/actions';

const CHALLENGE = {
    domain: 'deliaorrego.online',
    host: '@',
    value: 'traspaso-verificacion=178cd4d4534d977fbdf74f70',
    nameservers: ['dns1.p08.nsone.net'],
    provider: 'hostinger' as const,
};

beforeEach(() => {
    vi.resetAllMocks();
});

describe('getDomainOwnershipChallenge', () => {
    it('devuelve el registro que hay que cargar', async () => {
        domainOwnershipChallenge.mockResolvedValue(CHALLENGE);

        const result = await getDomainOwnershipChallenge('l1');

        expect(domainOwnershipChallenge).toHaveBeenCalledWith('l1');
        expect(result).toEqual({ challenge: CHALLENGE });
    });

    it('sin la verificación configurada (503) explica que no está disponible', async () => {
        domainOwnershipChallenge.mockRejectedValue(
            new ApiError('SERVICE_UNAVAILABLE', 'La verificación por DNS todavía no está configurada.', 503),
        );

        const result = await getDomainOwnershipChallenge('l1');

        expect(result.challenge).toBeUndefined();
        expect(result.error).toBe('La comprobación por DNS todavía no está disponible. Probá más tarde o comprobalo con AdSense.');
    });

    it('otros errores de la API se muestran con su mensaje', async () => {
        domainOwnershipChallenge.mockRejectedValue(new ApiError('INVALID_STATE', 'El dominio no es válido.', 400));

        expect((await getDomainOwnershipChallenge('l1')).error).toBe('El dominio no es válido.');
    });

    it('un fallo de red no se filtra: mensaje genérico', async () => {
        domainOwnershipChallenge.mockRejectedValue(new Error('ECONNREFUSED'));

        expect((await getDomainOwnershipChallenge('l1')).error).toBe('No pudimos consultar tu DNS. Probá de nuevo.');
    });
});

describe('checkDomainOwnership', () => {
    it('verificado: invalida la pantalla del activo', async () => {
        verifyDomainOwnership.mockResolvedValue({ verified: true });

        const state = await checkDomainOwnership('l1', {});

        expect(state).toEqual({ verified: true });
        expect(revalidatePath).toHaveBeenCalledWith('/activos/l1');
    });

    it('todavía no está el registro: no es un error y no invalida nada', async () => {
        verifyDomainOwnership.mockResolvedValue({ verified: false });

        const state = await checkDomainOwnership('l1', {});

        expect(state).toEqual({ verified: false });
        expect(state.error).toBeUndefined();
        expect(revalidatePath).not.toHaveBeenCalled();
    });

    it('sin configurar (503) devuelve el aviso amable', async () => {
        verifyDomainOwnership.mockRejectedValue(new ApiError('SERVICE_UNAVAILABLE', 'x', 503));

        const state = await checkDomainOwnership('l1', {});

        expect(state.verified).toBe(false);
        expect(state.error).toBe('La comprobación por DNS todavía no está disponible. Probá más tarde o comprobalo con AdSense.');
    });

    it('otro error de la API lo muestra con su mensaje', async () => {
        verifyDomainOwnership.mockRejectedValue(new ApiError('FORBIDDEN', 'Solo el vendedor puede comprobarlo.', 403));

        expect((await checkDomainOwnership('l1', {})).error).toBe('Solo el vendedor puede comprobarlo.');
    });

    it('un fallo de red devuelve el mensaje genérico', async () => {
        verifyDomainOwnership.mockRejectedValue(new Error('timeout'));

        expect((await checkDomainOwnership('l1', {})).error).toBe('No pudimos consultar tu DNS. Probá de nuevo.');
    });
});
