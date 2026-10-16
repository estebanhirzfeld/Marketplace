import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PublishListingForm } from '@/components/PublishListingForm';
import { listingDraftNotice } from '@/lib/listingDraftCopy';

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

describe('PublishListingForm: cómo se publica', () => {
    const text = (types: ('youtube' | 'web')[]) =>
        renderToStaticMarkup(<PublishListingForm action={async () => ({})} estimate={async () => null} types={types} />)
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ');

    it('un sitio se publica comprobando el dominio por DNS, y la revisión es la alternativa', () => {
        const t = text(['web']);

        expect(t).toContain(
            'Nace como borrador y no lo ve nadie. Para publicarlo comprobás que el sitio es tuyo con un registro en tu DNS, o lo enviás a revisión.',
        );
        expect(t).not.toContain('requiere tener la identidad verificada');
    });

    it('un canal sigue publicándose por revisión', () => {
        expect(text(['youtube'])).toContain('Para publicarlo hay que enviarlo a revisión');
    });
});

describe('listingDraftNotice: el aviso de la pantalla de venta', () => {
    it('para un sitio habla de la comprobación por DNS y no de evaluarlo antes de publicar', () => {
        const t = listingDraftNotice('web');

        expect(t).toContain('registro en tu DNS');
        expect(t).not.toContain('Al enviarlo a revisión lo evaluamos antes de publicarlo');
        expect(t).not.toMatch(/canal|YouTube/i);
    });

    it('para un canal conserva el aviso de la revisión', () => {
        expect(listingDraftNotice('youtube')).toContain('Al enviarlo a revisión lo evaluamos antes de publicarlo');
    });
});
