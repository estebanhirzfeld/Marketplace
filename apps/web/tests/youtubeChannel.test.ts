import { describe, it, expect } from 'vitest';
import type { YouTubeConnectionDto } from '@marketplace/api-contract';
import { channelIdFromUrl, isWebAddress, shortenChannelUrl, thumbnailsByChannelId } from '@/lib/youtubeChannel';

describe('channelIdFromUrl', () => {
    it('saca el identificador de la dirección que arma la plataforma', () => {
        expect(channelIdFromUrl('https://www.youtube.com/channel/UCq-Fj5jknLsUf-MWSy4_brA')).toBe(
            'UCq-Fj5jknLsUf-MWSy4_brA',
        );
    });

    it('ignora lo que venga después del identificador', () => {
        expect(channelIdFromUrl('https://www.youtube.com/channel/UC123/videos?x=1')).toBe('UC123');
    });

    it('una dirección con @handle no tiene identificador', () => {
        expect(channelIdFromUrl('https://youtube.com/@midudev')).toBeUndefined();
    });

    it('sin dirección no hay identificador', () => {
        expect(channelIdFromUrl(undefined)).toBeUndefined();
        expect(channelIdFromUrl('')).toBeUndefined();
        expect(channelIdFromUrl(42)).toBeUndefined();
    });
});

const CONEXION: YouTubeConnectionDto = {
    connectionId: 'c1',
    channelId: 'UC1',
    channelTitle: 'Canal uno',
    thumbnailUrl: 'https://yt3.ggpht.com/uno',
    subscribers: 10,
    views12Months: 100,
    revenue12MonthsCents: 0,
    monthlyRevenueCents: 0,
    isMonetized: false,
    periodStart: '2025-10-01T00:00:00.000Z',
    periodEnd: '2026-09-30T00:00:00.000Z',
    readAt: '2026-10-09T15:00:00.000Z',
};

describe('thumbnailsByChannelId', () => {
    it('arma el mapa de identificador de canal a foto', () => {
        const mapa = thumbnailsByChannelId([
            CONEXION,
            { ...CONEXION, connectionId: 'c2', channelId: 'UC2', thumbnailUrl: 'https://yt3.ggpht.com/dos' },
        ]);
        expect(mapa.get('UC1')).toBe('https://yt3.ggpht.com/uno');
        expect(mapa.get('UC2')).toBe('https://yt3.ggpht.com/dos');
    });

    it('sin conexiones, el mapa queda vacio', () => {
        expect(thumbnailsByChannelId([]).size).toBe(0);
    });

    it('si la lectura fallo, el mapa queda vacio y no rompe', () => {
        expect(thumbnailsByChannelId(undefined).size).toBe(0);
    });

    it('un canal sin foto no entra al mapa', () => {
        expect(thumbnailsByChannelId([{ ...CONEXION, thumbnailUrl: undefined }]).has('UC1')).toBe(false);
    });
});

describe('shortenChannelUrl', () => {
    it('quita el protocolo y el www, y abrevia el identificador largo', () => {
        expect(shortenChannelUrl('https://www.youtube.com/channel/UCkHabcdefghijklmnopUvGQ')).toBe(
            'youtube.com/channel/UCkH…UvGQ',
        );
    });

    it('deja un handle tal cual, sin protocolo', () => {
        expect(shortenChannelUrl('https://www.youtube.com/@pclover')).toBe('youtube.com/@pclover');
    });

    it('un texto que no es una dirección se devuelve igual', () => {
        expect(shortenChannelUrl('Pc Lover')).toBe('Pc Lover');
    });
});

describe('isWebAddress', () => {
    it('solo acepta http y https', () => {
        expect(isWebAddress('https://youtube.com/@x')).toBe(true);
        expect(isWebAddress('http://youtube.com/@x')).toBe(true);
        expect(isWebAddress('javascript:alert(1)')).toBe(false);
        expect(isWebAddress(42)).toBe(false);
    });
});
