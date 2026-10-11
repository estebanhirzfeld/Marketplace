import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PublishedData } from '@/components/PublishedData';

const FIELDS = [
    { key: 'name', label: 'Nombre del canal', kind: 'text' as const },
    { key: 'channelUrl', label: 'Canal', kind: 'text' as const },
    { key: 'secret', label: 'Interno', kind: 'text' as const, internal: true },
];
const DATA = {
    name: 'Pc Lover',
    channelUrl: 'https://www.youtube.com/channel/UCkHabcdefghijklmnopUvGQ',
    secret: 'x',
};

describe('PublishedData', () => {
    it('dibuja la dirección del canal como un enlace real que abre afuera, abreviado a la vista', () => {
        const html = renderToStaticMarkup(<PublishedData fields={FIELDS} data={DATA} />);

        expect(html).toContain('href="https://www.youtube.com/channel/UCkHabcdefghijklmnopUvGQ"');
        expect(html).toContain('target="_blank"');
        expect(html).toContain('rel="noopener noreferrer"');
        expect(html).toContain('youtube.com/channel/UCkH…UvGQ');
    });

    it('no muestra los campos internos y respeta el orden declarado', () => {
        const html = renderToStaticMarkup(<PublishedData fields={FIELDS} data={DATA} />);

        expect(html).not.toContain('Interno');
        expect(html.indexOf('Nombre del canal')).toBeLessThan(html.indexOf('Canal<'));
    });
});
