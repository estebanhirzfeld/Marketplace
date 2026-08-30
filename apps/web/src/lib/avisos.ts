import type { NotificationDto, NotificationTypeDto } from '@marketplace/api-contract';
import { monto } from './formato';

/**
 * El texto de cada aviso se redacta acá y no se guarda en la base.
 *
 * Cambiar una palabra —o traducir todo— no debería ser una migración, y el
 * dominio no tiene por qué saber escribir copy.
 */
const TEXTOS: Record<NotificationTypeDto, { titulo: string; cuerpo: (n: NotificationDto) => string }> = {
    oferta_recibida: {
        titulo: 'Recibiste una oferta',
        cuerpo: (n) => (n.amount ? `Alguien ofertó ${monto(n.amount)} por tu activo.` : 'Alguien ofertó por tu activo.'),
    },
    contraoferta_recibida: {
        titulo: 'Te contraofertaron',
        cuerpo: (n) => (n.amount ? `La propuesta sobre la mesa ahora es ${monto(n.amount)}. Te toca responder.` : 'Te toca responder.'),
    },
    oferta_aceptada: {
        titulo: 'Aceptaron la oferta',
        cuerpo: (n) => (n.amount ? `Se acordó ${monto(n.amount)}. Falta firmar el contrato.` : 'Falta firmar el contrato.'),
    },
    oferta_cancelada: {
        titulo: 'Tu oferta se canceló',
        cuerpo: () => 'El vendedor aceptó otra oferta sobre este activo.',
    },
    listing_aprobado: {
        titulo: 'Tu activo se publicó',
        cuerpo: () => 'Pasó la revisión y ya está visible en el mercado.',
    },
    listing_rechazado: {
        titulo: 'Tu activo fue rechazado',
        cuerpo: () => 'Revisá el motivo en tus activos y volvé a enviarlo.',
    },
    contrato_firmado: {
        titulo: 'El contrato quedó firmado',
        cuerpo: () => 'Las tres partes firmaron. Sigue la transferencia del activo.',
    },
    activo_en_custodia: {
        titulo: 'El activo está en custodia',
        cuerpo: (n) => (n.amount ? `Verificamos el activo. Te toca transferir ${monto(n.amount)}.` : 'Verificamos el activo. Te toca pagar.'),
    },
    pago_confirmado: {
        titulo: 'Se confirmó el pago',
        cuerpo: (n) => (n.amount ? `Vas a recibir ${monto(n.amount)} al cerrarse la operación.` : 'La operación está por cerrarse.'),
    },
    operacion_completada: {
        titulo: 'Operación cerrada',
        cuerpo: () => 'El activo cambió de manos y el dinero se liquidó.',
    },
};

export function textoDe(n: NotificationDto): { titulo: string; cuerpo: string } {
    const t = TEXTOS[n.type];
    return { titulo: t.titulo, cuerpo: t.cuerpo(n) };
}

/** A dónde lleva el aviso. La operación gana sobre el listing. */
export function enlaceDe(n: NotificationDto): string {
    if (n.operationId) return `/operaciones/${n.operationId}`;
    if (n.listingId) return `/listings/${n.listingId}`;
    return '/operaciones';
}

export function haceCuanto(iso: string): string {
    const minutos = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (minutos < 1) return 'recién';
    if (minutos < 60) return `hace ${minutos} min`;

    const horas = Math.floor(minutos / 60);
    if (horas < 24) return `hace ${horas} h`;

    const dias = Math.floor(horas / 24);
    return dias === 1 ? 'ayer' : `hace ${dias} días`;
}
