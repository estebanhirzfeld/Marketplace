/**
 * Copia un texto al portapapeles. Nunca lanza: el navegador puede negar el
 * permiso o no ofrecer la API, y copiar es una comodidad, no un paso obligado.
 */
export async function copyText(text: string, clipboard: Pick<Clipboard, 'writeText'> | undefined): Promise<boolean> {
    if (!clipboard) return false;
    try {
        await clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}
