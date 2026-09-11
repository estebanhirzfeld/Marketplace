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
    it('con una lista vacía, muestra la frase genérica y la casilla igual', () => {
        const html = renderToStaticMarkup(<TransferInitiationForm action={accion} steps={[]} />);

        expect(html).toMatch(/ceder el control del activo/i);
        expect(html).toContain('name="controlCeded"');
        expect(html).toMatch(/<button[^>]*type="submit"/);
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
