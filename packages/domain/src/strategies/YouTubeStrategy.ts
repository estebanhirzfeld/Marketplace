import { IAssetStrategy, MetricKey, TransferStep } from './IAssetStrategy';
import { Money } from '../value-objects/Money';
import { AssetType } from '@marketplace/shared-types';

interface YouTubeStrategyProps {
  monthlyRevenueUsd: Money;
  subscribers: number;
  growthFactor?: number;
  isMonetized: boolean;
  audienceTopCountry?: string;
  hasNoFaceContent?: boolean;
}

export class YouTubeStrategy implements IAssetStrategy {

  private static readonly BASE_MULTIPLE = 24;
  private static readonly MAX_GROWTH_DELTA = 6;
  private static readonly MIN_MULTIPLE = 12;
  private static readonly VALUE_PER_SUBSCRIBER = 1.0; // USD, para canales no monetizados

  private readonly monthlyRevenueUsd: Money;
  private readonly subscribers: number;
  private readonly growthFactor: number;
  private readonly isMonetized: boolean;
  private readonly audienceTopCountry: string;
  private readonly hasNoFaceContent: boolean;

  constructor({
    monthlyRevenueUsd,
    subscribers,
    growthFactor = 1.0,
    isMonetized,
    audienceTopCountry = 'AR',
    hasNoFaceContent = false,
  }: YouTubeStrategyProps) {
    this.monthlyRevenueUsd = monthlyRevenueUsd;
    this.subscribers = subscribers;
    this.growthFactor = growthFactor;
    this.isMonetized = isMonetized;
    this.audienceTopCountry = audienceTopCountry;
    this.hasNoFaceContent = hasNoFaceContent;
  }

  // -------------------------------------------------------------------
  // Precio estimado
  // -------------------------------------------------------------------

  public calculateEstimatedPrice(): Money {
    if (!this.isMonetized) {
      return this.calculateByReach();
    }

    const multiple = this.calculateMultiple();
    return this.monthlyRevenueUsd.multiply(multiple);
  }

  private calculateMultiple(): number {
    const growthDelta = this.getGrowthDelta();
    const audienceDelta = this.getAudienceDelta();
    const faceDelta = this.getFaceDelta();

    const rawMultiple =
      YouTubeStrategy.BASE_MULTIPLE +
      growthDelta +
      audienceDelta +
      faceDelta;

    return Math.max(rawMultiple, YouTubeStrategy.MIN_MULTIPLE);
  }

  // growthFactor > 1 = creciendo, < 1 = cayendo
  // delta acotado entre -6 y +6 para no distorsionar el múltiplo
  private getGrowthDelta(): number {
    const delta = (this.growthFactor - 1) * 10;
    return Math.min(Math.max(delta, -YouTubeStrategy.MAX_GROWTH_DELTA), YouTubeStrategy.MAX_GROWTH_DELTA);
  }

  // Audiencia anglosajona (US, UK, AU, CA) tiene CPM más alto → múltiplo mayor
  private getAudienceDelta(): number {
    const highCpmCountries = ['US', 'UK', 'AU', 'CA', 'DE', 'NL'];
    return highCpmCountries.includes(this.audienceTopCountry) ? +4 : -3;
  }

  // Canal sin cara = más transferible = más valor para el comprador
  private getFaceDelta(): number {
    return this.hasNoFaceContent ? +2 : 0;
  }

  // Para canales sin monetizar: valuación por alcance
  // ~$1 USD por suscriptor activo como proxy base
  // TODO: reemplazar VALUE_PER_SUBSCRIBER con dato de benchmarks reales cuando haya suficientes ventas
  private calculateByReach(): Money {
    return Money.fromFloat(
      this.subscribers * YouTubeStrategy.VALUE_PER_SUBSCRIBER
    );
  }

  // -------------------------------------------------------------------
  // Métricas verificables vía API
  // -------------------------------------------------------------------

  public getVerifiableMetrics(): MetricKey[] {
    return ['subscribers', 'revenue'];
  }

  // -------------------------------------------------------------------
  // Snapshot de métricas — se llama 3 veces:
  //   1. Al publicar el listing
  //   2. Al aceptar la oferta (antes del contrato)
  //   3. Al recibir el canal en la plataforma (antes de transferir al buyer)
  // -------------------------------------------------------------------

  public async captureMetricsSnapshot(): Promise<Record<MetricKey, number>> {
    // TODO: reemplazar con llamada real a YouTube Data API
    // GET https://www.googleapis.com/youtube/v3/channels?part=statistics&mine=true
    throw new Error('captureMetricsSnapshot() no implementado — requiere YouTube OAuth token');
  }

  // -------------------------------------------------------------------
  // Pasos de transferencia
  // -------------------------------------------------------------------

  public getTransferSteps(): TransferStep[] {
    return [
      {
        id: '1',
        description: 'Seller convierte el canal a Brand Account si no lo es',
        requiredActor: 'seller',
        automated: false,
      },
      {
        id: '2',
        description: 'Seller invita a la plataforma como Propietario Principal',
        requiredActor: 'seller',
        automated: false,
      },
      {
        id: '3',
        description: 'Plataforma verifica ownership, emails de recuperación y snapshot de métricas',
        requiredActor: 'platform',
        automated: true, // captureMetricsSnapshot() + YouTube API ownership check
      },
      {
        id: '4',
        description: 'Plataforma invita al buyer como Propietario Principal',
        requiredActor: 'platform',
        automated: false,
      },
      {
        id: '5',
        description: 'Buyer acepta invitación — inicia período de congelamiento de 7 días de YouTube',
        requiredActor: 'buyer',
        automated: false,
      },
      {
        id: '6',
        description: 'Buyer completa checklist de seguridad (emails, teléfonos, AdSense)',
        requiredActor: 'buyer',
        automated: false,
      },
      {
        id: '7',
        description: 'Buyer confirma recepción conforme — fondos liberados al seller',
        requiredActor: 'buyer',
        automated: false,
      },
      {
        id: '8',
        description: 'Plataforma elimina al seller del canal y cierra la operación',
        requiredActor: 'platform',
        automated: true,
      },
    ];
  }

  // -------------------------------------------------------------------
  // Campos públicos y confidenciales (blind listing)
  // -------------------------------------------------------------------

  public getPublicFields(): string[] {
    return [
      'niche',
      'subscribers',
      'monthly_revenue_usd',
      'language',
      'content_type',
      'is_monetized',
      'has_no_face_content',
      'audience_top_country',
    ];
  }

  public getConfidentialFields(): string[] {
    return [
      'channel_url',
      'channel_id',
      'raw_metrics',
      'has_strikes',
    ];
  }

  public toJSON(): { assetType: AssetType; assetData: Record<string, any> } {
    return {
      assetType: AssetType.YOUTUBE,
      assetData: {
        monthlyRevenueUsdCents: this.monthlyRevenueUsd.getCents(),
        currency: this.monthlyRevenueUsd.getCurrency(),
        subscribers: this.subscribers,
        growthFactor: this.growthFactor,
        isMonetized: this.isMonetized,
        audienceTopCountry: this.audienceTopCountry,
        hasNoFaceContent: this.hasNoFaceContent,
      }
    };
  }
}