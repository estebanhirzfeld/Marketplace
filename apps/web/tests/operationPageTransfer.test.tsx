import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type {
    NextActionIdDto,
    OperationDetailDto,
    OperationNextDto,
    OperationRoleDto,
    StepProgressDto,
} from '@marketplace/api-contract';
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

/** Lo que calcularía la API cuando le toca a una sola parte. */
function turnoDe(role: OperationRoleDto, id: NextActionIdDto): OperationNextDto {
    const espera = { kind: 'wait' as const, waitingOn: [role] };
    return {
        byRole: { buyer: espera, seller: espera, platform: espera, [role]: { kind: 'act', id, blocking: true } },
        turn: [role],
        timeline: [],
    };
}

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
                next: turnoDe('buyer', 'accept_delivery'),
            }),
            COMPRADOR,
        );

        expect(t).not.toContain('TU PRÓXIMO PASO');
        expect(t).toContain('Aceptá el dominio en Hostinger');
        expect(t).toContain('Te mandamos la invitación a comprador@correo.com');
        expect(t).not.toContain('PASOS DEL TRASPASO');
        expect(t).not.toContain('Iniciar la entrega del dominio');
    });

    it('el comprador de una operación cerrada sin progreso de entrega no ve una promesa de traslado', async () => {
        const t = await pagina(
            unaOperacion({
                status: 'completed',
                miParte: 'buyer',
                recipientIdentity: { identifier: 'comprador@correo.com', declaredAt: '2026-10-02T00:00:00.000Z' },
                stepProgress: [],
            }),
            COMPRADOR,
        );

        expect(t).toContain('El dominio ya está en tu cuenta de Hostinger.');
        expect(t).not.toContain('Vamos a trasladarte el dominio');
    });

    it('un canal no muestra nada del traspaso de un sitio, ni siquiera al admin', async () => {
        const t = await pagina(unaOperacion({ assetType: 'youtube' }), ADMIN);

        // La página se armó: las herramientas del admin están, lo del sitio no.
        expect(t).toContain('SI LA CESIÓN NO LLEGÓ');
        expect(t).not.toContain('PASOS DEL TRASPASO');
        expect(t).not.toContain('Comprobar el dominio en Hostinger');
    });
});

/**
 * Un sitio no necesita acceso de la plataforma para firmar: lo que se comprueba
 * es el dominio, y si no está listo la firma devuelve la instrucción. Antes la
 * pantalla escondía el botón esperando un acceso que un sitio nunca tiene.
 */
describe('/operaciones/[id] — firma del contrato', () => {
    const firmanLasDos: OperationNextDto = {
        byRole: {
            buyer: { kind: 'act', id: 'sign_contract', blocking: true },
            seller: { kind: 'act', id: 'sign_contract', blocking: true },
            platform: { kind: 'wait', waitingOn: ['buyer', 'seller'] },
        },
        turn: ['buyer', 'seller'],
        timeline: [],
    };
    const pendiente = (over: Partial<OperationDetailDto>) =>
        unaOperacion({
            status: 'contract_pending',
            contracts: [{ id: 'c1', type: 'tripartite', isFullySigned: false }],
            stepProgress: [],
            transferable: false,
            ...over,
        });

    it('las partes de un sitio pueden firmar sin acceso de la plataforma', async () => {
        const t = await pagina(pendiente({ miParte: 'buyer', next: firmanLasDos }), COMPRADOR);

        expect(t).toContain('Firmar el contrato');
        expect(t).not.toContain('acceso al activo');
    });

    it('el admin de un sitio no ve el aviso de registrar el acceso', async () => {
        const t = await pagina(pendiente({ next: firmanLasDos }), ADMIN);

        expect(t).not.toContain('Registrar el acceso al activo');
        expect(t).not.toContain('constancia de que tenemos acceso');
    });

    it('un canal sin acceso sigue sin ofrecer la firma, y el vendedor lee por qué', async () => {
        const t = await pagina(
            pendiente({ assetType: 'youtube', miParte: 'seller', handoverSteps: [], next: turnoDe('platform', 'register_platform_access') }),
            VENDEDOR,
        );

        expect(t).not.toContain('Firmar el contrato');
        expect(t).toContain('Le toca a la plataforma: registrar su acceso al canal.');
    });

    it('el admin de un canal sin acceso sigue viendo su próximo paso', async () => {
        const t = await pagina(
            pendiente({ assetType: 'youtube', handoverSteps: [], next: turnoDe('platform', 'register_platform_access') }),
            ADMIN,
        );

        expect(t).toContain('Registrá el acceso al canal');
        expect(t).toContain('Registrar el acceso al activo');
    });
});

/**
 * Lo que se vio en la prueba local del 21/10/2026: el comprador sin medio de
 * pago terminaba en «abrí un reclamo», y al vendedor de un sitio se le decía
 * que no hiciera nada mientras el dominio seguía en su cuenta.
 */
describe('/operaciones/[id] — tu próximo paso', () => {
    it('sin medio de pago, el comprador espera a la plataforma y no se le pide un reclamo', async () => {
        const t = await pagina(
            unaOperacion({ status: 'asset_in_custody', miParte: 'buyer', next: turnoDe('platform', 'enable_payment_method') }),
            COMPRADOR,
        );

        expect(t).toContain('Le toca a la plataforma: habilitar un medio de pago.');
        expect(t).not.toMatch(/Abrí un reclamo/i);
    });

    it('el vendedor de un sitio ve que le toca trasladar el dominio, con su plazo', async () => {
        const next = turnoDe('seller', 'move_domain_to_platform');
        next.byRole.seller = { kind: 'act', id: 'move_domain_to_platform', blocking: true, deadline: DEADLINE };
        const t = await pagina(unaOperacion({ miParte: 'seller', next }), VENDEDOR);

        expect(t).toContain('Trasladá el dominio a nuestra cuenta');
        expect(t).toContain('Tenés hasta el 30 de octubre de 2026.');
        expect(t).not.toContain('No hace falta que hagas nada');
    });

    it('el admin puede rechazar una cesión declarada, con el motivo', async () => {
        const t = await pagina(unaOperacion({ next: turnoDe('seller', 'move_domain_to_platform') }), ADMIN);

        expect(t).toContain('Rechazar la cesión');
        expect(t).toContain('Motivo');
    });

    it('nadie más que el admin ve cómo rechazar la cesión', async () => {
        const t = await pagina(
            unaOperacion({ miParte: 'seller', next: turnoDe('seller', 'move_domain_to_platform') }),
            VENDEDOR,
        );

        expect(t).not.toContain('Rechazar la cesión');
    });

    it('el vendedor con la cesión rechazada ve el motivo y vuelve a declarar', async () => {
        const t = await pagina(
            unaOperacion({
                status: 'contract_signed',
                miParte: 'seller',
                transferRejection: { reason: 'El dominio nunca llegó a nuestra cuenta.', rejectedAt: '2026-10-24T10:00:00.000Z' },
                next: turnoDe('seller', 'declare_handover'),
            }),
            VENDEDOR,
        );

        expect(t).toContain('Rechazamos tu cesión: El dominio nunca llegó a nuestra cuenta.');
        expect(t).toContain('Iniciá el traslado del dominio');
    });

    it('el admin ve en qué está cada parte', async () => {
        const t = await pagina(unaOperacion({ next: turnoDe('seller', 'move_domain_to_platform') }), ADMIN);

        expect(t).toContain('LAS PARTES');
        expect(t).toContain('Vendedor · Le toca: trasladar el dominio a nuestra cuenta de Hostinger.');
        expect(t).toContain('Comprador · Espera al vendedor.');
    });
});
