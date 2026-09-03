import type { CustodyAccountDto } from '@marketplace/api-contract';
import { api } from '@/lib/api';
import { requireAdmin } from '@/lib/guards';
import { Reveal } from '@/components/Reveal';
import { Heading } from '@/components/ui';
import { CustodyAccountsManager } from '@/components/CustodyAccountsManager';

export const metadata = { title: 'Cuentas de custodia · Traspaso' };

/**
 * El ABM de las identidades que sostienen los activos en custodia.
 *
 * Sin al menos una cuenta activa, registrar el acceso de la plataforma a un
 * activo es imposible —lo exige— y el flujo entero queda trabado. Por eso el
 * alta vive acá y no solo en la semilla: cualquier entorno tiene que poder
 * crear la suya.
 */
export default async function CuentasDeCustodia() {
    await requireAdmin();

    let cuentas: CustodyAccountDto[] = [];
    try {
        cuentas = await api().listCustodyAccounts();
    } catch {
        cuentas = [];
    }

    return (
        <div className="mx-auto max-w-[860px] px-6 py-14 sm:px-12">
            <Reveal>
                <Heading sub="La identidad real —una cuenta de Google, un usuario de registrador— que figura como propietaria mientras un activo está en custodia de la plataforma. Solo se guarda su identificador, nunca una credencial.">
                    Cuentas de custodia
                </Heading>
            </Reveal>

            <Reveal delay={80} className="mt-10">
                <CustodyAccountsManager cuentas={cuentas} />
            </Reveal>
        </div>
    );
}
