import type { ActionState } from '@/app/vender/actions';

/**
 * Cuándo el diálogo de acceso se cierra solo: el aviso salió bien y la acción
 * ya terminó. Un error lo deja abierto para mostrarlo ahí mismo.
 */
export function accessDialogShouldClose(state: ActionState, pending: boolean): boolean {
    return state.ok === true && !pending;
}
