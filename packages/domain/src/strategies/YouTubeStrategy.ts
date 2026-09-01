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

interface YouTubeStrategyProps {
  monthlyRevenueUsd: Money;
  subscribers: number;
  growthFactor?: number;
  isMonetized: boolean;
  audienceTopCountry?: string;
  hasNoFaceContent?: boolean;
  /** Dirección del canal. Es lo que identifica al activo, así que es reservado. */
  channelUrl?: string;
  /**
   * Cómo se llama el canal. Reservado por el mismo motivo que la dirección:
   * con el nombre se lo encuentra buscándolo, así que publicarlo dejaría el
   * acuerdo de confidencialidad sin nada que proteger.
   */
  name?: string;
  /** Rubro del canal. Público: dice de qué trata, no cuál es. */
  niche?: string;
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
  private readonly channelUrl: string;
  private readonly name: string;
  private readonly niche: string;

  constructor({
    monthlyRevenueUsd,
    subscribers,
    growthFactor = 1.0,
    isMonetized,
    audienceTopCountry = 'AR',
    hasNoFaceContent = false,
    channelUrl = '',
    name = '',
    niche = AssetNiche.OTHER,
  }: YouTubeStrategyProps) {
    this.niche = niche;
    this.monthlyRevenueUsd = monthlyRevenueUsd;
    this.subscribers = subscribers;
    this.growthFactor = growthFactor;
    this.isMonetized = isMonetized;
    this.audienceTopCountry = audienceTopCountry;
    this.hasNoFaceContent = hasNoFaceContent;
    this.channelUrl = channelUrl;
    this.name = name;
  }

  public describe(): AssetTypeDescriptor {
    const channelUrl: AssetFieldDescriptor = {
      key: 'channelUrl',
      label: 'Dirección del canal',
      kind: 'text',
      confidential: true,
    };

    return {
      assetType: AssetType.YOUTUBE,
      label: 'Canal de YouTube',
      identityField: channelUrl,
      fields: [
        { key: 'niche', label: 'Rubro', kind: 'niche', confidential: false },
        { key: 'subscribers', label: 'Suscriptores', kind: 'number', confidential: false },
        { key: 'monthlyRevenueUsdCents', label: 'Ingreso mensual', kind: 'money', confidential: false },
        { key: 'currency', label: 'Moneda', kind: 'text', confidential: false },
        { key: 'growthFactor', label: 'Factor de crecimiento', kind: 'number', confidential: false },
        { key: 'isMonetized', label: 'Monetizado', kind: 'boolean', confidential: false },
        { key: 'audienceTopCountry', label: 'País principal de la audiencia', kind: 'text', confidential: false },
        { key: 'hasNoFaceContent', label: 'Contenido sin rostro', kind: 'boolean', confidential: false },
        { key: 'name', label: 'Nombre del canal', kind: 'text', confidential: true },
        channelUrl,
      ],
      summaryMetricKeys: ['subscribers', 'monthlyRevenueUsdCents', 'audienceTopCountry'],
      ownershipSource: 'youtube',
      transferWaitingDays: this.transferWaitingDays(),
      handoverNotice:
        'No lo detectamos solos: la API de YouTube no dice si un canal es Cuenta de Marca ni quiénes son sus propietarios.',
      waitingNotice:
        'YouTube exige haber sido propietario del canal durante siete días antes de permitir el cambio de propietario principal. La espera la impone la plataforma del activo, no nosotros.',
      revenueNotice:
        'YouTube no expone los ingresos de un canal por su API, así que el que declaraste queda como declaración jurada.',
    };
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

  /**
   * "To become primary owner, you must have been an owner for 7 days or more."
   * Hasta que ese cambio se completa el vendedor sigue siendo propietario
   * principal y conserva la facultad de expulsar a la plataforma.
   */
  /** Vacío mientras el vendedor no la haya cargado. */
  public getChannelUrl(): string {
    return this.channelUrl;
  }

  public transferWaitingDays(): number {
    return 7;
  }

  /*
   * TODO: pedirle a Google el scope `youtubepartner-channel-audit`. Devuelve
   * `overallGoodStanding`, `communityGuidelinesGoodStanding`,
   * `copyrightStrikesGoodStanding` y `contentIdClaimsGoodStanding`, que es
   * exactamente lo que hoy el vendedor declara a mano. Es un scope restringido
   * pensado para MCNs y la aprobación no está garantizada.
   */

  /**
   * `revenue` NO está acá, y es deliberado.
   *
   * La documentación de YouTube Analytics es explícita: las métricas de
   * ingresos no están disponibles en los reportes de canal, solo en los de
   * content owner, que exigen ser un MCN certificado. El ingreso mensual es
   * justo el dato que fija el precio en `calculateEstimatedPrice()` y es el
   * único que la plataforma no puede comprobar: sigue siendo una declaración
   * jurada del vendedor y hay que presentarlo como tal.
   */
  public getVerifiableMetrics(): MetricKey[] {
    return ['subscribers'];
  }

  // -------------------------------------------------------------------
  // Snapshot de métricas
  // -------------------------------------------------------------------

  /**
   * TODO: eliminar. Quedó reemplazado por `IYouTubeChannelReader`, que es un
   * puerto del dominio con su adaptador en `apps/api` y no una estrategia
   * haciendo HTTP. Sigue acá solo porque `IAssetStrategy` lo declara; sacarlo
   * es tocar la interfaz y las otras dos implementaciones.
   */
  public async captureMetricsSnapshot(): Promise<Record<MetricKey, number>> {
    throw new Error(
      'captureMetricsSnapshot() está obsoleto: usar IYouTubeChannelReader.',
    );
  }

  // -------------------------------------------------------------------
  // Pasos de transferencia
  // -------------------------------------------------------------------

  /**
   * El traspaso de un canal no se puede automatizar: no existe endpoint para
   * cambiar propietarios y todo se hace desde la interfaz de Cuentas de Marca.
   * La lista describe un proceso manual con dos esperas de 7 días, una por
   * cada cambio de propietario principal, y por eso el cierre tiene un piso
   * realista de dos semanas.
   */
  public getTransferSteps(context?: TransferContext): TransferStep[] {
    // A quién invita el vendedor. Sin contexto, "la plataforma": es la frase
    // del catálogo, dicha antes de que exista ninguna cuenta asignada.
    const custodia = context?.custodyAccountIdentifier?.trim();
    const aQuienInvita = custodia ? custodia : 'la plataforma';
    const comprador = context?.recipientIdentifier?.trim();

    // Los `id` son posicionales: se arman al final para que agregar o mover un
    // paso no obligue a renumerar a mano. No se persisten en ningún lado, solo
    // viajan al DTO como clave de render.
    const pasos: Omit<TransferStep, 'id'>[] = [
      {
        description: 'El vendedor convierte el canal a Cuenta de Marca si todavía no lo es',
        instruction: 'Convertí el canal a Cuenta de Marca, si todavía no lo es',
        requiredActor: 'seller',
        automated: false,
      },
      {
        // El paso que faltaba: mientras el vendedor conserve permisos de canal
        // heredados en YouTube Studio, la invitación parece funcionar pero el
        // cambio de propietario principal falla sin explicar por qué. Va ANTES
        // de invitar porque es la causa de ese error incomprensible.
        description: 'El vendedor sale de los permisos de canal en YouTube Studio (Configuración → Permisos), que conviven con la Cuenta de Marca y bloquean el cambio de propietario principal',
        instruction: 'Entrá a YouTube Studio → Configuración → Permisos y quitá tu propio acceso de nivel de canal: solo tiene que quedar el de la Cuenta de Marca. Si no lo hacés, la invitación va a parecer aceptada pero el cambio de propietario principal va a fallar sin avisar por qué.',
        requiredActor: 'seller',
        automated: false,
      },
      {
        description: `El vendedor invita a ${aQuienInvita} como propietaria del canal`,
        instruction: `Invitá a ${aQuienInvita} como propietaria del canal desde la administración de la Cuenta de Marca`,
        requiredActor: 'seller',
        automated: false,
      },
      {
        // Verificar la titularidad por API es posible con un OAuth del
        // vendedor (`channels.list` con `mine=true`), pero todavía no está
        // implementado: hasta que lo esté, esto lo hace una persona.
        description: 'La plataforma verifica la titularidad, los accesos de recuperación y toma una foto de las métricas',
        requiredActor: 'platform',
        automated: false,
      },
      {
        // La espera que la investigación encontró: mientras no se complete, el
        // vendedor sigue siendo propietario principal y conserva la facultad
        // de expulsar a la plataforma.
        description: 'Pasados 7 días desde la invitación, la plataforma se convierte en propietaria principal y toma la custodia',
        requiredActor: 'platform',
        automated: false,
      },
      {
        description: 'El comprador transfiere el dinero, que queda retenido por la plataforma',
        requiredActor: 'buyer',
        automated: false,
      },
      {
        description: comprador
          ? `La plataforma invita al comprador (${comprador}) como propietario del canal`
          : 'La plataforma invita al comprador como propietario del canal',
        requiredActor: 'platform',
        automated: false,
      },
      {
        description: 'El comprador acepta la invitación e inicia su propia espera de 7 días',
        requiredActor: 'buyer',
        automated: false,
      },
      {
        description: 'El comprador se convierte en propietario principal y asegura sus accesos (correos, teléfonos, AdSense)',
        requiredActor: 'buyer',
        automated: false,
      },
      {
        // Quitar a un propietario se hace a mano en la interfaz de Cuentas de
        // Marca: no hay endpoint.
        description: 'La plataforma quita al vendedor del canal, le liquida su parte y cierra la operación',
        requiredActor: 'platform',
        automated: false,
      },
    ];

    return pasos.map((paso, i) => ({ ...paso, id: String(i + 1) }));
  }

  // -------------------------------------------------------------------
  // Campos públicos y confidenciales (blind listing)
  // -------------------------------------------------------------------

  /**
   * Los nombres son los de `assetData`, no una lista aparte. Cuando eran una
   * lista aparte en otra convención de nombres, ninguno coincidía y el
   * filtrado de los listings blind se quedaba sin campos que dejar pasar.
   */
  public getPublicFields(): string[] {
    return [
      'niche',
      'subscribers',
      'monthlyRevenueUsdCents',
      'currency',
      'isMonetized',
      'growthFactor',
      'audienceTopCountry',
      'hasNoFaceContent',
    ];
  }

  /**
   * Un listing blind muestra los números y esconde la identidad: con las
   * métricas alcanza para valuar, y hace falta el NDA para saber qué canal es.
   */
  public getConfidentialFields(): string[] {
    return ['name', 'channelUrl'];
  }

  public toJSON(): { assetType: AssetType; assetData: Record<string, any> } {
    return {
      assetType: AssetType.YOUTUBE,
      assetData: {
        niche: this.niche,
        monthlyRevenueUsdCents: this.monthlyRevenueUsd.getCents(),
        currency: this.monthlyRevenueUsd.getCurrency(),
        subscribers: this.subscribers,
        growthFactor: this.growthFactor,
        isMonetized: this.isMonetized,
        audienceTopCountry: this.audienceTopCountry,
        hasNoFaceContent: this.hasNoFaceContent,
        name: this.name,
        channelUrl: this.channelUrl,
      }
    };
  }
}