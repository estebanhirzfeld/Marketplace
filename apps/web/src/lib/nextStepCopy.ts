import type { NextActionIdDto, NextStepDto, OperationNextDto, OperationRoleDto } from '@marketplace/api-contract';
import { fechaLarga } from './format';

/*
 * Los textos de «Tu próximo paso». La API dice qué le toca a cada rol; acá se
 * dice cómo, para la persona que lo lee y según lo que se vende. Los avisos
 * siguen el mismo reparto (`notifications.ts`).
 */

export interface NextStepCopy {
    /** Lo que tiene que hacer quien mira, o a quién está esperando. */
    title: string;
    /** El porqué o el cómo, en una línea. */
    body?: string;
    /** El plazo, ya dicho. */
    deadline?: string;
    /** Una tarea que no traba nada, para hacer mientras se espera. */
    meanwhile?: { title: string; body: string };
}

type AssetKind = 'web' | 'youtube';

function kindOf(assetType?: string): AssetKind {
    return assetType === 'web' ? 'web' : 'youtube';
}

const WHO: Record<OperationRoleDto, string> = {
    buyer: 'al comprador',
    seller: 'al vendedor',
    platform: 'a la plataforma',
};

/** Lo que hace cada acción, dicho en infinitivo para «le toca a X: …». */
function doing(id: NextActionIdDto, kind: AssetKind): string {
    switch (id) {
        case 'respond_offer':
            return 'responder la oferta';
        case 'sign_contract':
            return 'firmar el contrato';
        case 'register_platform_access':
            return 'registrar su acceso al canal';
        case 'declare_recipient':
            return kind === 'web' ? 'decir en qué cuenta de Hostinger recibe el dominio' : 'decir en qué cuenta de Google recibe el canal';
        case 'declare_handover':
            return kind === 'web' ? 'iniciar el traslado del dominio a nuestra cuenta' : 'cedernos el control del canal';
        case 'move_domain_to_platform':
            return 'trasladar el dominio a nuestra cuenta de Hostinger';
        case 'verify_custody':
            return kind === 'web' ? 'confirmar la custodia del dominio' : 'verificar la custodia del canal';
        case 'pay':
            return 'pagar la compra';
        case 'enable_payment_method':
            return 'habilitar un medio de pago';
        case 'link_payment_account':
            return 'decir dónde cobra';
        case 'confirm_seller_receipt':
            return 'confirmar que le llegó la transferencia';
        case 'confirm_commission_receipt':
            return 'confirmar la transferencia de la comisión';
        case 'deliver_asset':
            return kind === 'web' ? 'entregarle el dominio al comprador' : 'entregarle el canal al comprador';
        case 'accept_delivery':
            return 'aceptar el dominio desde el mail de Hostinger';
        case 'complete_operation':
            return 'cerrar la operación';
    }
}

/** El texto para quien tiene que hacer la acción. */
function actCopy(id: NextActionIdDto, kind: AssetKind): { title: string; body: string } {
    switch (id) {
        case 'respond_offer':
            return {
                title: 'Respondé la oferta',
                body: 'Aceptá el precio que está sobre la mesa o proponé otro. Aceptar cancela las demás ofertas sobre el activo.',
            };
        case 'sign_contract':
            return {
                title: 'Firmá el contrato',
                body: 'El precio ya está acordado. Al firmar, las dos partes quedan comprometidas: hasta entonces todavía se puede cancelar.',
            };
        case 'register_platform_access':
            return {
                title: 'Registrá el acceso al canal',
                body: 'Las partes no pueden firmar hasta que quede constancia de que la plataforma administra el canal.',
            };
        case 'declare_recipient':
            return kind === 'web'
                ? {
                      title: 'Decinos dónde recibir el dominio',
                      body: 'El mail de tu cuenta de Hostinger: ahí te vamos a trasladar el dominio.',
                  }
                : {
                      title: 'Decinos dónde recibir el canal',
                      body: 'La cuenta de Google a la que te vamos a invitar como propietario del canal.',
                  };
        case 'declare_handover':
            return kind === 'web'
                ? {
                      title: 'Iniciá el traslado del dominio',
                      body: 'Seguí los pasos para trasladar el dominio a nuestra cuenta de Hostinger y declaralo acá.',
                  }
                : {
                      title: 'Cedenos el control del canal',
                      body: 'Seguí los pasos para hacernos propietarios principales y declaralo acá.',
                  };
        case 'move_domain_to_platform':
            return {
                title: 'Trasladá el dominio a nuestra cuenta',
                body: 'Desde tu cuenta de Hostinger, iniciá el traslado hacia la cuenta de la plataforma. Lo vemos llegar solos y lo aceptamos.',
            };
        case 'verify_custody':
            return kind === 'web'
                ? {
                      title: 'Confirmá la custodia del dominio',
                      body: 'El dominio ya está en nuestra cuenta de Hostinger: comprobalo y la custodia se confirma sola.',
                  }
                : {
                      title: 'Verificá la custodia del canal',
                      body: 'Comprobá que la plataforma quedó como propietaria principal y que el vendedor ya no tiene acceso.',
                  };
        case 'pay':
            return {
                title: 'Pagá la compra',
                body: 'El activo ya está en nuestra custodia y verificado. Recién ahora corresponde pagar.',
            };
        case 'enable_payment_method':
            return {
                title: 'Habilitá un medio de pago',
                body: 'El comprador no tiene cómo pagar: configurá Mercado Pago o las instrucciones de transferencia.',
            };
        case 'link_payment_account':
            return {
                title: 'Decinos dónde cobrar',
                body: 'Vinculá Mercado Pago o declará tu cuenta bancaria: el comprador te paga directo ahí. Hasta entonces no puede pagar.',
            };
        case 'confirm_seller_receipt':
            return {
                title: 'Confirmá que te llegó la transferencia',
                body: 'El comprador subió el comprobante de lo que te transfirió. Fijate en tu cuenta que se haya acreditado y confirmalo, o decile qué está mal.',
            };
        case 'confirm_commission_receipt':
            return {
                title: 'Confirmá la transferencia de la comisión',
                body: 'El comprador subió el comprobante de la comisión. Fijate que se haya acreditado en la cuenta de la plataforma y confirmalo, o decile qué está mal.',
            };
        case 'deliver_asset':
            return kind === 'web'
                ? {
                      title: 'Entregale el dominio al comprador',
                      body: 'Iniciá el traslado a la cuenta de Hostinger que declaró el comprador.',
                  }
                : {
                      title: 'Entregale el canal al comprador',
                      body: 'Invitá al comprador como propietario y, cuando sea propietario principal, registrá la entrega.',
                  };
        case 'accept_delivery':
            return {
                title: 'Aceptá el dominio en Hostinger',
                body: 'Te mandamos la invitación a tu cuenta de Hostinger. Aceptala desde el mail que te llegó.',
            };
        case 'complete_operation':
            return {
                title: 'Cerrá la operación',
                body: 'El comprador ya tiene el activo. Registrá la entrega para cerrar.',
            };
    }
}

function deadlineText(deadline: string | undefined, who: 'self' | OperationRoleDto): string | undefined {
    if (!deadline) return undefined;
    return who === 'self' ? `Tenés hasta el ${fechaLarga(deadline)}.` : `Tiene hasta el ${fechaLarga(deadline)}.`;
}

/** A quién se espera, y para qué, según lo que le toca a esa parte. */
function waitCopy(step: Extract<NextStepDto, { kind: 'wait' }>, next: OperationNextDto, kind: AssetKind): NextStepCopy {
    const [first] = step.waitingOn;
    const theirs = next.byRole[first];

    if (theirs?.kind === 'act') {
        return {
            title: `Le toca ${WHO[first]}: ${doing(theirs.id, kind)}.`,
            deadline: deadlineText(theirs.deadline ?? step.deadline, first),
        };
    }

    // Nadie actúa: se espera a la plataforma sin una tarea (el contrato o un plazo de YouTube).
    if (step.deadline) {
        return {
            title: `La firma se habilita el ${fechaLarga(step.deadline)}.`,
            body: 'Es la espera de siete días que pide YouTube antes de cambiar el propietario principal.',
        };
    }
    return { title: 'Estamos preparando el contrato.', body: 'Apenas esté, lo vas a poder leer y firmar desde acá.' };
}

/** «Tu próximo paso» para un rol. */
export function nextStepCopy(next: OperationNextDto, role: OperationRoleDto, assetType?: string): NextStepCopy {
    const kind = kindOf(assetType);
    const step = next.byRole[role];

    if (step.kind === 'done') {
        return { title: 'La operación se cerró.', body: 'El comprador tiene el activo y el vendedor cobró su parte.' };
    }
    if (step.kind === 'cancelled') {
        return { title: 'La operación se canceló.', body: 'No se puede retomar. Si no quedó otra operación en curso, el activo volvió al mercado.' };
    }
    if (step.kind === 'wait') return waitCopy(step, next, kind);

    if (!step.blocking) {
        // Una tarea que no traba nada: primero a quién se espera.
        const blocker = next.turn[0];
        const waiting: NextStepCopy = blocker
            ? waitCopy({ kind: 'wait', waitingOn: [blocker] }, next, kind)
            : { title: 'Estamos esperando el próximo paso.' };
        return { ...waiting, meanwhile: actCopy(step.id, kind) };
    }

    return { ...actCopy(step.id, kind), deadline: deadlineText(step.deadline, 'self') };
}

/**
 * En qué está una parte, dicho a la plataforma: «Le toca: …» o «Espera al
 * vendedor». Es la línea del admin, que mira las dos partes a la vez.
 */
export function partyStatusLine(next: OperationNextDto, role: OperationRoleDto, assetType?: string): string {
    const kind = kindOf(assetType);
    const step = next.byRole[role];
    switch (step.kind) {
        case 'done':
            return 'Terminó.';
        case 'cancelled':
            return 'La operación se canceló.';
        case 'wait':
            return `Espera ${WHO[step.waitingOn[0]]}.`;
        case 'act': {
            const until = step.deadline ? ` Tiene hasta el ${fechaLarga(step.deadline)}.` : '';
            return step.blocking
                ? `Le toca: ${doing(step.id, kind)}.${until}`
                : `Puede adelantar: ${doing(step.id, kind)}.`;
        }
    }
}

const STAGE_TEXT: Record<OperationNextDto['timeline'][number]['key'], { title: string; text: string }> = {
    negotiation: { title: 'Negociación', text: 'Comprador y vendedor acuerdan el precio.' },
    contract: { title: 'Contrato', text: 'Las dos partes firman. Después, nadie se baja.' },
    custody: { title: 'Custodia', text: 'El vendedor nos cede el activo y verificamos que lo tenemos.' },
    payment: { title: 'Pago', text: 'Con el activo en custodia, el comprador paga.' },
    delivery: { title: 'Entrega', text: 'Le entregamos el activo a la cuenta que declaró el comprador.' },
    closing: { title: 'Cierre', text: 'El comprador tiene el activo y el vendedor cobró.' },
};

export function stageCopy(key: OperationNextDto['timeline'][number]['key']): { title: string; text: string } {
    return STAGE_TEXT[key];
}
