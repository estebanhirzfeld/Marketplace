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
import { Money } from '../value-objects/Money';
import { Email } from '../value-objects/Email';
import { DomainName } from '../value-objects/DomainName';
import { ValidationError } from '../errors/DomainError';
import { AssetNiche, AssetType } from '@marketplace/shared-types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

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
  /**
   * Cuándo leyó YouTube Analytics los datos de este activo. Presente solo si
   * suscriptores, ingreso y país los verificó Google en lugar de tipearlos.
   */
  verifiedFromYouTubeAt?: Date;
}

/** Pantallas de Google y YouTube donde el vendedor hace cada paso del traspaso. */
const YOUTUBE_LINKS = {
  channelSwitcher: 'https://www.youtube.com/channel_switcher',
  advancedSettings: 'https://www.youtube.com/account_advanced',
  brandAccounts: 'https://myaccount.google.com/brandaccounts',
  studio: 'https://studio.youtube.com',
} as const;

export class YouTubeStrategy implements IAssetStrategy {

  private static readonly BASE_MULTIPLE = 24;
  private static readonly MAX_GROWTH_DELTA = 6;
  private static readonly MIN_MULTIPLE = 12;
  private static readonly VALUE_PER_SUBSCRIBER = 1.0; // USD, para canales no monetizados

  private readonly monthlyRevenueUsd: Money;
  private readonly subscribers: number;
  private readonly growthFactor: number;
  private readonly isMonetized: boolean;
  /** `null` cuando Google no informó país: no se inventa uno. */
  private readonly audienceTopCountry: string | null;
  private readonly hasNoFaceContent: boolean;
  private readonly channelUrl: string;
  private readonly name: string;
  private readonly niche: string;
  private readonly verifiedFromYouTubeAt?: Date;

  constructor({
    monthlyRevenueUsd,
    subscribers,
    growthFactor = 1.0,
    isMonetized,
    audienceTopCountry,
    hasNoFaceContent = false,
    channelUrl = '',
    name = '',
    niche = AssetNiche.OTHER,
    verifiedFromYouTubeAt,
  }: YouTubeStrategyProps) {
    this.verifiedFromYouTubeAt = verifiedFromYouTubeAt;
    this.niche = niche;
    this.monthlyRevenueUsd = monthlyRevenueUsd;
    this.subscribers = subscribers;
    this.growthFactor = growthFactor;
    this.isMonetized = isMonetized;
    // Un activo cargado a mano sin país sigue asumiendo AR. Uno verificado sin
    // país no: el dato no existe y asumirlo restaría múltiplo sin motivo.
    this.audienceTopCountry = audienceTopCountry ?? (verifiedFromYouTubeAt ? null : 'AR');
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
        { key: 'growthFactor', label: 'Factor de crecimiento', kind: 'number', confidential: false, internal: true },
        { key: 'isMonetized', label: 'Monetizado', kind: 'boolean', confidential: false },
        { key: 'audienceTopCountry', label: 'País principal de la audiencia', kind: 'text', confidential: false },
        { key: 'hasNoFaceContent', label: 'Contenido sin rostro', kind: 'boolean', confidential: false },
        { key: 'name', label: 'Nombre del canal', kind: 'text', confidential: true },
        channelUrl,
        ...(this.verifiedFromYouTubeAt
          ? [{ key: 'verifiedFromYouTubeAt', label: 'Datos verificados con YouTube el', kind: 'date' as const, confidential: false }]
          : []),
      ],
      summaryMetricKeys: ['subscribers', 'monthlyRevenueUsdCents', 'audienceTopCountry'],
      ownershipSource: 'youtube',
      transferWaitingDays: this.transferWaitingDays(),
      requiresPlatformAccess: this.requiresPlatformAccess(),
      handoverNotice:
        'No lo detectamos solos: la API de YouTube no dice si un canal es Cuenta de Marca ni quiénes son sus propietarios.',
      waitingNotice:
        'YouTube exige haber sido administrador o propietario del canal durante siete días antes de permitir el cambio de propietario principal. Por eso alcanza con sumarnos como administrador: el plazo corre igual y vos seguís siendo el dueño. La espera la impone la plataforma del activo, no nosotros.',
      revenueNotice: this.revenueNotice(),
    };
  }

  /**
   * Un activo verificado trae el ingreso leído de YouTube Analytics con el
   * permiso del vendedor, así que decir que YouTube no lo expone sería falso.
   * Uno cargado a mano sigue siendo una declaración jurada.
   */
  private revenueNotice(): string {
    if (!this.verifiedFromYouTubeAt) {
      return 'YouTube no expone los ingresos de un canal por su API, así que el que declaraste queda como declaración jurada.';
    }
    const cents = this.monthlyRevenueUsd.getCents();
    if (cents > 0) {
      const amount = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(cents / 100);
      return `Verificado con YouTube: US$ ${amount} por mes, promedio de los últimos 3 meses.`;
    }
    // Monetizado se deduce de los ingresos de 12 meses: sin monetizar, no hubo ninguno.
    return this.isMonetized
      ? 'Verificado con YouTube: sin ingresos en los últimos 3 meses.'
      : 'Verificado con YouTube: sin ingresos en los últimos 12 meses.';
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
  // Sin país informado el delta es neutro.
  private getAudienceDelta(): number {
    if (this.audienceTopCountry === null) return 0;
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
   * Listo cuando la plataforma es administradora hace los siete días que
   * YouTube exige antes de dejarla ser propietaria principal.
   */
  public transferReadiness(facts: TransferReadinessFacts): TransferReadiness {
    if (!facts.platformAccessSince) {
      return {
        ready: false,
        instruction: 'La plataforma todavía no tiene acceso al activo: no puede garantizar la custodia.',
      };
    }
    const desde = new Date(facts.platformAccessSince.getTime() + this.transferWaitingDays() * MS_PER_DAY);
    if (facts.now.getTime() < desde.getTime()) {
      return {
        ready: false,
        instruction:
          'El activo todavía está en el período de espera de su plataforma. ' +
          `Va a poder transferirse a partir del ${desde.toLocaleDateString('es-AR')}.`,
      };
    }
    return { ready: true };
  }

  public requiresPlatformAccess(): boolean {
    return true;
  }

  public registryDomain(): DomainName | undefined {
    return undefined;
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
        phase: 'listing',
        description: 'El vendedor convierte el canal a Cuenta de Marca si todavía no lo es',
        title: 'Pasá tu canal a una cuenta de marca',
        instruction: 'Pasá tu canal a una cuenta de marca si todavía no lo es: este paso va antes de invitarnos.',
        details: [
          'Creá la cuenta de marca con "Crear un canal nuevo". Puede llamarse distinto: el canal conserva su nombre.',
          'Después, en Configuración avanzada, elegí "Transferir canal". Si dice "No hay otras cuentas disponibles", falta crear la cuenta de marca.',
          'YouTube avisa que borra el canal vacío que se creó junto con la cuenta ("Reemplazar"): es lo esperado, tu canal con sus suscriptores no se pierde.',
          'Se quitan todos los delegados de Permisos y la información demográfica del creador. Es probable que el canal pierda la verificación y la foto de perfil: volvé a subir la foto.',
          'YouTube bloquea el acceso a la cuenta hasta unos 10 minutos: no lo hagas si necesitás publicar algo.',
        ],
        links: [
          { label: 'Crear la cuenta de marca', href: YOUTUBE_LINKS.channelSwitcher },
          { label: 'Transferir el canal', href: YOUTUBE_LINKS.advancedSettings },
        ],
        requiredActor: 'seller',
        key: 'brand-account',
        check: 'declared',
      },
      {
        /*
         * Administrador y no propietario, y eso es el producto entero.
         *
         * Google admite que la antigüedad como administrador cuente para el
         * plazo de siete días, y un administrador no puede eliminar el canal
         * ni quitar propietarios. Pedir propietario acá era pedir más poder
         * del necesario — justamente el que el vendedor teme ceder— sin
         * ningún beneficio: el reloj corre igual.
         *
         * La instrucción enumera lo que NO podemos hacer. Una promesa en
         * negativo el vendedor la puede verificar en la interfaz de Google;
         * una en positivo le pide que nos crea.
         */
        phase: 'listing',
        description: `El vendedor invita a ${aQuienInvita} como administrador del canal`,
        title: 'Invitanos como administrador',
        instruction: `Invitá a ${aQuienInvita} con el rol Administrador desde la administración de tu Cuenta de Marca.`,
        details: [
          'No elijas el rol "Propietario": permite borrar la cuenta de marca, y lo dice el propio diálogo de Google.',
          'Vos vas a ver a la plataforma como "Administrador" y ella se va a ver como "Supervisor/a" en tu cuenta: es el mismo rol.',
          'Un administrador no puede eliminar el canal, no puede quitarte a vos y no puede transferir nada.',
        ],
        links: [{ label: 'Administrar permisos', href: YOUTUBE_LINKS.brandAccounts }],
        requiredActor: 'seller',
        key: 'invite-platform',
        check: 'declared',
      },
      {
        // Aceptar la invitación es lo que convierte a la plataforma en
        // administradora, y de ahí cuenta el plazo de Google. No se afirma si
        // el plazo corre desde la invitación o desde la aceptación: no está
        // verificado.
        description: 'La plataforma acepta la invitación como administradora desde la cuenta de custodia',
        requiredActor: 'platform',
        key: 'platform-accepts',
        check: 'admin',
      },
      {
        // Verificar la titularidad por API es posible con un OAuth del
        // vendedor (`channels.list` con `mine=true`), pero todavía no está
        // implementado: hasta que lo esté, esto lo hace una persona.
        description: 'La plataforma verifica la titularidad, los accesos de recuperación y toma una foto de las métricas',
        requiredActor: 'platform',
        key: 'verify-ownership',
        check: 'admin',
      },
      {
        // Informativo: a los 7 días se cumple el requisito de Google, pero no
        // pasa nada solo. El cambio de propietario principal lo hace el
        // vendedor, y es el paso siguiente.
        description: 'Pasados 7 días como administradora, la plataforma ya cumple el requisito de Google para poder recibir la titularidad',
        requiredActor: 'platform',
        key: 'seven-day-wait',
        check: 'automatic',
      },
      {
        // Mientras el vendedor conserve permisos de canal heredados en YouTube
        // Studio, el cambio de propietario principal falla sin explicar por
        // qué. Va en la operación y justo ANTES de la promoción: es la causa
        // de ese error incomprensible, y recién ahí hay una venta que lo pida.
        phase: 'operation',
        description: 'El vendedor sale de los permisos de canal en YouTube Studio (Configuración → Permisos), que conviven con la Cuenta de Marca y bloquean el cambio de propietario principal',
        title: 'Quitá tu acceso directo al canal',
        instruction: 'Quitá tu propio acceso de nivel de canal en YouTube Studio: solo tiene que quedar el de la Cuenta de Marca.',
        details: [
          'Entrá a YouTube Studio → Configuración → Permisos.',
          'Quitá tu acceso de nivel de canal. Solo tiene que quedar el de la Cuenta de Marca.',
          'Si no lo hacés, el cambio de propietario principal falla sin avisar por qué.',
        ],
        links: [{ label: 'Abrir YouTube Studio', href: YOUTUBE_LINKS.studio }],
        requiredActor: 'seller',
        key: 'leave-channel-permissions',
        check: 'declared',
      },
      {
        /*
         * El único momento en que el vendedor cede el control, y ocurre entre
         * dos pasos nuestros. Se le muestra desde el principio a propósito: la
         * promesa del producto es que no cede control AHORA, y eso solo
         * tranquiliza si puede ver cuándo sí lo va a ceder. Escondérselo lo
         * convertiría en una sorpresa tardía, que es la desconfianza que el
         * producto intenta eliminar.
         */
        phase: 'operation',
        description: `El vendedor promueve a ${aQuienInvita} de administrador a propietario principal`,
        title: 'Hacenos propietario principal',
        instruction: 'Con el contrato ya firmado, hacenos propietario principal desde la Cuenta de Marca.',
        details: [
          'Recién en este momento cedés el control, con el comprador ya comprometido y el precio acordado.',
          'La opción aparece desde el primer día, pero Google la rechaza con un aviso breve hasta que pasen los 7 días: intentarlo antes no cambia nada.',
          'Google te va a mostrar lo que cedés: agregar y borrar propietarios y administradores, cambiar permisos y borrar la cuenta por completo.',
        ],
        links: [{ label: 'Promover a propietario principal', href: YOUTUBE_LINKS.brandAccounts }],
        requiredActor: 'seller',
        key: 'promote-platform-owner',
        check: 'declared',
      },
      {
        description: 'El comprador transfiere el dinero, que queda retenido por la plataforma',
        requiredActor: 'buyer',
        key: 'buyer-pays',
        check: 'automatic',
      },
      {
        description: comprador
          ? `La plataforma invita al comprador (${comprador}) como propietario del canal`
          : 'La plataforma invita al comprador como propietario del canal',
        requiredActor: 'platform',
        key: 'invite-buyer',
        check: 'admin',
      },
      {
        description: 'El comprador acepta la invitación e inicia su propia espera de 7 días',
        requiredActor: 'buyer',
        key: 'buyer-accepts',
        check: 'declared',
      },
      {
        description: 'El comprador se convierte en propietario principal y asegura sus accesos (correos, teléfonos, AdSense)',
        requiredActor: 'buyer',
        key: 'buyer-secures-access',
        check: 'declared',
      },
      {
        // Quitar a un propietario se hace a mano en la interfaz de Cuentas de
        // Marca: no hay endpoint.
        description: 'La plataforma quita al vendedor del canal, le liquida su parte y cierra la operación',
        requiredActor: 'platform',
        key: 'remove-seller',
        check: 'admin',
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
      // Dice de dónde salen los números, no cuál es el canal: no lo identifica.
      ...(this.verifiedFromYouTubeAt ? ['verifiedFromYouTubeAt'] : []),
    ];
  }

  /**
   * Un listing blind muestra los números y esconde la identidad: con las
   * métricas alcanza para valuar, y hace falta el NDA para saber qué canal es.
   */
  public getConfidentialFields(): string[] {
    return ['name', 'channelUrl'];
  }

  /**
   * Un canal se cede invitando a una cuenta de Google, así que acá el formato
   * de una dirección de correo sí es exigible: si está mal escrita, la
   * invitación no llega a ningún lado y nadie se entera hasta que el traspaso
   * se traba.
   */
  public normalizeRecipientIdentifier(identifier: string): string {
    const limpio = (identifier ?? '').trim();

    if (limpio.length > MAX_RECIPIENT_IDENTIFIER_LENGTH) {
      throw new ValidationError(
        `La cuenta de Google no puede superar los ${MAX_RECIPIENT_IDENTIFIER_LENGTH} caracteres.`,
      );
    }

    try {
      return Email.create(limpio).getValue();
    } catch {
      // El mensaje del value object habla de una "dirección de email"; acá el
      // comprador está declarando dónde recibir un canal, y conviene nombrarlo
      // por lo que es para él.
      throw new ValidationError(
        'Indicá la cuenta de Google donde querés recibir el canal, con el formato de una dirección de correo.',
      );
    }
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
        ...(this.verifiedFromYouTubeAt
          ? { verifiedFromYouTubeAt: this.verifiedFromYouTubeAt.toISOString() }
          : {}),
      }
    };
  }
}