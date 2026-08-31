import { describe, it, expect } from 'vitest';
import { YouTubeChannelRef } from '../src/value-objects/YouTubeChannelRef';
import { ValidationError } from '../src/errors/DomainError';

/**
 * El vendedor pega la dirección de su canal como la tenga a mano. La API en
 * cambio acepta dos cosas concretas: un ID de canal o un handle. Traducir de
 * lo uno a lo otro es regla de negocio, no detalle de transporte, así que vive
 * en el dominio y se puede probar sin red.
 */

describe('YouTubeChannelRef — direcciones con ID', () => {
    it('reconoce la URL canónica de un canal', () => {
        const ref = YouTubeChannelRef.parse('https://www.youtube.com/channel/UCq-Fj5jknLsUf-MWSy4_brA');

        expect(ref.kind).toBe('id');
        expect(ref.value).toBe('UCq-Fj5jknLsUf-MWSy4_brA');
    });

    it('acepta un ID suelto, sin URL alrededor', () => {
        const ref = YouTubeChannelRef.parse('UCq-Fj5jknLsUf-MWSy4_brA');

        expect(ref.kind).toBe('id');
    });

    it('ignora lo que venga después del ID', () => {
        const ref = YouTubeChannelRef.parse(
            'https://youtube.com/channel/UCq-Fj5jknLsUf-MWSy4_brA/videos?view=0',
        );

        expect(ref.value).toBe('UCq-Fj5jknLsUf-MWSy4_brA');
    });
});

describe('YouTubeChannelRef — direcciones con handle', () => {
    it('reconoce la URL con arroba', () => {
        const ref = YouTubeChannelRef.parse('https://www.youtube.com/@midudev');

        expect(ref.kind).toBe('handle');
        // La API espera el handle sin la arroba.
        expect(ref.value).toBe('midudev');
    });

    it('acepta un handle suelto', () => {
        expect(YouTubeChannelRef.parse('@midudev').value).toBe('midudev');
    });

    it('ignora la subruta y los parámetros', () => {
        const ref = YouTubeChannelRef.parse('https://youtube.com/@midudev/streams?sub_confirmation=1');

        expect(ref.value).toBe('midudev');
    });

    it('tolera espacios alrededor', () => {
        expect(YouTubeChannelRef.parse('  @midudev  ').value).toBe('midudev');
    });
});

describe('YouTubeChannelRef — lo que no se puede resolver', () => {
    /**
     * Las URL viejas con `/c/` y `/user/` no se pueden traducir a un canal con
     * `channels.list`. Antes que adivinar conviene pedir la dirección que sí
     * sirve: el vendedor la tiene a un clic en su propio canal.
     */
    it('rechaza una URL personalizada vieja y explica qué pedir', () => {
        expect(() => YouTubeChannelRef.parse('https://youtube.com/c/MiCanal')).toThrow(
            ValidationError,
        );
        expect(() => YouTubeChannelRef.parse('https://youtube.com/c/MiCanal')).toThrow(/@/);
    });

    it('rechaza una URL de usuario vieja', () => {
        expect(() => YouTubeChannelRef.parse('https://youtube.com/user/MiCanal')).toThrow(
            ValidationError,
        );
    });

    it('rechaza la URL de un video', () => {
        expect(() => YouTubeChannelRef.parse('https://youtube.com/watch?v=dQw4w9WgXcQ')).toThrow(
            ValidationError,
        );
    });

    it('rechaza texto vacío', () => {
        expect(() => YouTubeChannelRef.parse('   ')).toThrow(ValidationError);
    });

    it('rechaza algo que no es una dirección de YouTube', () => {
        expect(() => YouTubeChannelRef.parse('https://vimeo.com/canal')).toThrow(ValidationError);
    });
});
