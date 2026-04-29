// REVIEW Deuda Técnica, se puede mejorar los cálculos de las métricas, y el cálculo de precios.
import { IAssetStrategy, MetricKey, TransferStep } from './IAssetStrategy';
import { Money } from '../value-objects/Money';
import { AssetType } from '@marketplace/shared-types';

export class SocialStrategy implements IAssetStrategy {
    constructor(
        private readonly followers: number,
        private readonly engagementRate: number, // percentage e.g. 5.5
        private readonly platform: AssetType.INSTAGRAM | AssetType.TIKTOK
    ) { }

    public calculateEstimatedPrice(): Money {
        // Price = Followers * Cost Per Follower (CPF) * Engagement multiplier
        const cpf = this.platform === AssetType.INSTAGRAM ? 0.01 : 0.005; // IG vale más por ahora que TikTok

        // Valor base en dólares
        const baseValue = this.followers * cpf;
        let price = Money.fromFloat(baseValue);

        // Multiplicador de engagement (si es altísimo, vale más, si es 0, vale menos)
        if (this.engagementRate > 10) {
            price = price.addPercentage(50);
        } else if (this.engagementRate < 2) {
            price = price.subtract(price.getPercentage(30)); // -30% si engagement es pobre
        }

        return price;
    }

    public getVerifiableMetrics(): MetricKey[] {
        return ['followers', 'engagement'];
    }

    public getTransferSteps(): TransferStep[] {
        return [
            { id: '1', description: 'Cambiar el correo y número de teléfono asociado a un correo neutro', requiredActor: 'seller', automated: false },
            { id: '2', description: 'Desvincular todas las apps de terceros conectadas', requiredActor: 'seller', automated: false },
            { id: '3', description: 'Entregar credenciales del correo neutro y de la red social al buyer', requiredActor: 'seller', automated: false },
            { id: '4', description: 'Buyer cambia la contraseña, correo y 2FA de la cuenta', requiredActor: 'buyer', automated: false },
        ];
    }

    public getPublicFields(): string[] {
        return ['platform', 'niche', 'followers', 'avg_engagement_rate', 'is_verified'];
    }

    public getConfidentialFields(): string[] {
        return ['profile_url', 'monthly_revenue_usd', 'raw_metrics'];
    }
}
