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
             * Cambiar el titular de un dominio activa el bloqueo de 60 días de
             * la ICANN, que impide moverlo a OTRO registrador — no cambiar de
             * titular dentro del mismo, que es como funciona el traspaso. La
             * propiedad no se ve afectada, pero es una limitación real sobre
             * algo que el comprador acaba de comprar, y callarla sería
             * venderle una libertad que no tiene.
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
     * Adopta la firma con contexto y nombra al comprador en el paso de la
     * transferencia de dominio. NO suma ningún paso de custodia: que el sitio
     * pase por la plataforma antes de llegar al comprador es el defecto
     * preexistente que la propuesta manda a `web-escrow-transfer-steps`, y
     * arreglarlo exige investigar el traspaso real de dominios (código EPP,
     * bloqueo ICANN de 60 días). Ignorar `custodyAccountIdentifier` acá no es
     * un olvido: es la ausencia que ese cambio va a llenar.
     */
    public getTransferSteps(context?: TransferContext): TransferStep[] {
        const comprador = context?.recipientIdentifier?.trim();

        return [
            {
                /*
                 * Va antes de ceder el dominio y no después: la política de la
                 * ICANN permite que el titular se exima del bloqueo de 60 días
                 * ANTES del cambio, si su registrador lo ofrece, y prohíbe
                 * expresamente eximirse una vez empezado.
                 */
                id: '1',
                phase: 'listing',
                description: 'El vendedor se exime del bloqueo de 60 días, si su registrador lo permite',
                title: 'Eximite del bloqueo de 60 días',
                instruction: 'Antes de cedernos el dominio, fijate si tu registrador te deja eximirte del bloqueo de 60 días de la ICANN. Después del traspaso ya no se puede, y el comprador queda sin poder mover el dominio durante ese plazo.',
                requiredActor: 'seller',
                automated: false,
            },
            { id: '2', phase: 'listing', description: 'El vendedor entrega el código de autorización (EPP) del dominio', title: 'Pasanos el código de autorización', instruction: 'Pedile a tu registrador el código de autorización (EPP) del dominio y pasánoslo', requiredActor: 'seller', automated: false },
            {
                id: '3',
                description: comprador
                    ? `El comprador (${comprador}) inicia la transferencia del dominio en su registrador`
                    : 'El comprador inicia la transferencia del dominio en su registrador',
                requiredActor: 'buyer',
                automated: false,
            },
            { id: '4', description: 'Migrar base de datos y archivos de hosting', requiredActor: 'seller', automated: false },
            { id: '5', description: 'Transferir cuentas afiliadas / AdSense asociadas', requiredActor: 'seller', automated: false },
        ];
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
