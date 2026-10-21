import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { OperationDetailDto, StepProgressDto } from '@marketplace/api-contract';
import { UserRole } from '@marketplace/shared-types';

/**
 * Quién ve qué del traspaso de un sitio en `/operaciones/[id]`. La página se
 * arma con la API simulada: lo que se fija es el cableado por rol, por estado
 * y por tipo de activo, que ningún test de componente cubre.
 */

const operation = vi.fn();
const currentActor = vi.fn();

vi.mock('next/navigation', () => ({
    notFound: () => {
        throw new Error('NEXT_NOT_FOUND');
    },
    redirect: (url: string) => {
        throw new Error(`NEXT_REDIRECT:${url}`);
    },
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
    usePathname: () => '/operaciones/op1',
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/guards', () => ({ requireSession: async () => ({ id: 'u1' }) }));
vi.mock('@/lib/session', () => ({ currentActor: () => currentActor() }));
vi.mock('@/lib/assetTypes', () => ({ assetTypeLabeller: async () => (t: string) => t }));
vi.mock('@/lib/api', () => ({ api: () => ({ operation, paymentOptions: vi.fn(async () => undefined) }) }));

import DetalleOperacion from '@/app/operaciones/[id]/page';

const DEADLINE = '2026-10-30T09:00:00.000Z';

function unaOperacion(over: Partial<OperationDetailDto>): OperationDetailDto {
    return {
        id: 'op1',
        listingId: 'l1',
        status: 'transfer_in_progress',
        assetType: 'web',
        buyer: { id: 'b1', fullName: 'Comprador' },
        seller: { id: 's1', fullName: 'Vendedor' },
        currentOfferPrice: { cents: 100000, currency: 'USD' },
        pendingResponseFrom: 'buyer',
        negotiations: [],
        contracts: [],
        handoverSteps: [
            { id: '2', key: 'domain-to-platform', check: 'automatic', description: 'd', title: 'Trasladá el dominio a nuestra cuenta' },
            { id: '3', key: 'hosting', check: 'declared', description: 'd', title: 'Dejá el hosting y los archivos listos' },
        ],
        stepProgress: [{ stepKey: 'domain-to-platform', status: 'waiting', deadlineAt: DEADLINE, attested: false }],
        createdAt: '2026-10-01T00:00:00.000Z',
        ...over,
    };
}

async function pagina(op: OperationDetailDto, actor: { id: string; role: UserRole }): Promise<string> {
    operation.mockResolvedValue(op);
    currentActor.mockResolvedValue(actor);
    const jsx = await DetalleOperacion({ params: Promise.resolve({ id: 'op1' }), searchParams: Promise.resolve({}) });
    return renderToStaticMarkup(jsx).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

const ADMIN = { id: 'a1', role: UserRole.ADMIN };
const VENDEDOR = { id: 's1', role: UserRole.SELLER };
const COMPRADOR = { id: 'b1', role: UserRole.BUYER };

beforeEach(() => {
    vi.clearAllMocks();
});

describe('/operaciones/[id] — traspaso de un sitio', () => {
    it('el vendedor ve los pasos con su estado, sin los botones del admin', async () => {
        const t = await pagina(unaOperacion({ miParte: 'seller' }), VENDEDOR);

        expect(t).toContain('PASOS DEL TRASPASO');
        expect(t).toContain('EN CURSO');
        expect(t).not.toContain('Comprobar el dominio en Hostinger');
        expect(t).not.toContain('Dar por cumplido');
    });

    it('el admin ve los pasos y los botones que los hacen avanzar', async () => {
        const t = await pagina(unaOperacion({}), ADMIN);

        expect(t).toContain('PASOS DEL TRASPASO');
        expect(t).toContain('Comprobar el dominio en Hostinger');
        expect(t).toContain('Dar por cumplido: Dejá el hosting y los archivos listos');
    });

    it('el comprador, con el pago confirmado, ve si tiene que aceptar el dominio y no los pasos del vendedor', async () => {
        const entrega: StepProgressDto = { stepKey: 'domain-to-buyer', status: 'waiting', deadlineAt: DEADLINE, attested: false };
        const t = await pagina(
            unaOperacion({
                status: 'payment_received',
                miParte: 'buyer',
                recipientIdentity: { identifier: 'comprador@correo.com', declaredAt: '2026-10-02T00:00:00.000Z' },
                stepProgress: [entrega],
            }),
            COMPRADOR,
        );

        expect(t).toContain('Te mandamos la invitación a comprador@correo.com');
        expect(t).not.toContain('PASOS DEL TRASPASO');
        expect(t).not.toContain('Iniciar la entrega del dominio');
    });

    it('un canal no muestra nada del traspaso de un sitio, ni siquiera al admin', async () => {
        const t = await pagina(unaOperacion({ assetType: 'youtube' }), ADMIN);

        // La página se armó: el estado de la operación está, lo del sitio no.
        expect(t).toContain('VERIFICANDO');
        expect(t).not.toContain('PASOS DEL TRASPASO');
        expect(t).not.toContain('Comprobar el dominio en Hostinger');
    });
});
