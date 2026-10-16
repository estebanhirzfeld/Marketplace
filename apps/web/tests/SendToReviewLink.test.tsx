import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SendToReviewLinkView } from '@/components/SendToReviewLink';

const noop = () => {};
const base = { state: {}, pending: false, onAsk: noop, onCancel: noop, submit: noop };

describe('SendToReviewLinkView', () => {
    it('el primer toque no envía nada: solo pide confirmar', () => {
        const html = renderToStaticMarkup(<SendToReviewLinkView {...base} confirming={false} />);

        expect(html).toContain('No puedo cargar el registro');
        expect(html).toContain('type="button"');
        expect(html).not.toContain('type="submit"');
    });

    it('al confirmar explica la demora y ofrece cancelar o enviar', () => {
        const html = renderToStaticMarkup(<SendToReviewLinkView {...base} confirming />);

        expect(html).toContain('role="alertdialog"');
        expect(html).toContain('Lo revisamos a mano y tarda más. ¿Lo enviamos a revisión?');
        expect(html).toContain('Cancelar');
        expect(html).toContain('Sí, enviar a revisión');
        expect(html).toContain('type="submit"');
    });

    it('mientras envía, el botón lo dice y queda deshabilitado', () => {
        const html = renderToStaticMarkup(<SendToReviewLinkView {...base} confirming pending />);

        expect(html).toContain('Enviando…');
        expect(html).toContain('disabled');
    });
});
