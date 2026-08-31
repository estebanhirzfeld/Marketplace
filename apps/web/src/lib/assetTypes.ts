import { cache } from 'react';
import type { AssetTypeDescriptorDto } from '@marketplace/api-contract';
import { api } from './api';

/**
 * Lo que sabe de sí mismo cada tipo de activo.
 *
 * Las pantallas que muestran muchos activos a la vez —la grilla del mercado,
 * el catálogo del vendedor— no reciben el descriptor en cada fila: sería
 * repetir la misma metadata una vez por tarjeta. Se pide una sola vez por
 * request y se busca por tipo.
 *
 * `cache` es de React y memoriza por request, así que varias secciones de la
 * misma página comparten la llamada sin coordinarse entre ellas.
 */
export const assetTypes = cache(async (): Promise<AssetTypeDescriptorDto[]> => {
    try {
        return await api().assetTypes();
    } catch {
        // Una grilla sin metadata se dibuja con lo que tiene; caerse entera
        // por no poder poner una etiqueta sería peor.
        return [];
    }
});

/** El descriptor de un tipo, o `undefined` si la metadata no llegó. */
export async function descriptorFor(
    assetType: string,
): Promise<AssetTypeDescriptorDto | undefined> {
    return (await assetTypes()).find((d) => d.assetType === assetType);
}

/**
 * Cómo nombrar cada tipo, listo para usar dentro de un `map`.
 *
 * Las listas dibujan muchas filas de una y no pueden esperar una promesa por
 * cada una, así que la página resuelve la metadata una vez arriba y recibe una
 * función sincrónica. Si la metadata no llegó, devuelve el código crudo antes
 * que dejar la fila sin nombre.
 */
export async function assetTypeLabeller(): Promise<(assetType: string) => string> {
    const porTipo = new Map((await assetTypes()).map((d) => [d.assetType, d.label]));
    return (assetType) => (porTipo.get(assetType) ?? assetType).toUpperCase();
}
