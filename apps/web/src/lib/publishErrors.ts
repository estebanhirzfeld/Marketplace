import type { ApiError } from '@marketplace/api-client';

/**
 * La API rechaza publicar sin cuenta de Mercado Pago vinculada con un
 * `INVALID_STATE` genérico: no hay un código propio, así que se reconoce por
 * el mensaje, que ya habla de Mercado Pago. Se acota a este caso para no
 * mandar a vincular una cuenta cuando lo que falta es otra cosa.
 */
export function isMissingMercadoPagoLink(e: ApiError): boolean {
    return e.code === 'INVALID_STATE' && /Mercado Pago/.test(e.message);
}

export const LINK_MERCADOPAGO = { href: '/perfil#mercadopago', label: 'Vincular Mercado Pago' } as const;
