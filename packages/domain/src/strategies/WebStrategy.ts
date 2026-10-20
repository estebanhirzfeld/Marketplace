// REVIEW Deuda Técnica, se puede mejorar los cálculos de las métricas, y el cálculo de precios.

import {
    AssetFieldDescriptor,
    AssetTypeDescriptor,
    IAssetStrategy,
    MAX_RECIPIENT_IDENTIFIER_LENGTH,
    MetricKey,
    TransferContext,
    TransferStep,
} from './IAssetStrategy';
import { ValidationError } from '../errors/DomainError';
import { Money } from '../value-objects/Money';
import { AssetNiche, AssetType } from '@marketplace/shared-types';

export interface WebStrategyProps {
    monthlyRevenueUsd: Money;
    /** El dominio identifica al activo, así que es reservado. */
    domain?: string;
    /** Rubro del sitio. Público: dice de qué trata, no cuál es. */
    niche?: string;
    /** Cómo se llama el sitio. Reservado por el mismo motivo que el dominio. */
    name?: string;
}

/*
 * Los datos van nombrados y no posicionales: con `niche` y `name` ambos de
 * tipo texto, un argumento corrido de lugar compilaba igual y el rubro de un
 * sitio terminó siendo su nombre. Con un objeto, ese error no se puede escribir.
 */
export class WebStrategy implements IAssetStrategy {
    private readonly monthlyRevenueUsd: Money;
    private readonly domain: string;
    private readonly niche: string;
    private readonly name: string;

    constructor(props: WebStrategyProps) {
        this.monthlyRevenueUsd = props.monthlyRevenueUsd;
        this.domain = props.domain ?? '';
        this.niche = props.niche ?? AssetNiche.OTHER;
        this.name = props.name ?? '';
    }

    public describe(): AssetTypeDescriptor {
        const domain: AssetFieldDescriptor = {
            key: 'domain',
            label: 'Dominio',
            kind: 'text',
            confidential: true,
        };

        return {
            assetType: AssetType.WEB,
            label: 'Sitio web',
            identityField: domain,
            fields: [
                { key: 'niche', label: 'Rubro', kind: 'niche', confidential: false },
                { key: 'monthlyRevenueUsdCents', label: 'Ingreso mensual', kind: 'money', confidential: false },
                { key: 'currency', label: 'Moneda', kind: 'text', confidential: false },
                { key: 'name', label: 'Nombre del sitio', kind: 'text', confidential: true },
                domain,
            ],
            summaryMetricKeys: ['monthlyRevenueUsdCents'],
            ownershipSource: 'dns',
            transferWaitingDays: this.transferWaitingDays(),
            handoverNotice:
                'No lo detectamos solos: ningún registrador informa por API quién es el titular de un dominio. El registro DNS prueba que controlás los servidores de nombres, no que figurás como titular en el registrador.',
            /*
             * No hay espera para transferir, pero sí algo que avisar.
             *
             * El dominio entra a la cuenta de Hostinger de la plataforma y de
             * ahí sale hacia el comprador. Cada cambio de titular o de
             * registrador activa el bloqueo de 60 días de la ICANN, que impide
             * moverlo a OTRO registrador — no entregárselo a una cuenta de
             * Hostinger, que es como funciona el traspaso. La propiedad no se
             * ve afectada, pero es una limitación real sobre algo que el
             * comprador acaba de comprar, y callarla sería venderle una
             * libertad que no tiene.
             */
            waitingNotice:
                'Un sitio se transfiere de inmediato, pero cambiar el titular de un dominio activa un bloqueo de 60 días de la ICANN para moverlo a otro registrador. No afecta la propiedad —el dominio es tuyo desde el traspaso— pero durante ese plazo no vas a poder llevártelo a un registrador distinto.',
            revenueNotice:
                'La titularidad se comprueba con un registro en el DNS del dominio. Conectar AdSense es opcional: es lo que además comprueba cuánto genera el sitio; sin eso, el ingreso queda como declaración tuya.',
        };
    }

    public calculateEstimatedPrice(): Money {
        // Múltiplo estándar para webs es 24-36 meses.
        const multiple = 30;

        return this.monthlyRevenueUsd.multiply(multiple);
    }

    public getVerifiableMetrics(): MetricKey[] {
        return ['sessions', 'revenue'];
    }

    /**
     * El dominio pasa por la plataforma antes de llegar al comprador: la
     * plataforma es titular temporal en su cuenta de Hostinger, el único
     * registrador del MVP. Entra en custodia DURANTE la operación, con el
     * contrato firmado, y no al publicar: así la custodia dura lo que dura la
     * entrega. Sin ese paso intermedio el vendedor conserva un veto sobre la
     * entrega, que es justo lo que la custodia existe para evitar.
     *
     * Hosting, código y cuentas asociadas no tienen señal que los compruebe:
     * son declarados por el vendedor y los respalda el admin.
     *
     * Con `context`, el traslado a la plataforma nombra la cuenta de custodia
     * y el traslado al comprador nombra su cuenta; sin él, la variante del
     * catálogo.
     */
    public getTransferSteps(context?: TransferContext): TransferStep[] {
        const custodia = context?.custodyAccountIdentifier?.trim();
        const aQuienTraslada = custodia ? custodia : 'la plataforma';
        const comprador = context?.recipientIdentifier?.trim();

        // Los `id` son posicionales: se arman al final para que agregar o mover
        // un paso no obligue a renumerar a mano. Lo estable es `key`.
        const pasos: Omit<TransferStep, 'id'>[] = [
            {
                /*
                 * Va antes de la venta porque trasladar un dominio entre
                 * registradores no es inmediato: el código EPP se pide con
                 * anticipación y la ICANN bloquea 60 días el traslado de un
                 * dominio recién registrado o recién mudado. Enterarse recién
                 * con el contrato firmado deja a la operación trabada.
                 */
                key: 'domain-at-hostinger',
                check: 'declared',
                phase: 'listing',
                description: 'El vendedor tiene el dominio en Hostinger, o planea mudarlo con el código EPP antes de vender',
                title: 'Tené el dominio en Hostinger',
                instruction: 'Para venderlo, el dominio tiene que estar en una cuenta de Hostinger: si hoy está en otro registrador, pedí el código EPP y mudalo antes de recibir ofertas.',
                details: [
                    'Hostinger es el único registrador con el que trabajamos: desde ahí podemos recibir el dominio y entregárselo al comprador.',
                    'Si lo registraste o lo mudaste hace menos de 60 días, puede que todavía no se pueda mover: la ICANN lo bloquea durante ese plazo.',
                    'Conviene hacerlo con tiempo, porque el traslado entre registradores puede tardar varios días.',
                ],
                requiredActor: 'seller',
            },
            {
                key: 'domain-to-platform',
                check: 'automatic',
                phase: 'operation',
                description: `El vendedor traslada el dominio a la cuenta de Hostinger de ${aQuienTraslada}`,
                title: 'Trasladá el dominio a nuestra cuenta',
                instruction: `Con el contrato firmado, trasladá el dominio a la cuenta de Hostinger de ${aQuienTraslada}.`,
                details: [
                    'Desde tu cuenta de Hostinger, iniciá el traslado del dominio hacia esa cuenta.',
                    'Lo vamos a ver llegar solos y lo aceptamos; después Hostinger te va a mandar un correo para que confirmes.',
                    'El dominio queda a nuestro nombre solo hasta entregárselo al comprador.',
                ],
                requiredActor: 'seller',
            },
            {
                key: 'hosting',
                check: 'declared',
                phase: 'operation',
                description: 'El vendedor deja el hosting y los archivos del sitio listos para entregar',
                title: 'Dejá el hosting y los archivos listos',
                instruction: 'Dejá el hosting y los archivos del sitio listos para entregarle al comprador.',
                requiredActor: 'seller',
            },
            {
                key: 'code',
                check: 'declared',
                phase: 'operation',
                description: 'El vendedor deja el código y la base de datos listos para entregar',
                title: 'Dejá el código y la base de datos listos',
                instruction: 'Dejá el código y la base de datos del sitio listos para entregarle al comprador.',
                requiredActor: 'seller',
            },
            {
                key: 'accounts',
                check: 'declared',
                phase: 'operation',
                description: 'El vendedor deja listas las cuentas asociadas: analítica, afiliados o tienda',
                title: 'Dejá listas las cuentas asociadas',
                instruction: 'Dejá listas las cuentas asociadas al sitio, como la analítica, los programas de afiliados o la tienda, para cederlas al comprador.',
                requiredActor: 'seller',
            },
            {
                /*
                 * El comprador no inicia nada en su registrador: la plataforma
                 * ya es titular y le traslada el dominio a su cuenta de
                 * Hostinger. Si lo prefiere en otro registrador se le pasa el
                 * código EPP, pero entonces corre el bloqueo de 60 días de la
                 * ICANN que impide mudarlo otra vez, y hay que decírselo.
                 */
                key: 'domain-to-buyer',
                check: 'automatic',
                description: comprador
                    ? `La plataforma traslada el dominio a la cuenta de Hostinger del comprador (${comprador})`
                    : 'La plataforma traslada el dominio a la cuenta de Hostinger del comprador',
                title: 'Recibí el dominio',
                instruction: 'Te trasladamos el dominio a tu cuenta de Hostinger; si lo preferís en otro registrador, te damos el código EPP.',
                details: [
                    'Si lo querés en otro registrador, el cambio de titular activa un bloqueo de 60 días de la ICANN: durante ese plazo no vas a poder mudarlo de nuevo.',
                ],
                requiredActor: 'platform',
            },
        ];

        return pasos.map((paso, i) => ({ ...paso, id: String(i + 1) }));
    }

    public getPublicFields(): string[] {
        return ['niche', 'monthlyRevenueUsdCents', 'currency'];
    }

    /** Cambiar registrador y hosting es inmediato: no hay ventana que esperar. */
    public transferWaitingDays(): number {
        return 0;
    }

    public getConfidentialFields(): string[] {
        return ['name', 'domain'];
    }

    /**
     * Un dominio se recibe en una cuenta de registrador, y cada registrador
     * nombra a sus usuarios como quiere: algunos usan la dirección de correo,
     * otros un alias propio. No hay forma canónica que comprobar sin decidir
     * por el comprador cuál es su proveedor, así que acá solo se exige que el
     * dato exista y quepa. Las mayúsculas se respetan: en varios registradores
     * el usuario las distingue.
     */
    public normalizeRecipientIdentifier(identifier: string): string {
        const limpio = (identifier ?? '').trim();

        if (limpio === '') {
            throw new ValidationError(
                'Indicá el usuario del registrador donde querés recibir el dominio.',
            );
        }

        if (limpio.length > MAX_RECIPIENT_IDENTIFIER_LENGTH) {
            throw new ValidationError(
                `El usuario del registrador no puede superar los ${MAX_RECIPIENT_IDENTIFIER_LENGTH} caracteres.`,
            );
        }

        return limpio;
    }

    public toJSON(): { assetType: AssetType; assetData: Record<string, any> } {
        return {
            assetType: AssetType.WEB,
            assetData: {
                niche: this.niche,
                monthlyRevenueUsdCents: this.monthlyRevenueUsd.getCents(),
                currency: this.monthlyRevenueUsd.getCurrency(),
                name: this.name,
                domain: this.domain,
            }
        };
    }
}
