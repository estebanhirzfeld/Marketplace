import { describe, it, expect } from 'vitest';
import { channelIdFromUrl } from '@/lib/youtubeChannel';

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
