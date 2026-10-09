import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ApiError } from '@marketplace/api-client';
import {
    RecipientIdentityForm,
    RecipientIdentityFormView,
    RecipientIdentitySaved,
} from '@/components/RecipientIdentityForm';

/**
 * El comprador llega acá una vez por compra, a decidir DÓNDE va a recibir el
 * activo, y se va cuando la declaró y la ve guardada. Los tests fijan que el
 * texto hable de lo que ese comprador va a recibir (un canal o un dominio),
 * que lo que se promete sea cierto para cada tipo y que el resultado del envío
 * —éxito o error— se vea.
 */

async function accion() {
    return {};
}

function texto(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

function formulario(props: { assetType?: string; urgente?: boolean; valorActual?: string }) {
    return renderToStaticMarkup(
        <RecipientIdentityForm action={accion} urgente={props.urgente ?? false} {...props} />,
    );
}

function vista(
    state: { error?: string; ok?: boolean; message?: string },
    props: { assetType?: string; valorActual?: string } = {},
) {
    return renderToStaticMarkup(
        <RecipientIdentityFormView
            state={state}
            pending={false}
            submit={() => {}}
            urgente={false}
            {...props}
        />,
    );
}

describe('RecipientIdentityForm — canal de YouTube', () => {
    it('habla de una cuenta de Google y no exige Gmail', () => {
        const t = texto(formulario({ assetType: 'youtube' }));

        expect(t).toMatch(/cuenta de Google/i);
        expect(t).not.toMatch(/tiene que ser (una cuenta )?(de )?gmail/i);
        expect(t).not.toMatch(/registrador/i);
    });

    it('el ejemplo del campo es un correo', () => {
        const html = formulario({ assetType: 'youtube' });

        expect(html).toContain('placeholder="tunombre@gmail.com"');
    });

    it('avisa de la espera de siete días solo cuando es urgente', () => {
        expect(texto(formulario({ assetType: 'youtube', urgente: true }))).toMatch(/siete días/i);
        expect(texto(formulario({ assetType: 'youtube', urgente: false }))).not.toMatch(/siete días/i);
    });
});

describe('RecipientIdentityForm — dominio', () => {
    it('pide el usuario del registrador y lo explica', () => {
        const t = texto(formulario({ assetType: 'web' }));

        expect(t).toMatch(/usuario/i);
        expect(t).toMatch(/registrador/i);
        expect(t).toMatch(/empresa donde registrás/i);
        expect(t).not.toMatch(/Google/i);
    });

    it('el ejemplo del campo no es un correo de Gmail', () => {
        const html = formulario({ assetType: 'web' });

        expect(html).not.toContain('gmail.com');
        expect(html).toContain('placeholder="tu-usuario"');
    });

    it('nunca habla de días de espera: para un dominio no existen', () => {
        expect(texto(formulario({ assetType: 'web', urgente: true }))).not.toMatch(/siete|días|espera/i);
        expect(texto(formulario({ assetType: 'web', urgente: false }))).not.toMatch(/siete|días|espera/i);
    });

    it('el aviso urgente dice qué falta y no promete una invitación', () => {
        const t = texto(formulario({ assetType: 'web', urgente: true }));

        expect(t).toMatch(/PENDIENTE/);
        expect(t).toMatch(/dominio ya está en custodia/i);
        expect(t).not.toMatch(/invitaci/i);
    });
});

describe('RecipientIdentityForm — tipo desconocido', () => {
    it('cae a un texto neutro, sin ejemplo ni vocabulario de un tipo', () => {
        const html = formulario({ assetType: undefined });
        const t = texto(html);

        expect(t).toMatch(/dónde recibir el activo/i);
        expect(html).not.toContain('placeholder=');
        expect(t).not.toMatch(/Google|registrador|siete días/i);
    });
});

describe('RecipientIdentityForm — corrección', () => {
    it('precarga la cuenta declarada y ofrece guardar el cambio', () => {
        const html = formulario({ assetType: 'web', valorActual: 'mi-usuario' });

        expect(html).toContain('value="mi-usuario"');
        expect(texto(html)).toMatch(/Corregir/);
        expect(texto(html)).toContain('Guardar el cambio');
        expect(texto(html)).not.toMatch(/PENDIENTE/);
    });
});

describe('RecipientIdentityFormView — resultado del envío', () => {
    it('tras guardar muestra la confirmación', () => {
        const html = vista({ ok: true, message: 'Registramos dónde querés recibir el activo.' });

        expect(texto(html)).toContain('Registramos dónde querés recibir el activo.');
        expect(html).toContain('--color-listo');
    });

    it('muestra el mensaje de la API tal cual, sin reescribirlo', () => {
        const html = vista({ error: 'Ese correo no tiene un formato válido.' }, { assetType: 'youtube' });

        expect(texto(html)).toContain('Ese correo no tiene un formato válido.');
        expect(html).toContain('--color-error');
    });

    it('sin resultado no muestra ni error ni confirmación', () => {
        const html = vista({});

        expect(html).not.toContain('--color-listo');
        expect(html).not.toContain('--color-error');
    });
});

describe('RecipientIdentitySaved — ya declarada', () => {
    it('muestra la cuenta guardada con el nombre de lo que va a recibir', () => {
        const youtube = texto(
            renderToStaticMarkup(<RecipientIdentitySaved identifier="yo@correo.com" assetType="youtube" />),
        );
        const dominio = texto(
            renderToStaticMarkup(<RecipientIdentitySaved identifier="mi-usuario" assetType="web" />),
        );

        expect(youtube).toContain('Vas a recibir el canal en yo@correo.com');
        expect(dominio).toContain('Vas a recibir el dominio en mi-usuario');
    });

    it('sin tipo conocido habla del activo', () => {
        const t = texto(renderToStaticMarkup(<RecipientIdentitySaved identifier="x" />));

        expect(t).toContain('Vas a recibir el activo en x');
    });
});

describe('declareRecipientIdentity — qué le llega al comprador', () => {
    const declare = vi.fn();
    const revalidatePath = vi.fn();

    beforeEach(() => {
        vi.resetModules();
        declare.mockReset();
        revalidatePath.mockReset();
        vi.doMock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePath(p) }));
        vi.doMock('next/navigation', () => ({ redirect: vi.fn() }));
        vi.doMock('@/lib/guards', () => ({ requireSession: async () => ({ id: 'u1' }) }));
        vi.doMock('@/lib/api', () => ({ api: () => ({ declareRecipientIdentity: declare }) }));
    });

    function datos(identifier: string) {
        const form = new FormData();
        form.set('identifier', identifier);
        return form;
    }

    it('devuelve el mensaje del dominio sin reescribirlo', async () => {
        // Tras resetModules la clase es otra: se importa la misma que ve la acción.
        const { ApiError } = await import('@marketplace/api-client');
        declare.mockRejectedValue(new ApiError('VALIDATION', 'Ese usuario es demasiado largo.', 400));
        const { declareRecipientIdentity } = await import('@/app/operaciones/actions');

        const resultado = await declareRecipientIdentity('op-1', {}, datos('x'));

        expect(resultado).toEqual({ error: 'Ese usuario es demasiado largo.' });
        expect(revalidatePath).not.toHaveBeenCalled();
    });

    it('al guardar invalida la ruta de la operación y confirma', async () => {
        declare.mockResolvedValue(undefined);
        const { declareRecipientIdentity } = await import('@/app/operaciones/actions');

        const resultado = await declareRecipientIdentity('op-1', {}, datos(' yo@correo.com '));

        expect(declare).toHaveBeenCalledWith('op-1', { identifier: 'yo@correo.com' });
        expect(revalidatePath).toHaveBeenCalledWith('/operaciones/op-1');
        expect(resultado.ok).toBe(true);
    });
});
