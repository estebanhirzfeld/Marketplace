// REVIEW Deuda Técnica, se puede mejorar los cálculos de las métricas, y el cálculo de precios.

import {
    AssetFieldDescriptor,
    AssetTypeDescriptor,
    IAssetStrategy,
    MAX_RECIPIENT_IDENTIFIER_LENGTH,
    MetricKey,
    TransferContext,
    TransferReadiness,
    TransferReadinessFacts,
    TransferStep,
} from './IAssetStrategy';
import { ValidationError } from '../errors/DomainError';
import { Money } from '../value-objects/Money';
import { Email } from '../value-objects/Email';
import { DomainName } from '../value-objects/DomainName';
import { DomainRegistryRecord } from '../ports/IDomainRegistryLookup';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** Con menos margen, el dominio podría vencer en medio del traspaso. */
const MIN_DAYS_BEFORE_EXPIRY = 45;
/** El número que IANA le asigna a Hostinger como registrador. */
const HOSTINGER_IANA_REGISTRAR_ID = '1636';
/** Estados EPP que impiden traspasar el dominio. */
const BLOCKING_STATUSES = [
    'pending delete',
    'redemption period',
    'pending restore',
    'server hold',
    'client hold',
    'inactive',
    'pending transfer',
];

function isHostinger(registry: DomainRegistryRecord): boolean {
    if (registry.registrarIanaId) return registry.registrarIanaId === HOSTINGER_IANA_REGISTRAR_ID;
    return registry.registrarName?.toLowerCase().includes('hostinger') ?? false;
}
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
            requiresPlatformAccess: this.requiresPlatformAccess(),
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
                 * Hostinger. No se ofrece el código EPP como alternativa: el
                 * traslado a la cuenta de la plataforma ya activó el bloqueo
                 * de 60 días de la ICANN, así que durante la custodia no se
                 * puede mudar a otro registrador. Si el comprador lo quiere en
                 * otro lado, lo muda él cuando termine el bloqueo.
                 */
                key: 'domain-to-buyer',
                check: 'automatic',
                description: comprador
                    ? `La plataforma traslada el dominio a la cuenta de Hostinger del comprador (${comprador})`
                    : 'La plataforma traslada el dominio a la cuenta de Hostinger del comprador',
                title: 'Recibí el dominio',
                instruction: 'Te trasladamos el dominio a tu cuenta de Hostinger. Si no tenés una, creala antes con el mail que nos indicaste.',
                details: [
                    'Si lo querés en otro registrador, vas a tener que esperar: después de cada cambio de titular, la ICANN bloquea por 60 días la mudanza a otro registrador. Mientras tanto el dominio es tuyo y funciona desde tu cuenta de Hostinger.',
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

    /*
     * Un sitio entra en custodia por un traslado entre cuentas de Hostinger
     * durante la operación. Para que eso pase sin esperas, antes de firmar el
     * dominio tiene que estar en Hostinger, sin estados que lo traben y lejos
     * de vencer. El candado del registrador («client transfer prohibited») y
     * el bloqueo de 60 días solo frenan un cambio de registrador, no un
     * traslado entre cuentas, así que no traban la firma.
     */
    public transferReadiness(facts: TransferReadinessFacts): TransferReadiness {
        const domain = this.registryDomain();
        if (!domain) {
            return {
                ready: false,
                instruction: 'El sitio no tiene un dominio válido cargado: sin dominio no hay custodia posible.',
            };
        }
        const registry = facts.domainRegistry;
        if (registry === undefined) {
            return { ready: false, instruction: `Falta consultar el registro del dominio ${domain.value}.` };
        }
        if (registry === null) {
            return {
                ready: false,
                instruction: `El registro público no encuentra el dominio ${domain.value}. Revisá que esté registrado y activo antes de firmar.`,
            };
        }
        if (!isHostinger(registry)) {
            return {
                ready: false,
                instruction:
                    `El dominio ${domain.value} está en ${registry.registrarName ?? 'otro registrador'}. ` +
                    'Para venderlo acá tiene que estar en Hostinger: pedí el código EPP en tu registrador actual ' +
                    'e iniciá el traslado desde Hostinger. Al llegar, el dominio queda 60 días sin poder irse a ' +
                    'otro registrador, pero eso no traba la venta: el traspaso a la plataforma es entre cuentas de Hostinger.',
            };
        }
        const blocking = registry.statuses.find((s) => BLOCKING_STATUSES.includes(s));
        if (blocking) {
            return {
                ready: false,
                instruction: `El registro muestra el dominio ${domain.value} con el estado «${blocking}», que impide traspasarlo. Resolvelo en Hostinger antes de firmar.`,
            };
        }
        if (!registry.expiresAt) {
            return {
                ready: false,
                instruction: `El registro público no informa el vencimiento del dominio ${domain.value}, así que no podemos asegurar que no venza durante el traspaso. Por ahora, un dominio sin vencimiento publicado no se puede vender acá.`,
            };
        }
        if (registry.expiresAt.getTime() - facts.now.getTime() < MIN_DAYS_BEFORE_EXPIRY * MS_PER_DAY) {
            return {
                ready: false,
                instruction:
                    `El dominio ${domain.value} vence el ${registry.expiresAt.toLocaleDateString('es-AR')}. ` +
                    `Renová el dominio en Hostinger antes de firmar: tienen que faltar más de ${MIN_DAYS_BEFORE_EXPIRY} días para que venza.`,
            };
        }
        return { ready: true };
    }

    public requiresPlatformAccess(): boolean {
        return false;
    }

    public registryDomain(): DomainName | undefined {
        if (this.domain.trim() === '') return undefined;
        try {
            return DomainName.parse(this.domain);
        } catch {
            return undefined;
        }
    }

    public getConfidentialFields(): string[] {
        return ['name', 'domain'];
    }

    /**
     * Un dominio se entrega siempre en una cuenta de Hostinger, y Hostinger
     * traslada un dominio a otra cuenta por el mail de esa cuenta. Antes se
     * aceptaba cualquier usuario de registrador porque se contemplaban varios;
     * con Hostinger como único registrador, un dato que no es un mail es uno
     * con el que no se puede entregar.
     *
     * Solo se puede comprobar el formato: la API de Hostinger no permite
     * preguntar si un mail tiene cuenta. Eso se sabe recién al iniciar el
     * traslado, que Hostinger rechaza si la cuenta no existe.
     */
    public normalizeRecipientIdentifier(identifier: string): string {
        const limpio = (identifier ?? '').trim();

        if (limpio.length > MAX_RECIPIENT_IDENTIFIER_LENGTH) {
            throw new ValidationError(
                `El mail de tu cuenta de Hostinger no puede superar los ${MAX_RECIPIENT_IDENTIFIER_LENGTH} caracteres.`,
            );
        }

        try {
            return Email.create(limpio).getValue();
        } catch {
            throw new ValidationError(
                'Indicá el mail de tu cuenta de Hostinger: es a donde te trasladamos el dominio.',
            );
        }
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
