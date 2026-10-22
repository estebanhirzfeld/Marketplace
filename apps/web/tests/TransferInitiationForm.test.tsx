import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { HandoverStepDto } from '@marketplace/api-contract';

const initiateTransferApi = vi.fn();
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
    redirect: (url: string) => {
        throw new Error(`NEXT_REDIRECT:${url}`);
    },
    useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock('@/lib/guards', () => ({ requireSession: async () => ({ id: 'seller' }) }));
vi.mock('@/lib/api', () => ({ api: () => ({ initiateTransfer: initiateTransferApi }) }));

import { TransferInitiationForm } from '@/components/TransferInitiationForm';
import { initiateTransfer } from '@/app/operaciones/actions';

beforeEach(() => {
    vi.resetAllMocks();
});

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

    it('con un paso que trae detalle, ofrece verlo en el modal; sin detalle, no', () => {
        const conDetalle = renderToStaticMarkup(
            <TransferInitiationForm
                action={accion}
                steps={[{ ...PASO_YOUTUBE, details: ['Google lo rechaza hasta el día 7.'], links: [] }]}
            />,
        );
        const sinDetalle = renderToStaticMarkup(
            <TransferInitiationForm action={accion} steps={[PASO_YOUTUBE]} />,
        );

        expect(conDetalle).toContain('Ver cómo hacerlo');
        expect(sinDetalle).not.toContain('Ver cómo hacerlo');
    });

    /*
     * Si la operación se cancela con el dominio en custodia, se lo devolvemos al
     * vendedor por Hostinger: necesitamos saber a qué cuenta.
     */
    it('en un sitio pide el mail de la cuenta de Hostinger desde la que sale el dominio', () => {
        const html = renderToStaticMarkup(<TransferInitiationForm action={accion} steps={[]} askSourceAccount />);

        expect(html).toContain('name="sellerSourceIdentity"');
        expect(html).toContain('type="email"');
        expect(html).toContain('Tu cuenta de Hostinger');
    });

    it('en un canal no lo pide', () => {
        const html = renderToStaticMarkup(<TransferInitiationForm action={accion} steps={[]} />);

        expect(html).not.toContain('sellerSourceIdentity');
        expect(html).not.toContain('Hostinger');
    });
});

describe('initiateTransfer', () => {
    it('manda la cuenta de origen del vendedor a la API', async () => {
        initiateTransferApi.mockResolvedValue(undefined);
        const form = new FormData();
        form.set('controlCeded', 'on');
        form.set('sellerSourceIdentity', ' vendedor@correo.com ');

        const result = await initiateTransfer('op1', {}, form);

        expect(initiateTransferApi).toHaveBeenCalledWith('op1', {
            controlCeded: true,
            notes: undefined,
            sellerSourceIdentity: 'vendedor@correo.com',
        });
        expect(result.ok).toBe(true);
    });

    it('sin cuenta de origen no la manda: la exige el dominio, solo en un sitio', async () => {
        initiateTransferApi.mockResolvedValue(undefined);
        const form = new FormData();
        form.set('controlCeded', 'on');

        await initiateTransfer('op1', {}, form);

        expect(initiateTransferApi).toHaveBeenCalledWith('op1', { controlCeded: true, notes: undefined, sellerSourceIdentity: undefined });
    });
});
