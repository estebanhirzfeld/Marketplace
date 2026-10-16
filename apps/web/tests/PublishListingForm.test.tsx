import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PublishListingForm } from '@/components/PublishListingForm';

/**
 * La autoridad de dominio salió del sitio: la escribía el vendedor y nadie la
 * comprobaba. El formulario de un sitio no la pide ni la menciona.
 */
describe('PublishListingForm de un sitio web', () => {
    const html = renderToStaticMarkup(
        <PublishListingForm action={async () => ({})} estimate={async () => null} types={['web']} />,
    );

    it('no pide autoridad de dominio ni suscriptores', () => {
        expect(html).not.toContain('name="metrica"');
        expect(html).not.toMatch(/autoridad/i);
        expect(html).not.toContain('Suscriptores');
    });

    it('pide el ingreso mensual', () => {
        expect(html).toContain('name="ingreso"');
    });
});
