/**
 * Indica si una dirección IPv4 es enrutable en internet. Se usa para no
 * consultar servidores cuyas direcciones fijó el vendedor (los NS de su
 * dominio) y apuntan a la red interna o a servicios de metadatos.
 *
 * Descarta: 0.0.0.0/8, 10.0.0.0/8, 100.64.0.0/10, 127.0.0.0/8,
 * 169.254.0.0/16, 172.16.0.0/12, 192.0.0.0/24, 192.168.0.0/16,
 * 198.18.0.0/15, 224.0.0.0/4 y 240.0.0.0/4. Lo que no es una IPv4 bien
 * formada también se descarta.
 */
export function isPublicIPv4(address: string): boolean {
    const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(address);
    if (!match) return false;

    const [a, b, c, d] = match.slice(1).map(Number);
    if ([a, b, c, d].some((octet) => octet > 255)) return false;

    if (a === 0 || a === 10 || a === 127) return false;
    if (a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 0 && c === 0) return false;
    if (a === 192 && b === 168) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;

    return true;
}
