import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError } from '@marketplace/api-client';

/**
 * Las acciones del admin sobre el traspaso de un sitio. Cada una le dice cómo
 * quedó el paso, en palabras, y solo un resultado sin error refresca la
 * pantalla de la operación.
 */

const checkDomainCustody = vi.fn();
const deliverDomain = vi.fn();
const checkDomainDelivery = vi.fn();
const attestTransferStep = vi.fn();
const rejectTransfer = vi.fn();
const revalidatePath = vi.fn();

vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePath(p) }));
vi.mock('next/navigation', () => ({
    redirect: (url: string) => {
        throw new Error(`NEXT_REDIRECT:${url}`);
    },
}));
vi.mock('@/lib/guards', () => ({ requireSession: async () => ({ id: 'admin' }) }));
vi.mock('@/lib/api', () => ({
    api: () => ({ checkDomainCustody, deliverDomain, checkDomainDelivery, attestTransferStep, rejectTransfer }),
}));

import {
    checkDomainCustodyAction,
    deliverDomainAction,
    checkDomainDeliveryAction,
    attestTransferStepAction,
    rejectTransferAction,
} from '@/app/operaciones/actions';

beforeEach(() => {
    vi.resetAllMocks();
});

describe('checkDomainCustodyAction', () => {
    it.each([
        ['pending', 'Todavía no hay un traslado hacia nuestra cuenta de Hostinger.'],
        ['waiting', 'El traslado llegó y lo aceptamos. Falta confirmarlo desde el mail de Hostinger.'],
        ['done', 'El dominio ya está en nuestra cuenta y la custodia quedó confirmada.'],
        ['expired', 'La invitación del vendedor venció. Tiene que iniciar el traslado de nuevo.'],
    ])('con el paso %s le dice al admin cómo quedó', async (status, message) => {
        checkDomainCustody.mockResolvedValue({ status });

        const result = await checkDomainCustodyAction('op1', {});

        expect(checkDomainCustody).toHaveBeenCalledWith('op1');
        expect(result).toEqual({ ok: true, message });
        expect(revalidatePath).toHaveBeenCalledWith('/operaciones/op1');
    });

    it('un error de la API vuelve tal cual y no refresca nada', async () => {
        checkDomainCustody.mockRejectedValue(
            new ApiError('INTERNAL', 'El registrador de dominios todavía no está configurado.', 503),
        );

        const result = await checkDomainCustodyAction('op1', {});

        expect(result).toEqual({ error: 'El registrador de dominios todavía no está configurado.' });
        expect(revalidatePath).not.toHaveBeenCalled();
    });
});

describe('deliverDomainAction y checkDomainDeliveryAction', () => {
    it('iniciar la entrega confirma que la invitación salió', async () => {
        deliverDomain.mockResolvedValue({ status: 'waiting' });

        const result = await deliverDomainAction('op1', {});

        expect(result).toEqual({ ok: true, message: 'Le mandamos la invitación al comprador. Tiene 10 días para aceptarla.' });
        expect(revalidatePath).toHaveBeenCalledWith('/operaciones/op1');
    });

    it('si Hostinger rechaza el mail, el admin ve el motivo', async () => {
        deliverDomain.mockRejectedValue(
            new ApiError('INVALID_STATE', 'Hostinger no aceptó el traslado a x@y.com: puede que ese mail no tenga una cuenta de Hostinger. Pedile al comprador que lo revise.', 409),
        );

        const result = await deliverDomainAction('op1', {});

        expect(result.error).toContain('Hostinger no aceptó el traslado a x@y.com');
        expect(revalidatePath).not.toHaveBeenCalled();
    });

    it.each([
        ['waiting', 'El comprador todavía no aceptó la invitación.'],
        ['done', 'El dominio ya está en la cuenta del comprador. Ya se puede cerrar la operación.'],
    ])('comprobar la entrega con el paso %s le dice cómo va', async (status, message) => {
        checkDomainDelivery.mockResolvedValue({ status });

        const result = await checkDomainDeliveryAction('op1', {});

        expect(result).toEqual({ ok: true, message });
    });
});

describe('attestTransferStepAction', () => {
    it('da por cumplido el paso y lo confirma', async () => {
        attestTransferStep.mockResolvedValue({ status: 'done' });

        const result = await attestTransferStepAction('op1', 'hosting', {});

        expect(attestTransferStep).toHaveBeenCalledWith('op1', 'hosting');
        expect(result).toEqual({ ok: true, message: 'Paso dado por cumplido.' });
        expect(revalidatePath).toHaveBeenCalledWith('/operaciones/op1');
    });
});

describe('rejectTransferAction', () => {
    function conMotivo(reason: string): FormData {
        const form = new FormData();
        form.set('reason', reason);
        return form;
    }

    it('rechaza con el motivo y refresca la operación', async () => {
        rejectTransfer.mockResolvedValue(undefined);

        const result = await rejectTransferAction('op1', {}, conMotivo('  No llegó.  '));

        expect(rejectTransfer).toHaveBeenCalledWith('op1', { reason: 'No llegó.' });
        expect(result).toEqual({ ok: true, message: 'Rechazaste la cesión. El vendedor ve el motivo y puede volver a declararla.' });
        expect(revalidatePath).toHaveBeenCalledWith('/operaciones/op1');
    });

    it('sin motivo no llama a la API', async () => {
        const result = await rejectTransferAction('op1', {}, conMotivo('   '));

        expect(rejectTransfer).not.toHaveBeenCalled();
        expect(result).toEqual({ error: 'Escribí el motivo: es lo que va a leer el vendedor.' });
    });
});
