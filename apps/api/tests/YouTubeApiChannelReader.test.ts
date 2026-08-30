import { describe, it, expect, vi } from 'vitest';
import { YouTubeApiChannelReader } from '../src/adapters/YouTubeApiChannelReader';
import { YouTubeChannelRef } from '@marketplace/domain/src/value-objects/YouTubeChannelRef';

/**
 * El adaptador contra respuestas fabricadas de la API. No pega contra Google:
 * lo que se prueba es la traducción, que es donde están los detalles que
 * rompen —contadores como string, canales que ocultan suscriptores y
 * búsquedas sin resultado que igual devuelven 200.
 */

function respuesta(cuerpo: unknown, status = 200): Response {
    return new Response(status === 204 ? null : JSON.stringify(cuerpo), {
        status,
        headers: { 'content-type': 'application/json' },
    });
}

function unLector(devuelve: Response) {
    const fetchImpl = vi.fn().mockResolvedValue(devuelve);
    return { lector: new YouTubeApiChannelReader('clave-de-prueba', fetchImpl), fetchImpl };
}

const CANAL = {
    id: 'UCq-Fj5jknLsUf-MWSy4_brA',
    snippet: { title: 'Canal de prueba' },
    statistics: {
        subscriberCount: '55400',
        hiddenSubscriberCount: false,
        viewCount: '12000000',
        videoCount: '320',
    },
};

describe('YouTubeApiChannelReader — traducción de la respuesta', () => {
    it('convierte los contadores, que llegan como string', async () => {
        const { lector } = unLector(respuesta({ items: [CANAL] }));

        const foto = await lector.read(YouTubeChannelRef.parse('@canaldeprueba'));

        expect(foto?.subscribers).toBe(55400);
        expect(foto?.views).toBe(12_000_000);
        expect(foto?.publicVideos).toBe(320);
        expect(foto?.channelId).toBe('UCq-Fj5jknLsUf-MWSy4_brA');
        expect(foto?.title).toBe('Canal de prueba');
        expect(foto?.readAt).toBeInstanceOf(Date);
    });

    /**
     * Un canal puede ocultar su número de suscriptores. Devolver cero lo haría
     * pasar por un canal vacío y la comparación lo marcaría como mentira.
     */
    it('deja los suscriptores ausentes si el canal los oculta', async () => {
        const oculto = {
            ...CANAL,
            statistics: { ...CANAL.statistics, hiddenSubscriberCount: true, subscriberCount: '0' },
        };
        const { lector } = unLector(respuesta({ items: [oculto] }));

        const foto = await lector.read(YouTubeChannelRef.parse('@canaldeprueba'));

        expect(foto?.subscribers).toBeUndefined();
        expect(foto?.views).toBe(12_000_000);
    });

    it('no inventa un cero si falta un contador', async () => {
        const sinSubs = { ...CANAL, statistics: { viewCount: '10', videoCount: '2' } };
        const { lector } = unLector(respuesta({ items: [sinSubs] }));

        const foto = await lector.read(YouTubeChannelRef.parse('@canaldeprueba'));

        expect(foto?.subscribers).toBeUndefined();
    });
});

describe('YouTubeApiChannelReader — cómo consulta', () => {
    it('busca por handle cuando la referencia es un handle', async () => {
        const { lector, fetchImpl } = unLector(respuesta({ items: [CANAL] }));

        await lector.read(YouTubeChannelRef.parse('@canaldeprueba'));

        const url = new URL(fetchImpl.mock.calls[0][0]);
        expect(url.searchParams.get('forHandle')).toBe('canaldeprueba');
        expect(url.searchParams.get('id')).toBeNull();
        expect(url.searchParams.get('part')).toBe('snippet,statistics');
    });

    it('busca por id cuando la referencia es un id', async () => {
        const { lector, fetchImpl } = unLector(respuesta({ items: [CANAL] }));

        await lector.read(YouTubeChannelRef.parse('UCq-Fj5jknLsUf-MWSy4_brA'));

        const url = new URL(fetchImpl.mock.calls[0][0]);
        expect(url.searchParams.get('id')).toBe('UCq-Fj5jknLsUf-MWSy4_brA');
        expect(url.searchParams.get('forHandle')).toBeNull();
    });
});

describe('YouTubeApiChannelReader — canales que no están', () => {
    /** Una búsqueda sin resultados responde 200 con la lista vacía. */
    it('devuelve null cuando no hay items', async () => {
        const { lector } = unLector(respuesta({ items: [] }));

        expect(await lector.read(YouTubeChannelRef.parse('@noexiste'))).toBeNull();
    });

    it('devuelve null si la respuesta no trae items', async () => {
        const { lector } = unLector(respuesta({}));

        expect(await lector.read(YouTubeChannelRef.parse('@noexiste'))).toBeNull();
    });

    it('devuelve null ante un 404', async () => {
        const { lector } = unLector(respuesta({}, 404));

        expect(await lector.read(YouTubeChannelRef.parse('@noexiste'))).toBeNull();
    });

    /** Cuota agotada o clave inválida no son "canal inexistente". */
    it('propaga un error de la API sin filtrar el cuerpo', async () => {
        const { lector } = unLector(respuesta({ error: { message: 'clave inválida' } }, 403));

        await expect(lector.read(YouTubeChannelRef.parse('@canal'))).rejects.toThrow(/403/);
        await expect(lector.read(YouTubeChannelRef.parse('@canal'))).rejects.not.toThrow(
            /clave inválida/,
        );
    });
});
