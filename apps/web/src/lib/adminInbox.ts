/**
 * La bandeja del panel de la plataforma: qué espera un movimiento nuestro y
 * cuánto hace que espera. Funciones puras, sin lecturas: la pantalla y el
 * menú reciben los números ya leídos.
 */

export type InboxTab = 'accesos' | 'revision' | 'reclamos';

export interface InboxCounts {
    accesos: number;
    revision: number;
    reclamos: number;
}

const ORDER: InboxTab[] = ['accesos', 'revision', 'reclamos'];

export function adminPendingTotal(c: InboxCounts): number {
    return c.accesos + c.revision + c.reclamos;
}

export function pendingHeadline(total: number): string {
    if (total === 0) return 'Nada pendiente.';
    return total === 1 ? '1 cosa espera un movimiento nuestro.' : `${total} cosas esperan un movimiento nuestro.`;
}

/**
 * La pestaña a abrir: la pedida si es válida; si no, la primera con
 * pendientes, y sin nada pendiente la de accesos.
 */
export function chooseInboxTab(requested: string | undefined, counts: InboxCounts): InboxTab {
    if (ORDER.includes(requested as InboxTab)) return requested as InboxTab;
    return ORDER.find((tab) => counts[tab] > 0) ?? 'accesos';
}

/** «hace 2 h», «hace 1 d»: corto, para una columna de tabla. */
export function shortAgo(iso: string, now: Date): string {
    const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60000);
    if (!Number.isFinite(minutes) || minutes < 1) return 'recién';
    if (minutes < 60) return `hace ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `hace ${hours} h`;
    return `hace ${Math.floor(hours / 24)} d`;
}
