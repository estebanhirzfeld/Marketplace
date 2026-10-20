'use server';

/*
 * Acciones de muestra para el catálogo de componentes.
 *
 * Los formularios de la app reciben Server Actions como prop, y un Server
 * Component no puede pasarle a un Client Component una función que no sea una
 * Server Action. Estas no hacen nada: solo existen para poder renderizar los
 * formularios reales en /sistema.
 */

import type { DomainOwnershipChallengeDto } from '@marketplace/api-contract';

type State = { error?: string; ok?: boolean; message?: string };

export async function noop(): Promise<State> {
    return { ok: true };
}

/** Para los formularios cuya acción no devuelve un estado (los que redirigen). */
export async function noopVoid(): Promise<void> {}

/** La valuación de muestra del formulario de un canal conectado. */
export async function noopEstimate(): Promise<{ cents: number; currency: string }> {
    return { cents: 1_250_000, currency: 'USD' };
}

/** El registro de muestra que pide el diálogo de la comprobación por DNS. */
export async function noopDnsChallenge(): Promise<{ challenge: DomainOwnershipChallengeDto }> {
    return {
        challenge: {
            domain: 'deliaorrego.online',
            host: '@',
            value: 'traspaso-verificacion=178cd4d4534d977fbdf74f70',
            nameservers: ['dns1.p08.nsone.net'],
            provider: 'hostinger',
        },
    };
}

/** La consulta de muestra: el registro nunca aparece. */
export async function noopDnsCheck(): Promise<{ verified?: boolean; error?: string }> {
    return { verified: false };
}
