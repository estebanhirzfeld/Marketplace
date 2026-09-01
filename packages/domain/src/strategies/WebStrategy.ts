// REVIEW Deuda Técnica, se puede mejorar los cálculos de las métricas, y el cálculo de precios.

import {
    AssetFieldDescriptor,
    AssetTypeDescriptor,
    IAssetStrategy,
    MetricKey,
    TransferContext,
    TransferStep,
} from './IAssetStrategy';
import { Money } from '../value-objects/Money';
import { AssetNiche, AssetType } from '@marketplace/shared-types';

export class WebStrategy implements IAssetStrategy {
    constructor(
        private readonly monthlyRevenueUsd: Money,
        private readonly domainAuthority: number,
        /** El dominio identifica al activo, así que es reservado. */
        private readonly domain: string = '',
        /** Rubro del sitio. Público: dice de qué trata, no cuál es. */
        private readonly niche: string = AssetNiche.OTHER,
        /**
         * Cómo se llama el sitio. Reservado por el mismo motivo que el
         * dominio: con el nombre se lo encuentra buscándolo.
         *
         * Va último porque los argumentos son posicionales: insertarlo en el
         * medio corría en silencio todos los que venían después, y así fue
         * como el rubro de un sitio pasó a ser su nombre.
         */
        private readonly name: string = ''
    ) { }

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
                { key: 'domainAuthority', label: 'Autoridad de dominio', kind: 'number', confidential: false },
                { key: 'name', label: 'Nombre del sitio', kind: 'text', confidential: true },
                domain,
            ],
            summaryMetricKeys: ['domainAuthority', 'monthlyRevenueUsdCents'],
            ownershipSource: 'adsense',
            transferWaitingDays: this.transferWaitingDays(),
            handoverNotice:
                'No lo detectamos solos: ningún registrador expone por API quién controla un dominio.',
            // Sin espera no hay nada que justificar.
            waitingNotice: undefined,
            revenueNotice:
                'Se comprueba junto con la titularidad: AdSense informa cuánto genera el dominio.',
        };
    }

    public calculateEstimatedPrice(): Money {
        // Múltiplo estándar para webs es 24-36 meses.
        const multiple = 30;
        let price = this.monthlyRevenueUsd.multiply(multiple);

        // Bonus por Domain Authority (si DA > 40)
        if (this.domainAuthority >= 40) {
            price = price.addPercentage(10);
        }

        return price;
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
            { id: '1', description: 'El vendedor entrega el código de autorización (EPP) del dominio', instruction: 'Pedile a tu registrador el código de autorización (EPP) del dominio y pasánoslo', requiredActor: 'seller', automated: false },
            {
                id: '2',
                description: comprador
                    ? `El comprador (${comprador}) inicia la transferencia del dominio en su registrador`
                    : 'El comprador inicia la transferencia del dominio en su registrador',
                requiredActor: 'buyer',
                automated: false,
            },
            { id: '3', description: 'Migrar base de datos y archivos de hosting', requiredActor: 'seller', automated: false },
            { id: '4', description: 'Transferir cuentas afiliadas / AdSense asociadas', requiredActor: 'seller', automated: false },
        ];
    }

    public getPublicFields(): string[] {
        return ['niche', 'monthlyRevenueUsdCents', 'currency', 'domainAuthority'];
    }

    /** Cambiar registrador y hosting es inmediato: no hay ventana que esperar. */
    public transferWaitingDays(): number {
        return 0;
    }

    public getConfidentialFields(): string[] {
        return ['name', 'domain'];
    }

    public toJSON(): { assetType: AssetType; assetData: Record<string, any> } {
        return {
            assetType: AssetType.WEB,
            assetData: {
                niche: this.niche,
                monthlyRevenueUsdCents: this.monthlyRevenueUsd.getCents(),
                currency: this.monthlyRevenueUsd.getCurrency(),
                domainAuthority: this.domainAuthority,
                name: this.name,
                domain: this.domain,
            }
        };
    }
}
