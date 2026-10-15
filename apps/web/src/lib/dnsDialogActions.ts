import type { DomainOwnershipChallengeDto } from '@marketplace/api-contract';
import type { DomainCheckState } from '@/app/vender/actions';

export const DNS_TRANSPORT_ERROR = 'No pudimos consultar tu DNS. Probá de nuevo.';

export type ChallengeResult = { challenge?: DomainOwnershipChallengeDto; error?: string };

/** El resultado de una consulta, con la sesión del diálogo que la pidió. */
export type StampedCheckState = DomainCheckState & { session: number };

/**
 * Llama a la acción de consulta sin dejar que un fallo de red llegue al límite
 * de error de la página: lo vuelve un error que el diálogo muestra. Marca el
 * resultado con la sesión que lo pidió, para descartarlo si el diálogo se
 * cerró mientras tanto.
 */
export async function safeCheck(
    action: (state: DomainCheckState) => Promise<DomainCheckState>,
    state: DomainCheckState,
    session: number,
): Promise<StampedCheckState> {
    try {
        return { ...(await action(state)), session };
    } catch {
        return { verified: false, error: DNS_TRANSPORT_ERROR, session };
    }
}

/** Lo mismo para pedir el registro: un rechazo es un error con «Reintentar». */
export async function safeChallenge(getChallenge: () => Promise<ChallengeResult>): Promise<ChallengeResult> {
    try {
        return await getChallenge();
    } catch {
        return { error: DNS_TRANSPORT_ERROR };
    }
}

/**
 * Lo que el diálogo muestra del último resultado: el estado de `useActionState`
 * sobrevive al cierre, así que un resultado de otra sesión no cuenta.
 */
export function visibleCheckState(state: StampedCheckState, session: number): DomainCheckState {
    if (state.session !== session) return {};
    return { verified: state.verified, error: state.error };
}
