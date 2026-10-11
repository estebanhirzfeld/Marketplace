/** Lo único que se necesita del almacenamiento del navegador. */
export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;

const key = (listingId: string) => `acceso:${listingId}:cuenta-de-marca`;

/**
 * El paso 1 («ya pasé el canal a una cuenta de marca») no lo comprueba nadie:
 * es una comodidad del vendedor, por eso vive en su navegador. Cualquier falla
 * del almacenamiento (bloqueado, modo privado) se trata como «no recordado».
 */
export function readBrandAccountDone(storage: KeyValueStorage | null, listingId: string): boolean {
    try {
        return storage?.getItem(key(listingId)) === '1';
    } catch {
        return false;
    }
}

export function writeBrandAccountDone(storage: KeyValueStorage | null, listingId: string): void {
    try {
        storage?.setItem(key(listingId), '1');
    } catch {
        // Sin almacenamiento el paso simplemente no queda recordado.
    }
}
