'use client';

import { useState } from 'react';
import type { ComponentProps } from 'react';
import { Button } from './ui';
import { DnsVerificationDialog } from './DnsVerificationDialog';

/**
 * El botón que abre el diálogo de la comprobación por DNS. Vive aparte porque
 * `VerificationCards` y `DraftPanel` son componentes de servidor y el estado de
 * abierto o cerrado es del navegador.
 */
export function DnsVerificationTrigger({
    className,
    getChallenge,
    checkAction,
    adsenseAction,
}: {
    className?: string;
} & Pick<ComponentProps<typeof DnsVerificationDialog>, 'getChallenge' | 'checkAction' | 'adsenseAction'>) {
    const [open, setOpen] = useState(false);

    return (
        <>
            <Button type="button" className={className} onClick={() => setOpen(true)}>
                Comprobar con tu DNS
            </Button>
            <DnsVerificationDialog
                open={open}
                onClose={() => setOpen(false)}
                getChallenge={getChallenge}
                checkAction={checkAction}
                adsenseAction={adsenseAction}
            />
        </>
    );
}
