// REVIEW Deuda Técnica, se puede mejorar los cálculos de las métricas, y el cálculo de precios.
import { IAssetStrategy, MetricKey, TransferStep } from './IAssetStrategy';
import { Money } from '../value-objects/Money';
import { AssetType } from '@marketplace/shared-types';

/*
 * TODO: decisión de producto pendiente sobre Instagram y TikTok. TikTok prohíbe
 * explícitamente transferir una cuenta en sus términos, e Instagram parece
 * hacer lo mismo aunque no pudo verificarse contra la fuente oficial. Si es
 * así, el problema no es que no haya API: es que el activo no se puede
 * entregar de forma legítima. Hay que leer los términos y resolver si el
 * marketplace los incluye o se acota a YouTube y sitios web.
 */
export class SocialStrategy implements IAssetStrategy {
    constructor(
        private readonly followers: number,
        private readonly engagementRate: number, // percentage e.g. 5.5
        private readonly platform: AssetType.INSTAGRAM | AssetType.TIKTOK,
        /** La dirección del perfil identifica al activo: es lo único reservado. */
        private readonly profileUrl: string = ''
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
        return ['platform', 'followers', 'engagementRate'];
    }

    /**
     * Cero, pero por una razón distinta a la de un sitio web: estas
     * plataformas no ofrecen ningún mecanismo de traspaso, así que no hay
     * ventana que esperar porque no hay traspaso previsto. El riesgo de estos
     * activos está en los términos de servicio, no en el calendario.
     */
    public transferWaitingDays(): number {
        return 0;
    }

    public getConfidentialFields(): string[] {
        return ['profileUrl'];
    }

    public toJSON(): { assetType: AssetType; assetData: Record<string, any> } {
        return {
            assetType: this.platform,
            assetData: {
                followers: this.followers,
                engagementRate: this.engagementRate,
                platform: this.platform,
                profileUrl: this.profileUrl,
            }
        };
    }
}
