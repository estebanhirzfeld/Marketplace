import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError } from '@marketplace/api-client';

const submitListing = vi.fn();

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/guards', () => ({ requireCounterparty: async () => ({ id: 'u1' }) }));
vi.mock('@/lib/session', () => ({ currentActor: async () => ({ id: 'u1' }) }));
vi.mock('@/lib/api', () => ({ api: () => ({ submitListing }) }));

import { submitForReview } from '@/app/vender/actions';

/**
 * Publicar exige tener la cuenta de Mercado Pago vinculada. Cuando falta, el
 * mensaje de la API ya lo explica; lo que le falta al vendedor es un camino
 * hacia donde se resuelve, no otro cartel.
 */
describe('submitForReview sin cuenta de Mercado Pago vinculada', () => {
    beforeEach(() => {
        submitListing.mockReset();
    });

    it('ofrece ir al panel de Mercado Pago del perfil', async () => {
        submitListing.mockRejectedValue(
            new ApiError(
                'INVALID_STATE',
                'Para publicar tenés que vincular tu cuenta de Mercado Pago: ahí recibís el cobro de tus ventas.',
                409,
            ),
        );

        const estado = await submitForReview('l1', {});

        expect(estado.error).toMatch(/Mercado Pago/);
        expect(estado.next).toEqual({ href: '/perfil#mercadopago', label: 'Vincular Mercado Pago' });
    });

    it('otro estado inválido no manda a vincular nada', async () => {
        submitListing.mockRejectedValue(
            new ApiError('INVALID_STATE', 'Primero verificá la titularidad del activo.', 409),
        );

        const estado = await submitForReview('l1', {});

        expect(estado.error).toBe('Primero verificá la titularidad del activo.');
        expect(estado.next).toBeUndefined();
    });
});
