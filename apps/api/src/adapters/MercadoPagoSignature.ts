import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Valida que un aviso venga efectivamente de MercadoPago.
 *
 * El encabezado `x-signature` trae `ts` y `v1` separados por coma. Se reconstruye
 * el manifiesto `id:<dataId>;request-id:<xRequestId>;ts:<ts>;`, se le aplica
 * HMAC-SHA256 con el secreto del webhook y el resultado tiene que coincidir
 * con `v1`.
 *
 * Es defensa en profundidad y no la defensa principal: del aviso solo se toma
 * el identificador del pago, y el estado se consulta después contra la propia
 * pasarela. Un aviso falsificado que pasara por acá seguiría sin poder dar por
 * pagada una operación.
 */
export function firmaValida(input: {
    signature: string | undefined;
    requestId: string | undefined;
    dataId: string;
    secret: string;
}): boolean {
    if (!input.signature) return false;

    const partes = new Map(
        input.signature.split(',').map((p) => {
            const [clave, valor] = p.split('=');
            return [clave?.trim(), valor?.trim()] as [string, string];
        }),
    );

    const ts = partes.get('ts');
    const v1 = partes.get('v1');
    if (!ts || !v1) return false;

    const manifiesto = `id:${input.dataId};request-id:${input.requestId ?? ''};ts:${ts};`;
    const esperado = createHmac('sha256', input.secret).update(manifiesto).digest('hex');

    // Comparación de tiempo constante: comparar con === filtra información
    // sobre cuántos caracteres coincidieron.
    const a = Buffer.from(esperado, 'utf8');
    const b = Buffer.from(v1, 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
}
