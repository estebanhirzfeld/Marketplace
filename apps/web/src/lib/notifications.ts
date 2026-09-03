import type { NotificationDto, NotificationTypeDto } from '@marketplace/api-contract';
import { money } from './format';

/**
 * El texto de cada aviso se redacta acá y no se guarda en la base.
 *
 * Cambiar una palabra —o traducir todo— no debería ser una migración, y el
 * dominio no tiene por qué saber escribir copy.
 */
const TEXTOS: Record<NotificationTypeDto, { title: string; cuerpo: (n: NotificationDto) => string }> = {
    oferta_recibida: {
        title: 'Recibiste una oferta',
        cuerpo: (n) => (n.amount ? `Alguien ofertó ${money(n.amount)} por tu activo.` : 'Alguien ofertó por tu activo.'),
    },
    contraoferta_recibida: {
        title: 'Te contraofertaron',
        cuerpo: (n) => (n.amount ? `La propuesta sobre la mesa ahora es ${money(n.amount)}. Te toca responder.` : 'Te toca responder.'),
    },
    oferta_aceptada: {
        title: 'Aceptaron la oferta',
        cuerpo: (n) => (n.amount ? `Se acordó ${money(n.amount)}. Falta firmar el contrato.` : 'Falta firmar el contrato.'),
    },
    oferta_cancelada: {
        title: 'Tu oferta se canceló',
        cuerpo: () => 'El vendedor aceptó otra oferta sobre este activo.',
    },
    listing_aprobado: {
        title: 'Tu activo se publicó',
        cuerpo: () => 'Pasó la revisión y ya está visible en el mercado.',
    },
    listing_rechazado: {
        title: 'Tu activo fue rechazado',
        cuerpo: () => 'Revisá el motivo en tus activos y volvé a enviarlo.',
    },
    contrato_firmado: {
        title: 'El contrato quedó firmado',
        cuerpo: () => 'Las tres partes firmaron. Sigue la transferencia del activo.',
    },
    activo_en_custodia: {
        title: 'El activo está en custodia',
        cuerpo: (n) => (n.amount ? `Verificamos el activo. Te toca transferir ${money(n.amount)}.` : 'Verificamos el activo. Te toca pagar.'),
    },
    pago_confirmado: {
        title: 'Se confirmó el pago',
        cuerpo: (n) => (n.amount ? `Vas a recibir ${money(n.amount)} al cerrarse la operación.` : 'La operación está por cerrarse.'),
    },
    revision_pendiente: {
        title: 'Hay un activo esperando revisión',
        cuerpo: () => 'Un vendedor lo mandó al mercado. Falta aprobarlo o rechazarlo con un motivo.',
    },
    acceso_pendiente: {
        title: 'Una firma está esperándonos',
        cuerpo: () =>
            'Las partes acordaron el precio y no pueden firmar hasta que dejemos constancia de que tenemos acceso al activo.',
    },
    custodia_pendiente: {
        title: 'Hay que verificar un activo',
        cuerpo: () =>
            'El vendedor lo cedió. Al declarar la custodia se le pide el pago al comprador, así que es el punto de control.',
    },
    liquidacion_pendiente: {
        title: 'Hay que cerrar una operación',
        cuerpo: (n) =>
            n.amount
                ? `El pago está confirmado. Falta entregar el activo y liquidarle ${money(n.amount)} al vendedor.`
                : 'El pago está confirmado. Falta entregar el activo y liquidar al vendedor.',
    },
    denuncia_recibida: {
        title: 'Recibiste una denuncia',
        cuerpo: () =>
            'La otra parte abrió un reclamo sobre una de tus operaciones. Podés leer qué dice y ver la misma documentación que ella.',
    },
    operacion_completada: {
        title: 'Operación cerrada',
        cuerpo: () => 'El activo cambió de manos y el dinero se liquidó.',
    },
};

export function textFor(n: NotificationDto): { title: string; cuerpo: string } {
    const t = TEXTOS[n.type];
    return { title: t.title, cuerpo: t.cuerpo(n) };
}

/** A dónde lleva el aviso. La operación gana sobre el listing. */
/** Los avisos de la plataforma que no apuntan a una operación se resuelven en el panel. */
const AL_PANEL: NotificationTypeDto[] = ['revision_pendiente'];

export function linkFor(n: NotificationDto): string {
    if (AL_PANEL.includes(n.type)) return '/admin';
    if (n.operationId) return `/operaciones/${n.operationId}`;
    if (n.listingId) return `/listings/${n.listingId}`;
    return '/operaciones';
}

export function timeAgo(iso: string): string {
    const minutos = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (minutos < 1) return 'recién';
    if (minutos < 60) return `hace ${minutos} min`;

    const horas = Math.floor(minutos / 60);
    if (horas < 24) return `hace ${horas} h`;

    const dias = Math.floor(horas / 24);
    return dias === 1 ? 'ayer' : `hace ${dias} días`;
}
