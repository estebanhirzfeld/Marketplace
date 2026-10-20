import { UserRole } from '@marketplace/shared-types';
import { api } from '@/lib/api';
import type { LinkResult } from '@/lib/mercadopagoLink';
import { startMercadoPagoLink, unlinkMercadoPagoAccount } from '@/app/perfil/actions';
import { MercadoPagoPanel, type MercadoPagoPanelStatus } from './MercadoPagoPanel';

/**
 * El panel de Mercado Pago con su estado real, para el perfil.
 *
 * La plataforma no vende ni cobra por una venta, así que a un admin no se le
 * muestra nada ni se consulta nada. Cualquier falla al leer el estado —tanto la
 * integración sin configurar (503) como la API caída— se trata como "no
 * disponible": el perfil tiene que cargar igual.
 */
export async function MercadoPagoSection({
    role,
    result,
}: {
    role: string;
    result?: LinkResult;
}) {
    if (role === UserRole.ADMIN) return null;

    let status: MercadoPagoPanelStatus;
    try {
        status = await api().paymentAccountStatus();
    } catch {
        status = 'unavailable';
    }

    return (
        <MercadoPagoPanel
            status={status}
            result={result}
            startAction={startMercadoPagoLink}
            unlinkAction={unlinkMercadoPagoAccount}
        />
    );
}
