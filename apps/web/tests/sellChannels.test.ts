import { describe, it, expect } from 'vitest';
import { planYouTubeSell, channelIdOf } from '@/lib/sellChannels';

/**
 * Qué ofrece la tarjeta «Canal de YouTube» según los canales ya conectados y
 * los activos que el vendedor ya tiene sobre ellos.
 */

const A = 'UCaaaaaaaaaaaaaaaaaaaaaa';
const B = 'UCbbbbbbbbbbbbbbbbbbbbbb';
const C = 'UCcccccccccccccccccccccc';

const canal = (channelId: string, channelTitle = `Canal ${channelId.slice(2, 4)}`) => ({ channelId, channelTitle });
const activo = (id: string, channelId: string | undefined, status: string) => ({
    id,
    status,
    channelUrl: channelId ? `https://www.youtube.com/channel/${channelId}` : undefined,
});

describe('channelIdOf', () => {
    it('saca el ID de una dirección con /channel/ y no inventa uno para un handle', () => {
        expect(channelIdOf(`https://www.youtube.com/channel/${A}`)).toBe(A);
        expect(channelIdOf(A)).toBe(A);
        expect(channelIdOf('https://youtube.com/@ejemplo')).toBeUndefined();
        expect(channelIdOf(undefined)).toBeUndefined();
    });
});

describe('planYouTubeSell', () => {
    it('sin canales conectados, conecta', () => {
        expect(planYouTubeSell([], [])).toEqual({ kind: 'connect' });
    });

    it('un canal conectado sin activo se ofrece como hoy', () => {
        const plan = planYouTubeSell([canal(A)], []);

        expect(plan).toEqual({ kind: 'offer', channels: [canal(A)] });
    });

    it.each(['published', 'in_operation', 'sold', 'under_review'])(
        'un canal con un activo %s no se ofrece y, si no queda otro, se conecta uno nuevo',
        (status) => {
            expect(planYouTubeSell([canal(A)], [activo('l1', A, status)])).toEqual({ kind: 'connect' });
        },
    );

    it('de varios canales ofrece solo los que no tienen activo bloqueante', () => {
        const plan = planYouTubeSell(
            [canal(A), canal(B), canal(C)],
            [activo('l1', A, 'published'), activo('l2', B, 'sold')],
        );

        expect(plan).toEqual({ kind: 'offer', channels: [canal(C)] });
    });

    it.each(['draft', 'rejected'])('un canal con un activo en %s lleva a elegir entre continuarlo o publicar otro', (status) => {
        const plan = planYouTubeSell([canal(A, 'Pc Lover')], [activo('l1', A, status)]);

        expect(plan).toEqual({ kind: 'draft-choice', draftListingId: 'l1', channelTitle: 'Pc Lover', offerable: [] });
    });

    it('con un borrador y otro canal libre, el borrador manda y el libre queda como ofrecible', () => {
        const plan = planYouTubeSell([canal(A, 'Pc Lover'), canal(B)], [activo('l1', A, 'draft')]);

        expect(plan).toEqual({
            kind: 'draft-choice',
            draftListingId: 'l1',
            channelTitle: 'Pc Lover',
            offerable: [canal(B)],
        });
    });

    it('si un canal tiene un borrador y uno publicado, no se ofrece ni se retoma el borrador', () => {
        const plan = planYouTubeSell([canal(A)], [activo('l1', A, 'draft'), activo('l2', A, 'published')]);

        expect(plan).toEqual({ kind: 'connect' });
    });

    it('ignora los activos de otros tipos o sin dirección de canal', () => {
        const plan = planYouTubeSell([canal(A)], [activo('l1', undefined, 'published')]);

        expect(plan).toEqual({ kind: 'offer', channels: [canal(A)] });
    });
});
