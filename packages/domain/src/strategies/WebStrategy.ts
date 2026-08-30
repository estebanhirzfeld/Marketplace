// REVIEW Deuda Técnica, se puede mejorar los cálculos de las métricas, y el cálculo de precios.

import { IAssetStrategy, MetricKey, TransferStep } from './IAssetStrategy';
import { Money } from '../value-objects/Money';
import { AssetType } from '@marketplace/shared-types';

export class WebStrategy implements IAssetStrategy {
    constructor(
        private readonly monthlyRevenueUsd: Money,
        private readonly domainAuthority: number,
        /** El dominio identifica al activo: es lo único reservado. */
        private readonly domain: string = ''
    ) { }

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

    public getTransferSteps(): TransferStep[] {
        return [
            { id: '1', description: 'Transferir auth code del dominio (EPP)', requiredActor: 'seller', automated: false },
            { id: '2', description: 'Buyer inicia transferencia de dominio en su registrador', requiredActor: 'buyer', automated: false },
            { id: '3', description: 'Migrar base de datos y archivos de hosting', requiredActor: 'seller', automated: false },
            { id: '4', description: 'Transferir cuentas afiliadas / AdSense asociadas', requiredActor: 'seller', automated: false },
        ];
    }

    public getPublicFields(): string[] {
        return ['monthlyRevenueUsdCents', 'currency', 'domainAuthority'];
    }

    /** Cambiar registrador y hosting es inmediato: no hay ventana que esperar. */
    public transferWaitingDays(): number {
        return 0;
    }

    public getConfidentialFields(): string[] {
        return ['domain'];
    }

    public toJSON(): { assetType: AssetType; assetData: Record<string, any> } {
        return {
            assetType: AssetType.WEB,
            assetData: {
                monthlyRevenueUsdCents: this.monthlyRevenueUsd.getCents(),
                currency: this.monthlyRevenueUsd.getCurrency(),
                domainAuthority: this.domainAuthority,
                domain: this.domain,
            }
        };
    }
}
