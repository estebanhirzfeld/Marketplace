import { describe, it, expect } from 'vitest';
import { parseListingEdit } from '@/lib/listingEdit';

function form(values: Record<string, string>): FormData {
    const f = new FormData();
    for (const [k, v] of Object.entries(values)) f.set(k, v);
    return f;
}

describe('parseListingEdit', () => {
    it('en borrador manda rubro, sin rostro y precio', () => {
        const r = parseListingEdit(
            form({ niche: 'gaming', sinRostro: 'on', precio: '1500.50', moneda: 'ARS' }),
            'draft',
        );
        expect(r).toEqual({
            ok: true,
            body: {
                niche: 'gaming',
                hasNoFaceContent: true,
                askingPrice: { cents: 150050, currency: 'ARS' },
            },
        });
    });

    it('sin la casilla marcada, sin rostro es falso', () => {
        const r = parseListingEdit(form({ niche: 'gaming', precio: '10', moneda: 'USD' }), 'draft');
        expect(r.ok && r.body.hasNoFaceContent).toBe(false);
    });

    it('publicado: solo precio y moneda', () => {
        const r = parseListingEdit(
            form({ niche: 'gaming', sinRostro: 'on', precio: '20', moneda: 'USD' }),
            'published',
        );
        expect(r).toEqual({ ok: true, body: { askingPrice: { cents: 2000, currency: 'USD' } } });
    });

    it('una moneda desconocida cae a USD y el precio inválido se rechaza', () => {
        const r = parseListingEdit(form({ precio: '5', moneda: 'EUR' }), 'published');
        expect(r.ok && r.body.askingPrice?.currency).toBe('USD');
        expect(parseListingEdit(form({ precio: '0', moneda: 'USD' }), 'published').ok).toBe(false);
        expect(parseListingEdit(form({ precio: 'abc', moneda: 'USD' }), 'draft').ok).toBe(false);
    });
});
