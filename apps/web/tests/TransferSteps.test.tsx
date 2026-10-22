import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { HandoverStepDto, StepProgressDto } from '@marketplace/api-contract';
import {
    TransferStepsList,
    DomainDeliveryStatus,
    AdminDomainTransferPanel,
    DomainLockNotice,
    SaleRequirementsPanel,
} from '@/components/TransferSteps';
import { fechaLarga } from '@/lib/format';

/*
 * El traspaso de un sitio paso a paso. El vendedor y el admin ven cada paso con
 * su estado y su plazo; el comprador, solo si le toca aceptar el dominio; el
 * admin, además, los botones que lo hacen avanzar.
 */

const DEADLINE = '2026-10-30T09:00:00.000Z';

const PASOS: HandoverStepDto[] = [
    { id: '2', key: 'domain-to-platform', check: 'automatic', description: 'd', title: 'Trasladá el dominio a nuestra cuenta' },
    { id: '3', key: 'hosting', check: 'declared', description: 'd', title: 'Dejá el hosting y los archivos listos' },
    { id: '4', key: 'code', check: 'declared', description: 'd', title: 'Dejá el código y la base de datos listos' },
];

function texto(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function accion(state: { error?: string }) {
    return state;
}

describe('TransferStepsList', () => {
    it('un paso sin progreso está pendiente y sin plazo', () => {
        const t = texto(renderToStaticMarkup(<TransferStepsList steps={PASOS} progress={[]} />));

        expect(t).toContain('Trasladá el dominio a nuestra cuenta');
        expect(t.match(/PENDIENTE/g)).toHaveLength(3);
        expect(t).not.toMatch(/Vence/);
    });

    it('un paso en curso muestra hasta cuándo vale la invitación', () => {
        const progress: StepProgressDto[] = [
            { stepKey: 'domain-to-platform', status: 'waiting', deadlineAt: DEADLINE, attested: false },
        ];

        const t = texto(renderToStaticMarkup(<TransferStepsList steps={PASOS} progress={progress} />));

        expect(t).toContain('EN CURSO');
        expect(t).toContain(`Vence el ${fechaLarga(DEADLINE)}`);
    });

    it('un paso cumplido a mano dice que lo comprobó la plataforma', () => {
        const progress: StepProgressDto[] = [{ stepKey: 'hosting', status: 'done', attested: true }];

        const t = texto(renderToStaticMarkup(<TransferStepsList steps={PASOS} progress={progress} />));

        expect(t).toContain('LISTO');
        expect(t).toContain('Lo comprobó la plataforma.');
    });

    it('un paso vencido dice cuándo venció', () => {
        const progress: StepProgressDto[] = [
            { stepKey: 'domain-to-platform', status: 'expired', deadlineAt: DEADLINE, attested: false },
        ];

        const t = texto(renderToStaticMarkup(<TransferStepsList steps={PASOS} progress={progress} />));

        expect(t).toContain('VENCIDO');
        expect(t).toContain(`Venció el ${fechaLarga(DEADLINE)}`);
    });

    it('sin pasos no muestra nada', () => {
        expect(renderToStaticMarkup(<TransferStepsList steps={[]} progress={[]} />)).toBe('');
    });
});

describe('DomainDeliveryStatus — lo que ve el comprador', () => {
    const MAIL = 'comprador@correo.com';

    it('antes de que empiece la entrega le dice a dónde va el dominio', () => {
        const t = texto(renderToStaticMarkup(<DomainDeliveryStatus recipient={MAIL} />));

        expect(t).toBe(`Vamos a trasladarte el dominio a la cuenta de Hostinger de ${MAIL}.`);
    });

    it('con la invitación mandada le pide aceptarla y le dice hasta cuándo', () => {
        const t = texto(
            renderToStaticMarkup(
                <DomainDeliveryStatus
                    recipient={MAIL}
                    progress={{ stepKey: 'domain-to-buyer', status: 'waiting', deadlineAt: DEADLINE, attested: false }}
                />,
            ),
        );

        expect(t).toBe(
            `Te mandamos la invitación a ${MAIL}. Aceptala desde tu cuenta de Hostinger antes del ${fechaLarga(DEADLINE)}.`,
        );
    });

    it('con el dominio entregado se lo confirma', () => {
        const t = texto(
            renderToStaticMarkup(
                <DomainDeliveryStatus recipient={MAIL} progress={{ stepKey: 'domain-to-buyer', status: 'done', attested: false }} />,
            ),
        );

        expect(t).toBe('El dominio ya está en tu cuenta de Hostinger.');
    });

    it('con la operación cerrada no le promete un traslado, aunque no haya progreso guardado', () => {
        const t = texto(renderToStaticMarkup(<DomainDeliveryStatus recipient={MAIL} completed />));

        expect(t).toBe('El dominio ya está en tu cuenta de Hostinger.');
    });

    it('con la entrega rechazada le dice que lo van a contactar, no que va a recibirlo', () => {
        const t = texto(
            renderToStaticMarkup(
                <DomainDeliveryStatus recipient={MAIL} progress={{ stepKey: 'domain-to-buyer', status: 'rejected', attested: false }} />,
            ),
        );

        expect(t).toBe('No pudimos completar la entrega del dominio. Te vamos a contactar para resolverlo.');
    });

    it('con la invitación vencida le avisa que va a llegar otra', () => {
        const t = texto(
            renderToStaticMarkup(
                <DomainDeliveryStatus
                    recipient={MAIL}
                    progress={{ stepKey: 'domain-to-buyer', status: 'expired', deadlineAt: DEADLINE, attested: false }}
                />,
            ),
        );

        expect(t).toBe('La invitación venció sin aceptarse. Te vamos a mandar una nueva.');
    });
});

describe('AdminDomainTransferPanel', () => {
    const acciones = {
        checkCustody: accion,
        attest: () => accion,
        deliver: accion,
        checkDelivery: accion,
    };

    it('con la transferencia en curso ofrece comprobar el dominio y dar por cumplidos los pasos declarados pendientes', () => {
        const t = texto(
            renderToStaticMarkup(
                <AdminDomainTransferPanel
                    status="transfer_in_progress"
                    steps={PASOS}
                    progress={[{ stepKey: 'code', status: 'done', attested: true }]}
                    actions={acciones}
                />,
            ),
        );

        expect(t).toContain('Comprobar el dominio en Hostinger');
        expect(t).toContain('Dar por cumplido: Dejá el hosting y los archivos listos');
        expect(t).not.toContain('Dar por cumplido: Dejá el código y la base de datos listos');
        expect(t).not.toContain('Dar por cumplido: Trasladá el dominio');
        expect(t).not.toMatch(/entrega/i);
    });

    it('con el pago confirmado y sin entrega iniciada ofrece iniciarla', () => {
        const t = texto(
            renderToStaticMarkup(
                <AdminDomainTransferPanel status="payment_received" steps={PASOS} progress={[]} actions={acciones} />,
            ),
        );

        expect(t).toContain('Iniciar la entrega del dominio');
        expect(t).not.toContain('Comprobar la entrega');
        expect(t).not.toContain('Comprobar el dominio en Hostinger');
    });

    it('con la entrega en curso ofrece comprobarla, y vencida ofrece iniciarla de nuevo', () => {
        const enCurso = texto(
            renderToStaticMarkup(
                <AdminDomainTransferPanel
                    status="payment_received"
                    steps={PASOS}
                    progress={[{ stepKey: 'domain-to-buyer', status: 'waiting', deadlineAt: DEADLINE, attested: false }]}
                    actions={acciones}
                />,
            ),
        );
        const vencida = texto(
            renderToStaticMarkup(
                <AdminDomainTransferPanel
                    status="payment_received"
                    steps={PASOS}
                    progress={[{ stepKey: 'domain-to-buyer', status: 'expired', deadlineAt: DEADLINE, attested: false }]}
                    actions={acciones}
                />,
            ),
        );

        expect(enCurso).toContain('Comprobar la entrega');
        expect(enCurso).not.toContain('Iniciar la entrega');
        expect(vencida).toContain('Iniciar la entrega del dominio de nuevo');
    });

    it('con la operación cerrada no ofrece nada', () => {
        expect(
            renderToStaticMarkup(
                <AdminDomainTransferPanel status="completed" steps={PASOS} progress={[]} actions={acciones} />,
            ),
        ).toBe('');
    });
});

/*
 * El vendedor de un sitio, antes de vender, solo tiene que tener el dominio en
 * Hostinger. No hay nada que declarar: se comprueba solo al firmar.
 */
describe('SaleRequirementsPanel', () => {
    const PASO: HandoverStepDto = {
        id: '1',
        key: 'domain-at-hostinger',
        check: 'declared',
        description: 'd',
        title: 'Tené el dominio en Hostinger',
        instruction: 'Para venderlo, el dominio tiene que estar en una cuenta de Hostinger.',
        details: ['Hostinger es el único registrador con el que trabajamos.'],
    };

    it('muestra el paso con su instrucción y lo que conviene saber, sin nada que declarar', () => {
        const t = texto(renderToStaticMarkup(<SaleRequirementsPanel steps={[PASO]} />));

        expect(t).toContain('ANTES DE VENDER');
        expect(t).toContain('Tené el dominio en Hostinger');
        expect(t).toContain('Para venderlo, el dominio tiene que estar en una cuenta de Hostinger.');
        expect(t).toContain('Hostinger es el único registrador con el que trabajamos.');
        expect(t).toContain('Lo comprobamos solos cuando se firme el contrato');
        expect(t).not.toMatch(/Ya lo hice|TRANSFERENCIA INMEDIATA|NIVELES/i);
    });

    it('sin pasos no muestra nada', () => {
        expect(renderToStaticMarkup(<SaleRequirementsPanel steps={[]} />)).toBe('');
    });
});

describe('DomainLockNotice', () => {
    it('le avisa al comprador, antes de ofertar, el bloqueo de 60 días', () => {
        expect(texto(renderToStaticMarkup(<DomainLockNotice />))).toBe(
            'Cuando recibas el dominio, durante 60 días no se va a poder mudar a otro registrador: es una regla de la ICANN. Mientras tanto es tuyo y funciona desde tu cuenta de Hostinger.',
        );
    });
});
