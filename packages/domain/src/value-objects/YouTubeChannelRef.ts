import { ValidationError } from '../errors/DomainError';

export type ChannelRefKind = 'id' | 'handle';

/** Un ID de canal: `UC` seguido de 22 caracteres del alfabeto base64 web. */
const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;

/** Un handle: de 3 a 30 caracteres, sin la arroba. */
const HANDLE = /^[A-Za-z0-9._-]{3,30}$/;

const AYUDA =
    'Pegá la dirección de tu canal, con el formato https://youtube.com/@tuCanal o ' +
    'https://youtube.com/channel/UC... Podés copiarla desde tu propio canal en YouTube.';

/**
 * Referencia a un canal de YouTube, resuelta a lo que la API sabe recibir.
 *
 * `channels.list` acepta un ID (`id`) o un handle (`forHandle`), y nada más.
 * El vendedor, en cambio, pega lo que tiene a mano. La traducción entre una
 * cosa y la otra es una regla del negocio —de ella depende que podamos
 * verificar un canal o no— así que vive acá y se prueba sin red.
 */
export class YouTubeChannelRef {
    private constructor(
        public readonly kind: ChannelRefKind,
        public readonly value: string,
    ) {}

    public static parse(entrada: string): YouTubeChannelRef {
        const texto = entrada.trim();
        if (texto === '') {
            throw new ValidationError(`Falta la dirección del canal. ${AYUDA}`);
        }

        // Suelto, sin URL: un ID o un handle con arroba.
        if (CHANNEL_ID.test(texto)) {
            return new YouTubeChannelRef('id', texto);
        }
        if (texto.startsWith('@')) {
            return YouTubeChannelRef.desdeHandle(texto.slice(1));
        }

        const url = YouTubeChannelRef.aUrl(texto);
        const segmentos = url.pathname.split('/').filter(Boolean);
        const [primero, segundo] = segmentos;

        if (primero?.startsWith('@')) {
            return YouTubeChannelRef.desdeHandle(primero.slice(1));
        }

        if (primero === 'channel') {
            if (!segundo || !CHANNEL_ID.test(segundo)) {
                throw new ValidationError(`Ese identificador de canal no tiene un formato válido. ${AYUDA}`);
            }
            return new YouTubeChannelRef('id', segundo);
        }

        // `/c/` y `/user/` son direcciones viejas que la API no sabe resolver.
        // Adivinar acá terminaría verificando el canal equivocado.
        if (primero === 'c' || primero === 'user') {
            throw new ValidationError(
                `Esa es una dirección antigua que YouTube ya no permite resolver. ${AYUDA}`,
            );
        }

        throw new ValidationError(`Esa dirección no apunta a un canal. ${AYUDA}`);
    }

    private static desdeHandle(handle: string): YouTubeChannelRef {
        if (!HANDLE.test(handle)) {
            throw new ValidationError(`Ese handle no tiene un formato válido. ${AYUDA}`);
        }
        return new YouTubeChannelRef('handle', handle);
    }

    private static aUrl(texto: string): URL {
        let url: URL;
        try {
            url = new URL(texto.includes('://') ? texto : `https://${texto}`);
        } catch {
            throw new ValidationError(`No pudimos leer esa dirección. ${AYUDA}`);
        }

        const host = url.hostname.replace(/^www\./, '');
        if (host !== 'youtube.com' && host !== 'm.youtube.com' && host !== 'youtu.be') {
            throw new ValidationError(`Esa dirección no es de YouTube. ${AYUDA}`);
        }

        return url;
    }

    public equals(otra: YouTubeChannelRef): boolean {
        return this.kind === otra.kind && this.value === otra.value;
    }

    public toString(): string {
        return this.kind === 'id' ? this.value : `@${this.value}`;
    }
}
