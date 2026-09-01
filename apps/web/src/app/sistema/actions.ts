'use server';

/*
 * Acciones de muestra para el catálogo de componentes.
 *
 * Los formularios de la app reciben Server Actions como prop, y un Server
 * Component no puede pasarle a un Client Component una función que no sea una
 * Server Action. Estas no hacen nada: solo existen para poder renderizar los
 * formularios reales en /sistema.
 */

type State = { error?: string; ok?: boolean; message?: string };

export async function noop(): Promise<State> {
    return { ok: true };
}
