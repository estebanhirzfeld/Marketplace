import { describe, it, expect } from 'vitest';
import { YOUTUBE_CARD_FIELD_KEYS, visibleFields } from '@/lib/publishedFields';

const FIELDS = [
    { key: 'niche', label: 'Rubro', kind: 'niche' as const },
    { key: 'subscribers', label: 'Suscriptores', kind: 'number' as const },
    { key: 'monthlyRevenueUsdCents', label: 'Ingreso mensual', kind: 'money' as const },
    { key: 'currency', label: 'Moneda', kind: 'text' as const },
    { key: 'isMonetized', label: 'Monetizado', kind: 'boolean' as const },
    { key: 'audienceTopCountry', label: 'País', kind: 'text' as const },
    { key: 'hasNoFaceContent', label: 'Contenido sin rostro', kind: 'boolean' as const },
    { key: 'name', label: 'Nombre del canal', kind: 'text' as const },
    { key: 'verifiedFromYouTubeAt', label: 'Datos verificados', kind: 'date' as const },
    { key: 'channelUrl', label: 'Canal', kind: 'text' as const },
    { key: 'growthFactor', label: 'Factor', kind: 'number' as const, internal: true },
];
const DATA = Object.fromEntries(FIELDS.map((f) => [f.key, 1]));

describe('visibleFields', () => {
    it('sin exclusiones deja todo salvo lo interno y lo que no vino en los datos', () => {
        const keys = visibleFields(FIELDS, { ...DATA, currency: undefined }).map((f) => f.key);
        expect(keys).toContain('subscribers');
        expect(keys).not.toContain('growthFactor');
        const sinDato = visibleFields(FIELDS, { niche: 'x' }).map((f) => f.key);
        expect(sinDato).toEqual(['niche']);
    });

    it('en YouTube saca lo que ya muestra la tarjeta del canal y conserva el resto en orden', () => {
        const keys = visibleFields(FIELDS, DATA, YOUTUBE_CARD_FIELD_KEYS).map((f) => f.key);
        expect(keys).toEqual(['niche', 'currency', 'hasNoFaceContent', 'channelUrl']);
    });
});
