import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { HandoverStepDto } from '@marketplace/api-contract';
import { TransferInitiationForm } from '@/components/TransferInitiationForm';

/**
 * El formulario reemplaza al botón sin registro: el vendedor tiene que
 * afirmar la cesión, no solo apretar algo. Tiene que sobrevivir el caso web
 * —una lista de pasos vacía, porque `WebStrategy` no enumera ninguno
 * posterior a la firma— sin dejar de ser correcto ni filtrar vocabulario de
 * YouTube.
 */

const PASO_YOUTUBE: HandoverStepDto = {
    id: '1',
    description: 'El vendedor promueve a la plataforma de administrador a propietario principal',
    instruction: 'Con el contrato ya firmado, promovenos a propietario principal desde la Cuenta de Marca.',
    afterPlatformStarts: true,
};

async function accion(state: { error?: string }) {
    return state;
}

describe('TransferInitiationForm', () => {
    it('con una lista vacía, la casilla y el botón siguen estando', () => {
        const html = renderToStaticMarkup(<TransferInitiationForm action={accion} steps={[]} />);

        expect(html).toContain('name="controlCeded"');
        expect(html).toMatch(/<button[^>]*type="submit"/);
    });

    /*
     * La pantalla que monta este formulario ya le dice al vendedor que queda un
     * último paso suyo y que es cedernos el control. El formulario llegó a
     * repetirlo casi textual, así que se leía dos veces seguidas lo mismo — y se
     * notaba más con la lista vacía, porque ahí no queda nada más para leer.
     *
     * Esto no llena el hueco de fondo: un vendedor de sitio web sigue sin
     * instrucciones concretas, y eso se arregla en `web-escrow-transfer-steps`,
     * no escribiendo otro texto genérico acá.
     */
    it('no repite la frase que ya dice la pantalla', () => {
        const vacio = renderToStaticMarkup(<TransferInitiationForm action={accion} steps={[]} />);
        const conPasos = renderToStaticMarkup(
            <TransferInitiationForm action={accion} steps={[PASO_YOUTUBE]} />,
        );

        expect(vacio).not.toMatch(/queda un último paso tuyo/i);
        expect(conPasos).not.toMatch(/queda un último paso tuyo/i);
    });

    it('con una lista vacía, no filtra vocabulario de YouTube', () => {
        const html = renderToStaticMarkup(<TransferInitiationForm action={accion} steps={[]} />);

        expect(html).not.toMatch(/propietario principal/i);
        expect(html).not.toMatch(/Cuenta de Marca/i);
    });

    it('con pasos, los enumera en un <ol>', () => {
        const html = renderToStaticMarkup(
            <TransferInitiationForm action={accion} steps={[PASO_YOUTUBE]} />,
        );

        expect(html).toContain('<ol');
        expect(html).toMatch(/propietario principal/i);
    });

    it('el submit arranca deshabilitado hasta marcar la casilla', () => {
        const html = renderToStaticMarkup(<TransferInitiationForm action={accion} steps={[]} />);

        expect(html).toMatch(/<button[^>]*disabled[^>]*type="submit"|<button[^>]*type="submit"[^>]*disabled/);
    });
});
