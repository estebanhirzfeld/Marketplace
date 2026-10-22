import { UserRole } from '@marketplace/shared-types';

/**
 * Contrato HTTP de la API.
 *
 * Vive en su propio paquete, sin dependencias del dominio ni de ningún
 * framework, para que lo consuman por igual el frontend web y la futura app
 * React Native. Un cliente móvil no debería arrastrar entidades, use cases ni
 * repositorios: solo necesita saber qué forma tienen las respuestas.
 *
 * `apps/api` tipa sus respuestas contra estos DTOs, así que el compilador
 * detecta si una ruta y sus consumidores se desincronizan.
 */

// ── Primitivos ───────────────────────────────────────────

/** El dinero viaja en centavos enteros, nunca como float. */
export interface MoneyDto {
    cents: number;
    currency: string;
}

/**
 * Estados replicados como uniones de literales en vez de importarlos del
 * dominio, que es servidor puro. Si el dominio agrega un estado, `apps/api`
 * deja de compilar al enviarlo: ese error es la señal de que hay que
 * actualizar el contrato.
 */
export type ListingStatusDto =
    | 'draft'
    | 'under_review'
    | 'published'
    | 'in_operation'
    | 'sold'
    | 'rejected';

export type OperationStatusDto =
    | 'offer_sent'
    | 'negotiating'
    | 'contract_pending'
    | 'contract_signed'
    | 'transfer_in_progress'
    | 'asset_in_custody'
    | 'payment_received'
    | 'completed'
    | 'cancelled';

export type ContractTypeDto = 'buyer_nda' | 'seller_nda' | 'tripartite';

export type NegotiatingPartyDto = 'buyer' | 'seller';

// ── Errores ──────────────────────────────────────────────

/** Códigos estables que la API devuelve. Coinciden con la taxonomía del dominio. */
export type ApiErrorCode =
    | 'NOT_FOUND'
    | 'FORBIDDEN'
    | 'INVALID_STATE'
    | 'VALIDATION'
    | 'UNAUTHORIZED'
    | 'SERVICE_UNAVAILABLE'
    | 'INTERNAL';

export interface ApiErrorDto {
    code: ApiErrorCode;
    message: string;
    /**
     * Solo en el 409 de publicar un canal ya publicado por el propio vendedor:
     * el activo existente, para poder enlazarlo. Nunca se revela el de otro.
     */
    listingId?: string;
}

// ── Autenticación ────────────────────────────────────────

export interface ActorDto {
    id: string;
    role: UserRole;
}

export interface RegisterRequest {
    email: string;
    fullName: string;
    password: string;
    role: UserRole;
    phone?: string;
    country?: string;
    dni?: string;
}

export interface RegisteredUserDto {
    id: string;
    email: string;
    role: UserRole;
    isKycVerified: boolean;
}

/** El perfil del usuario autenticado. `isKycVerified` decide qué puede firmar. */
export interface MyProfileDto {
    id: string;
    email: string;
    fullName: string;
    role: UserRole;
    isKycVerified: boolean;
    dni?: string;
    phone?: string;
    country?: string;
}

export interface VerifyIdentityRequest {
    dni: string;
    phone?: string;
    country?: string;
}

export interface LoginRequest {
    email: string;
    password: string;
}

export interface AuthTokenDto {
    token: string;
    actor: ActorDto;
}

// ── Listings ─────────────────────────────────────────────

export interface ListingSummaryDto {
    id: string;
    status: ListingStatusDto;
    assetType: string;
    askingPrice: MoneyDto;
    estimatedPrice: MoneyDto;
    /**
     * En la grilla los campos confidenciales nunca vienen, ni siquiera con el
     * NDA firmado: el desbloqueo pertenece al detalle.
     */
    assetData: Record<string, unknown>;
    hiddenFields: string[];
    /**
     * Si la plataforma ya puede tomar la custodia del activo hoy. Se deriva de
     * la constancia de acceso y del plazo de espera que impone la plataforma
     * del activo, así que nunca es una promesa: es un cálculo sobre una fecha.
     */
    transferable: boolean;
    /**
     * Desde cuándo va a poder transferirse. Ausente si nadie registró todavía
     * el acceso de la plataforma — sin acceso no hay fecha que prometer.
     */
    transferableFrom?: string;
    createdAt: string;
    /** Cuándo salió al mercado. Distinta de `createdAt`. */
    publishedAt?: string;
}

export interface ListingDetailDto {
    id: string;
    status: ListingStatusDto;
    askingPrice: MoneyDto;
    estimatedPrice: MoneyDto;
    /** Filtrado a los campos públicos si el listing es blind y no hay NDA. */
    assetData: Record<string, unknown>;
    /** Qué campos quedaron ocultos, para que la UI sepa qué difuminar. */
    hiddenFields: string[];
    /**
     * Si quien pide el detalle es el vendedor del activo. Viaja como booleano y
     * no como `sellerId` porque exponer el identificador dejaría correlacionar
     * las publicaciones de un mismo vendedor, que es lo que el blindaje evita.
     */
    isOwnedByViewer: boolean;
    /** Presente desde que el vendedor demostró controlar el activo. */
    ownership?: OwnershipVerificationDto;
    /**
     * Si la plataforma ya puede tomar la custodia del activo hoy. Se deriva de
     * la constancia de acceso y del plazo de espera que impone la plataforma
     * del activo, así que nunca es una promesa: es un cálculo sobre una fecha.
     */
    transferable: boolean;
    /**
     * Desde cuándo va a poder transferirse. Ausente si nadie registró todavía
     * el acceso de la plataforma — sin acceso no hay fecha que prometer.
     */
    transferableFrom?: string;
    /**
     * Lo que le falta hacer al vendedor para cedernos el activo. Lo ve el
     * admin, que es quien atestigua el acceso: es el contexto de lo que está
     * dando por cumplido.
     */
    handoverSteps: HandoverStepDto[];
    /** Lo que este tipo de activo sabe de sí mismo. */
    descriptor: AssetTypeDescriptorDto;
    createdAt: string;
}

/** Criterios de búsqueda del mercado. Todos opcionales. */
export type ListingCurrencyDto = 'ARS' | 'USD';

/**
 * Por qué se ordena el mercado. `created` es la antigüedad del activo en la
 * plataforma y `published` la de la publicación: son dos fechas distintas
 * porque un activo puede pasar días en borrador o en revisión. `estimated` es
 * la proyección que calcula la plataforma, no un dato declarado.
 */
export type ListingSortDto = 'relevance' | 'price' | 'created' | 'published' | 'estimated';

export type SortDirectionDto = 'asc' | 'desc';

/**
 * Lo que hace falta para valuar un activo que todavía no se creó, así el
 * vendedor ve la estimación mientras completa el formulario y no después.
 */
export interface EstimateListingRequest {
    assetType: string;
    assetData: Record<string, unknown>;
}

export interface EstimatedPriceDto {
    estimatedPrice: MoneyDto;
}

export interface ListingFiltersQuery {
    assetType?: string;
    /** Rubro del activo. Vale para los dos tipos. */
    niche?: string;
    /** Solo los que la plataforma ya puede transferir hoy. */
    onlyTransferable?: boolean;
    /** Obligatoria si se acota el rango: comparar centavos de monedas
     *  distintas no significa nada. */
    currency?: ListingCurrencyDto;
    /** En centavos de la moneda elegida, igual que el resto del sistema. */
    minPrice?: number;
    maxPrice?: number;

    /** Solo canales de YouTube. */
    minSubscribers?: number;
    onlyMonetized?: boolean;

    sort?: ListingSortDto;
    direction?: SortDirectionDto;
}

/**
 * Un admin registra que la plataforma obtuvo acceso al activo. Es manual
 * porque la API de YouTube no expone quiénes son los propietarios de un canal.
 */
export interface PlatformAccessAuthorizationRequest {
    /** Ata la vuelta de Google al navegador del admin y al activo; lo valida la capa web. */
    state: string;
}

/** El código que Google devolvió tras elegir la cuenta de custodia. */
export interface VerifyPlatformAccessRequest {
    code: string;
}

export interface RegisterPlatformAccessRequest {
    /** Desde cuándo hay acceso, en ISO. No puede ser futura. */
    accessSince: string;
    /**
     * A qué cuenta de custodia se cedió el activo. Obligatorio: una constancia
     * que no lo dice deja al vendedor sin saber a quién invitar.
     */
    custodyAccountId: string;
    /**
     * Con qué rol queda la plataforma. Ausente significa administrador, que es
     * el caso normal: permisos mínimos con el plazo corriendo igual.
     */
    heldRole?: 'manager' | 'owner';
    notes?: string;
}

// ── Cuentas de custodia ──────────────────────────────────

export type AssetTypeDto = 'youtube' | 'web';

/**
 * La identidad que sostiene activos en custodia de la plataforma. Solo se
 * guarda su `identifier` —nunca credenciales.
 */
export interface CustodyAccountDto {
    id: string;
    label: string;
    identifier: string;
    assetType: AssetTypeDto;
    isActive: boolean;
    notes?: string;
    /** Cuántos activos sostiene ahora mismo. La baja lo necesita; la lista lo muestra. */
    heldAssets: number;
    createdAt: string;
}

export interface CreateCustodyAccountRequest {
    label: string;
    identifier: string;
    assetType: AssetTypeDto;
    notes?: string;
}

export interface UpdateCustodyAccountRequest {
    label?: string;
    identifier?: string;
    /** No se puede cambiar mientras la cuenta sostenga activos. */
    assetType?: AssetTypeDto;
    notes?: string;
}

/**
 * Contraste entre lo que el vendedor declaró y lo que informa la API pública
 * de YouTube. Es una foto con fecha, no una garantía hacia adelante.
 */
export type VerificationSourceDto = 'youtube' | 'adsense' | 'dns';

/** Proveedor de DNS deducido de los servidores de nombres de un dominio. */
export type DnsProviderDto = 'hostinger' | 'cloudflare' | 'godaddy' | 'namecheap' | 'route53' | 'donweb' | 'netlify';

/** Registro TXT que el vendedor tiene que cargar en el DNS de su dominio. */
export interface DomainOwnershipChallengeDto {
    domain: string;
    /** Dónde se carga el registro: `@` en la raíz de la zona o el nombre completo en un subdominio. */
    host: string;
    /** El valor completo del registro TXT. */
    value: string;
    nameservers: string[];
    /** `null` cuando los servidores de nombres no son de un proveedor conocido. */
    provider: DnsProviderDto | null;
}

export interface DomainOwnershipVerificationDto {
    verified: boolean;
}

/**
 * Constancia de que el vendedor demostró controlar el activo. La emite la
 * fuente, no la plataforma: Google responde qué canales controla la cuenta que
 * autorizó, y AdSense qué dominios reporta.
 */
export interface OwnershipVerificationDto {
    verifiedAt: string;
    source: VerificationSourceDto;
    /**
     * Ingreso mensual comprobado, en centavos. Solo AdSense lo expone; en
     * YouTube nunca viene, porque las propiedades de YouTube quedaron fuera de
     * sus reportes y el ingreso sigue siendo una declaración del vendedor.
     */
    monthlyRevenueCents?: number;
}

/** El destino al que hay que mandar al vendedor para que autorice. */
export interface AuthorizationUrlDto {
    url: string;
}

// ── Cuenta de Mercado Pago del vendedor ──────────────────

/** La cuenta bancaria donde el vendedor cobra por transferencia, en una moneda. */
export interface SellerBankAccountDto {
    currency: 'ARS' | 'USD';
    cbu?: string;
    alias?: string;
    holder: string;
    /** CUIT o CUIL del titular. Ausente en cuentas declaradas antes de pedirlo. */
    holderTaxId?: string;
    declaredAt: string;
}

/** Declarar o reemplazar la cuenta de una moneda: un CBU o un alias, no los dos. */
export interface DeclareSellerBankAccountRequest {
    currency: 'ARS' | 'USD';
    cbu?: string;
    alias?: string;
    holder: string;
    /** CUIT o CUIL del titular: tiene que ser el del DNI verificado del vendedor. */
    holderTaxId: string;
}

/**
 * El estado de la vinculación. Nunca incluye los tokens: solo lo que el
 * vendedor necesita ver.
 */
export type SellerPaymentAccountStatusDto =
    | { linked: false }
    | {
          linked: true;
          mpUserId: string;
          linkedAt: string;
          expiresAt: string;
          /** El token de acceso venció; la cuenta sigue vinculada y se renueva al cobrar. */
          expired: boolean;
      };

/**
 * Pedido de la dirección de autorización. `state` y `codeChallenge` los genera
 * el cliente (el desafío PKCE es el SHA-256 del verificador, en base64url).
 */
export interface MercadoPagoAuthorizationRequest {
    state: string;
    codeChallenge: string;
}

/** Completa la vinculación con lo que trajo el navegador al volver. */
export interface LinkMercadoPagoRequest {
    code: string;
    /** El verificador PKCE original, de 43 a 128 caracteres. */
    codeVerifier: string;
}

// ── Conexión del vendedor con un canal de YouTube ────────

/**
 * Pedido de la dirección de autorización. El `state` lo genera el cliente y lo
 * ata a su navegador (cookie): al volver de Google compara el que trae la
 * dirección con el de la cookie, igual que en Mercado Pago.
 */
export interface YouTubeAuthorizationRequest {
    state: string;
}

/** Completa la conexión con el código que trajo el navegador al volver. */
export interface ConnectYouTubeChannelRequest {
    code: string;
}

/**
 * Un canal conectado, con la última lectura de Google. Nunca incluye el token
 * ni los permisos: solo lo que el vendedor necesita ver. El dinero va en
 * centavos de dólar.
 */
export interface YouTubeConnectionDto {
    connectionId: string;
    channelId: string;
    channelTitle: string;
    thumbnailUrl?: string;
    subscribers: number;
    views12Months: number;
    revenue12MonthsCents: number;
    /** Promedio de los últimos 3 meses completos: el que usa la valuación. */
    monthlyRevenueCents: number;
    isMonetized: boolean;
    /** Ausente si Google no informó ningún país (canal sin vistas). */
    topCountry?: string;
    periodStart: string;
    periodEnd: string;
    readAt: string;
}

/** Lo que Google no sabe y el vendedor completa al publicar su canal. */
export interface CreateListingFromYouTubeRequest {
    niche: string;
    hasNoFaceContent: boolean;
    askingPrice: { cents: number; currency: 'ARS' | 'USD' };
}

export interface CreatedYouTubeListingDto {
    listingId: string;
    /** Valuación sobre los datos verificados, en centavos de dólar. */
    estimatedPriceCents: number;
}

export interface ChannelMetricsReportDto {
    channelId: string;
    title: string;
    declaredSubscribers: number;
    /** Ausente si el canal oculta su número de suscriptores. */
    reportedSubscribers?: number;
    /**
     * Ausente cuando no hay con qué comparar. No es lo mismo que `false`: un
     * canal que oculta sus suscriptores no está declarando algo falso.
     *
     * La API redondea el número hacia abajo a tres cifras significativas, así
     * que la comparación aplica el mismo redondeo al valor declarado.
     */
    subscribersMatch?: boolean;
    views: number;
    publicVideos: number;
    checkedAt: string;
}

export interface CreateListingRequest {
    assetType: string;
    assetData: Record<string, unknown>;
    askingPrice: MoneyDto;
}

export interface CreatedListingDto {
    id: string;
    status: ListingStatusDto;
    askingPrice: MoneyDto;
    estimatedPrice: MoneyDto;
}

/**
 * Cambios del vendedor sobre su listing. Todo es opcional pero tiene que haber
 * al menos un campo. En borrador o rechazado admite los tres; publicado, solo
 * `askingPrice`.
 */
export interface EditListingRequest {
    niche?: string;
    hasNoFaceContent?: boolean;
    askingPrice?: MoneyDto;
}

export interface RejectListingRequest {
    reason: string;
}

// ── Operaciones ──────────────────────────────────────────

export interface OfferSummaryDto {
    id: string;
    /**
     * Quién ofertó. El vendedor ya ve el nombre de su contraparte en el detalle
     * de la operación y en el contrato que firman; una tabla de ofertas contra
     * identificadores no se puede leer.
     */
    buyerName: string;
    status: OperationStatusDto;
    currentOfferPrice: MoneyDto;
    /** A quién le toca responder. Deriva del historial, no se almacena. */
    pendingResponseFrom: NegotiatingPartyDto;
}

export interface CreateOfferRequest {
    offerPrice: MoneyDto;
}

export interface CreatedOperationDto {
    id: string;
    status: OperationStatusDto;
}

export interface CounterOfferRequest {
    price: MoneyDto;
}

// ── Contratos ────────────────────────────────────────────

/**
 * El documento de un contrato, regenerado en el momento.
 *
 * `coincide: false` significa que el texto vigente no es el que se firmó.
 * Se informa en vez de ocultarse.
 */
export interface ContractDocumentDto {
    contractId: string;
    type: ContractTypeDto;
    text: string;
    hash: string;
    signedHash?: string;
    matches: boolean;
    signed: boolean;
}

export interface ContractDto {
    id: string;
    type: ContractTypeDto;
    isFullySigned: boolean;
}

// ── Vistas propias del usuario ───────────────────────────

/** Un listing del propio vendedor: incluye borradores y rechazados. */
export interface MyListingDto {
    id: string;
    status: ListingStatusDto;
    assetType: string;
    /** Cómo se llama el activo. Su dueño siempre lo ve. */
    assetName?: string;
    /**
     * A qué cuenta tiene que invitarnos el vendedor. Es el único dato que
     * necesita copiar, así que viaja aparte de la prosa del instructivo.
     */
    custodyAccountIdentifier?: string;
    /** Rubro: con qué nombrar el activo en el catálogo. Es un campo público. */
    niche?: string;
    /**
     * Dirección del canal, solo en un activo de YouTube. Es de su dueño: de ahí
     * se saca el identificador para mostrarle la foto de su canal conectado.
     */
    channelUrl?: string;
    askingPrice: MoneyDto;
    estimatedPrice: MoneyDto;
    rejectionReason?: string;
    ownership?: OwnershipVerificationDto;
    /**
     * Si la plataforma ya puede tomar la custodia del activo hoy. Se deriva de
     * la constancia de acceso y del plazo de espera que impone la plataforma
     * del activo, así que nunca es una promesa: es un cálculo sobre una fecha.
     */
    transferable: boolean;
    /**
     * Desde cuándo va a poder transferirse. Ausente si nadie registró todavía
     * el acceso de la plataforma — sin acceso no hay fecha que prometer.
     */
    transferableFrom?: string;
    /**
     * Lo que el vendedor tiene que hacer para cedernos el activo. Depende del
     * tipo: un canal se convierte a Cuenta de Marca y nos invita; un dominio
     * se cede con su código de autorización.
     */
    handoverSteps: HandoverStepDto[];
    /** Si el vendedor avisó que invitó a la plataforma y si un admin ya lo confirmó. */
    platformAccessStatus: PlatformAccessStatusDto;
    /** Cuándo avisó. La cola del admin ordena por esta fecha. */
    platformAccessRequestedAt?: string;
    /** Quién vende el activo. Solo viaja en la bandeja de accesos del admin. */
    sellerName?: string;
    /** Lo que este tipo de activo sabe de sí mismo. */
    descriptor: AssetTypeDescriptorDto;
    createdAt: string;
}

/**
 * Lo que un tipo de activo sabe de sí mismo.
 *
 * Viaja para que la interfaz deje de preguntar "¿de qué tipo sos?" y decidir
 * por su cuenta. Es un espejo de `AssetTypeDescriptor` del dominio: semántica,
 * no presentación — el formato de los números y los colores siguen siendo de
 * la vista.
 */
export type AssetFieldKindDto = 'money' | 'number' | 'percentage' | 'text' | 'boolean' | 'niche' | 'date';

export interface AssetFieldDto {
    key: string;
    label: string;
    kind: AssetFieldKindDto;
    confidential: boolean;
    /** Dato interno de la valuación: las vistas no lo muestran. */
    internal?: boolean;
}

export interface AssetTypeDescriptorDto {
    assetType: string;
    label: string;
    identityField: AssetFieldDto;
    fields: AssetFieldDto[];
    summaryMetricKeys: string[];
    ownershipSource: 'youtube' | 'adsense' | 'dns';
    transferWaitingDays: number;
    /**
     * Si la custodia depende de un acceso que la plataforma registra antes de
     * firmar. `false` en un sitio: no hay que mostrarle nada del acceso.
     */
    requiresPlatformAccess: boolean;
    /** Por qué la cesión del acceso la registra una persona. */
    handoverNotice: string;
    /** Por qué hay que esperar. Ausente cuando la transferencia es inmediata. */
    waitingNotice?: string;
    /** Qué pasa con el ingreso declarado: si se comprueba o queda declarado. */
    revenueNotice: string;
}

/** Un enlace directo a la pantalla donde se hace un paso. */
export interface HandoverStepLinkDto {
    label: string;
    href: string;
}

/** Un paso de la cesión del activo a la plataforma. */
/** Cuándo le toca el paso al vendedor: publicado, o con una venta en curso. */
export type TransferPhaseDto = 'listing' | 'operation';

/** Dónde está el acceso de la plataforma al activo, visto desde el vendedor. */
export type PlatformAccessStatusDto = 'pending' | 'verifying' | 'waiting' | 'immediate';

/** Quién da fe de que un paso se cumplió: el sistema, quien lo declara o el admin. */
export type TransferStepCheckDto = 'automatic' | 'declared' | 'admin';

export type TransferStageDto = 'listing' | 'custody' | 'payment' | 'delivery' | 'closing';

export type TransferGateDto = 'sign' | 'custody' | 'payment' | 'receipt' | 'complete';

export interface HandoverStepDto {
    id: string;
    /** Clave estable del paso dentro de su tipo de activo. Ausente en respuestas anteriores. */
    key?: string;
    /** Quién da fe del paso. Ausente en respuestas anteriores. */
    check?: TransferStepCheckDto;
    /** Cuándo se le pide. Los pasos de la fase `operation` aparecen recién con la venta firmada. */
    phase?: TransferPhaseDto;
    /** En qué tramo del escrow cae. Ausente en respuestas anteriores. */
    stage?: TransferStageDto;
    /** Lo que traba mientras no se cumple. Ausente en los pasos informativos. */
    gate?: TransferGateDto;
    /** Quién lo hace. Ausente en respuestas anteriores. */
    requiredActor?: 'seller' | 'buyer' | 'platform';
    /** Contado en tercera persona: es lo que lee la plataforma al atestiguar. */
    description: string;
    /** El mismo paso dicho al vendedor, que es quien lo hace. */
    instruction?: string;
    /** Título corto, para el carrusel de instrucciones. */
    title?: string;
    /** El detalle del paso en viñetas cortas. */
    details?: string[];
    /** Enlaces directos a las pantallas donde se hace el paso. */
    links?: HandoverStepLinkDto[];
    /**
     * Si le toca después de que la plataforma entre en escena. Separa lo que
     * el vendedor puede hacer ya de lo que se le va a pedir con el contrato
     * firmado, que es el único momento en que cede el control.
     */
    afterPlatformStarts?: boolean;
}

/** Una operación en la que el usuario es parte. */
export interface MyOperationDto {
    id: string;
    listingId: string;
    /** Cómo se llama el activo. Ausente sin acceso a los datos reservados. */
    assetName?: string;
    /**
     * Con qué nombrar el activo en una lista. Son los campos que la strategy
     * declara públicos —los mismos que el mercado muestra sin NDA—, así que
     * dicen de qué trata el activo, no cuál es. Ausentes si ya no está.
     */
    assetType?: string;
    niche?: string;
    status: OperationStatusDto;
    miParte?: NegotiatingPartyDto;
    currentOfferPrice: MoneyDto;
    pendingResponseFrom: NegotiatingPartyDto;
    createdAt: string;
}

export interface NegotiationDto {
    amount: number;
    currency: string;
    proposedBy: NegotiatingPartyDto;
    proposedAt: string;
}

/** Una operación esperando un movimiento de la plataforma. */
export interface PendingOperationDto {
    /**
     * Con qué reconocer la fila. El panel mostraba solo el estado y el monto,
     * así que dos operaciones esperando lo mismo eran indistinguibles.
     */
    assetName?: string;
    assetType?: string;
    buyerName?: string;
    sellerName?: string;
    id: string;
    status: OperationStatusDto;
    listingId: string;
    amount?: MoneyDto;
    waitingSince: string;
}

/** El tablero de la plataforma: qué hay para hacer y en qué estado está todo. */
export interface PlatformDashboardDto {
    listingsToReview: number;
    publishedListings: number;
    operationsInProgress: number;
    openReports: number;
    /** Solo de operaciones completadas: comprometido no es cobrado. */
    earned: MoneyDto;
    pending: PendingOperationDto[];
    /**
     * Las operaciones cuyo próximo paso es del vendedor. La plataforma no
     * puede destrabarlas: solo avisar y esperar la declaración.
     */
    waitingOnSeller: PendingOperationDto[];
}

/** Una de las dos partes de una operación, con nombre para poder mostrarla. */
export interface OperationPartyDto {
    id: string;
    fullName: string;
}

export type OperationRoleDto = 'buyer' | 'seller' | 'platform';

export type NextActionIdDto =
    | 'respond_offer'
    | 'sign_contract'
    | 'register_platform_access'
    | 'declare_recipient'
    | 'declare_handover'
    | 'move_domain_to_platform'
    | 'verify_custody'
    | 'pay'
    | 'enable_payment_method'
    | 'link_payment_account'
    | 'confirm_seller_receipt'
    | 'confirm_commission_receipt'
    | 'review_receipt'
    | 'respond_receipt_review'
    | 'resolve_receipt_review'
    | 'deliver_asset'
    | 'accept_delivery'
    | 'complete_operation';

/**
 * Lo que le toca a un rol: hacer algo (y si eso traba la operación), esperar a
 * otro, o nada porque terminó.
 */
export type NextStepDto =
    | { kind: 'act'; id: NextActionIdDto; blocking: boolean; deadline?: string }
    | { kind: 'wait'; waitingOn: OperationRoleDto[]; deadline?: string }
    | { kind: 'done' }
    | { kind: 'cancelled' };

export interface TimelineStageDto {
    key: 'negotiation' | 'contract' | 'custody' | 'payment' | 'delivery' | 'closing';
    state: 'done' | 'current' | 'pending';
    at?: string;
}

/** La próxima acción de cada rol, a quién le toca y la línea de tiempo común. */
export interface OperationNextDto {
    byRole: Record<OperationRoleDto, NextStepDto>;
    turn: OperationRoleDto[];
    timeline: TimelineStageDto[];
}

export interface OperationDetailDto {
    /**
     * Con qué nombrar el activo. Campos públicos de la strategy: dicen de
     * qué trata, no cuál es. Ausentes si el activo ya no está.
     */
    assetType?: string;
    niche?: string;
    /** Cómo se llama el activo. Ausente sin acceso a los datos reservados. */
    assetName?: string;
    /**
     * Si el activo ya se puede transferir. Firmar el contrato tripartito lo
     * exige, así que la pantalla lo necesita para no ofrecer una firma que el
     * dominio va a rechazar.
     */
    transferable?: boolean;
    /** Desde cuándo. Ausente mientras la plataforma no tenga acceso al activo. */
    transferableFrom?: string;
    id: string;
    listingId: string;
    status: OperationStatusDto;
    /** Ausente cuando quien consulta es un admin que no es parte. */
    miParte?: NegotiatingPartyDto;
    /**
     * Quiénes son las dos partes. Sin esto la negociación se veía contra un
     * identificador y no contra una persona.
     */
    buyer: OperationPartyDto;
    seller: OperationPartyDto;
    currentOfferPrice: MoneyDto;
    pendingResponseFrom: NegotiatingPartyDto;
    /** Solo presente una vez aceptada la oferta. */
    finalPrice?: MoneyDto;
    buyerPays?: MoneyDto;
    sellerReceives?: MoneyDto;
    platformEarns?: MoneyDto;
    negotiations: NegotiationDto[];
    contracts: ContractDto[];
    /** Presente desde que un admin registra la verificación de la custodia. */
    custody?: CustodyVerificationDto;
    /** Presente desde que el pago del comprador quedó confirmado. */
    payment?: PaymentRecordDto;
    /** Dónde declaró el comprador que quiere recibir el activo. Tarea pendiente si falta. */
    recipientIdentity?: RecipientIdentityDto;
    /** Constancia de entrega, una vez cerrada la operación. */
    delivery?: DeliveryVerificationDto;
    /** La declaración del vendedor de haber cedido el control del activo. */
    transferInitiation?: TransferInitiationDto;
    /** Presente mientras la última declaración de cesión esté rechazada. */
    transferRejection?: TransferRejectionDto;
    /** Los comprobantes de la transferencia dividida, uno por destinatario. */
    paymentReceipts?: PaymentReceiptDto[];
    /**
     * Lo que le falta al vendedor ceder después de la firma. Ausente si quien
     * arma el DTO no resolvió cuenta de custodia.
     */
    handoverSteps?: HandoverStepDto[];
    /**
     * Cómo va cada paso del traspaso que ya tiene progreso: estado, plazo y si
     * lo dio por cumplido una persona. Un paso que no aparece está pendiente y
     * sin plazo. Ausente si la API no lo resolvió.
     */
    stepProgress?: StepProgressDto[];
    /** La próxima acción de cada rol. Ausente en respuestas anteriores. */
    next?: OperationNextDto;
    createdAt: string;
}

/** El progreso de un paso del traspaso, por su `key` estable. */
export interface StepProgressDto {
    stepKey: string;
    status: DomainCustodyCheckDto['status'];
    /** ISO. Hasta cuándo vale la invitación de Hostinger, si el paso tiene una. */
    deadlineAt?: string;
    attested: boolean;
}

/** Dónde el comprador quiere recibir el activo. */
export interface RecipientIdentityDto {
    identifier: string;
    declaredAt: string;
    notes?: string;
}

export interface DeclareRecipientIdentityRequest {
    identifier: string;
}

/**
 * Constancia de entrega, simétrica a `CustodyVerificationDto`.
 * `deliveredToIdentifier` es copia congelada de la identidad declarada.
 */
export interface DeliveryVerificationDto {
    verifiedBy: string;
    verifiedAt: string;
    deliveredToIdentifier: string;
    buyerIsPrimaryOwner: boolean;
    accessTransferred: boolean;
    sellerRemoved: boolean;
    notes?: string;
}

/**
 * `complete()` registra la constancia y cierra en un solo acto.
 * `deliveredToIdentifier` NO viaja: lo copia el dominio de la identidad
 * declarada, para no entregar a un destino que el comprador nunca eligió.
 */
export interface CompleteOperationRequest {
    buyerIsPrimaryOwner: boolean;
    accessTransferred: boolean;
    sellerRemoved: boolean;
    notes?: string;
}

/**
 * Constancia de qué se verificó antes de declarar el activo en custodia.
 * Las partes la ven: es lo que respalda el pedido de pago al comprador.
 */
/** Constancia de por dónde entró el pago del comprador. */
export interface PaymentRecordDto {
    provider: 'mercadopago' | 'transferencia';
    externalId?: string;
    method: string;
    amountCents: number;
    currency: string;
    confirmedAt: string;
}

/** Cómo quedó el paso de trasladar el dominio a la plataforma tras comprobarlo. */
export interface DomainCustodyCheckDto {
    status: 'pending' | 'waiting' | 'done' | 'expired' | 'rejected';
}

/** Cómo quedó el paso de entregar el dominio al comprador. */
export interface DomainDeliveryCheckDto {
    status: DomainCustodyCheckDto['status'];
}

/** Lo que el admin anota al dar por cumplido un paso declarado de la entrega. */
export interface AttestTransferStepRequest {
    notes?: string;
}

/** Por qué el admin rechaza la declaración de cesión del vendedor. */
export interface RejectTransferRequest {
    reason: string;
}

/** El último rechazo de la declaración de cesión, hasta que el vendedor declare de nuevo. */
export interface TransferRejectionDto {
    reason: string;
    rejectedAt: string;
}

/** Cómo quedó el paso después de atestiguarlo. */
export interface TransferStepAttestationDto {
    status: DomainCustodyCheckDto['status'];
}

/** El link al que hay que mandar al comprador para que pague. */
export interface CheckoutDto {
    url: string;
}

/** Por qué Mercado Pago no se puede usar en una operación. */
export type MercadoPagoUnavailableReasonDto =
    | 'not_configured'
    | 'seller_not_linked'
    | 'rate_unavailable';

/**
 * Cómo puede pagar el comprador una operación con el activo en custodia. Lo
 * pueden pedir las partes y los admins; las instrucciones de transferencia
 * viajan solo a ellos.
 */
export interface PaymentOptionsDto {
    /** Moneda de la operación. */
    currency: string;
    /** Lo que paga el comprador, comisión incluida, en la moneda de la operación. */
    amount: MoneyDto;
    mercadopago: {
        available: boolean;
        reason?: MercadoPagoUnavailableReasonDto;
        chargedIn: 'ARS';
        /** `true` cuando la operación no es en pesos y se cobra convertida. */
        converted: boolean;
    };
    transfer: {
        available: boolean;
        /** Por qué no se puede: falta la cuenta del vendedor en la moneda de la operación. */
        reason?: 'seller_bank_missing';
        instructions?: string;
        /** Lo que el comprador indica al transferir: el id de la operación. */
        reference: string;
        /** Las dos transferencias, cada una con su monto. Solo para el comprador y la plataforma. */
        destinations?: TransferDestinationDto[];
    };
}

export type ReceiptRecipientDto = 'seller' | 'platform';

export type TransferDestinationDto =
    | { recipient: 'seller'; amount: MoneyDto; bankAccount: { cbu?: string; alias?: string; holder: string; holderTaxId?: string } }
    | { recipient: 'platform'; amount: MoneyDto; instructions: string };

/** Quien recibió la plata confirma su comprobante, o lo rechaza con el motivo. */
export type ReceiptRejectionCodeDto = 'not_credited' | 'amount_mismatch' | 'other';

export type ReceiptDecisionRequest = { confirm: true } | { confirm: false; code: ReceiptRejectionCodeDto; detail?: string };

/** En qué está un comprobante. El archivo se pide aparte, a quien le corresponde verlo. */
export interface PaymentReceiptDto {
    recipient: ReceiptRecipientDto;
    status: 'pending' | 'confirmed' | 'rejected' | 'in_review';
    /** La revisión de la plataforma, mientras está abierta. */
    review?: {
        stage: 'coherence' | 'awaiting_seller';
        requestedBy: 'buyer' | 'automatic';
        /** Hasta cuándo responde el vendedor, una vez revisada la coherencia. */
        sellerDeadline?: string;
        bankReference?: string;
        /** Si el vendedor adjuntó los movimientos de su cuenta. */
        hasSellerStatement: boolean;
    };
    uploadedAt: string;
    /** El tipo del archivo, detectado por su contenido: una imagen tiene vista previa. */
    contentType: string;
    /** El motivo elegido. Ausente en rechazos anteriores a los motivos. */
    rejectionCode?: ReceiptRejectionCodeDto;
    /** El detalle que escribió quien rechazó, si escribió uno. */
    rejectionReason?: string;
}

/**
 * La declaración del vendedor de haber cedido el control del activo.
 *
 * `declaredBy` no viaja, igual que `CustodyVerificationDto` no expone
 * `verifiedBy`: la asimetría con el resto de los campos es a propósito.
 */
export interface TransferInitiationDto {
    declaredAt: string;
    controlCeded: boolean;
    /** Copia congelada al declarar. Ausente si el acceso no nombraba cuenta. */
    custodyAccountId?: string;
    /**
     * Con qué nombre reconoce esa cuenta una persona. Ausente si la cuenta ya
     * no está en el padrón, que no es lo mismo que no haber registrado ninguna:
     * para distinguirlo hay que mirar si vino `custodyAccountId`.
     */
    custodyAccountIdentifier?: string;
    notes?: string;
}

/**
 * Iniciar la transferencia exige declarar la cesión de control.
 *
 * `controlCeded` distinto de `true` es un vendedor que todavía no terminó, no
 * un dato faltante: el dominio lo rechaza igual que rechaza `isPrimaryOwner:
 * false` en la custodia.
 */
export interface InitiateTransferRequest {
    controlCeded: boolean;
    notes?: string;
    /** En un sitio, el mail de la cuenta de Hostinger desde la que sale el dominio. */
    sellerSourceIdentity?: string;
}

export interface CustodyVerificationDto {
    verifiedBy: string;
    verifiedAt: string;
    isPrimaryOwner: boolean;
    accessSecured: boolean;
    metrics: Record<string, number>;
    /**
     * Copia congelada de la cuenta de custodia al confirmar. Ausente en
     * constancias anteriores a `asset-custody-identity`: se muestra como
     * "sin registrar", nunca se inventa.
     */
    custodyAccountId?: string;
    /** Con qué nombre reconoce esa cuenta una persona. */
    custodyAccountIdentifier?: string;
    notes?: string;
}

/**
 * Confirmar la custodia exige declarar qué se verificó.
 *
 * `isPrimaryOwner` es el campo que importa: mientras la plataforma sea
 * propietaria pero no principal, el vendedor conserva la facultad de
 * expulsarla y la custodia no es efectiva. El dominio rechaza el registro si
 * llega en `false`.
 */
export interface ConfirmCustodyRequest {
    isPrimaryOwner: boolean;
    accessSecured: boolean;
    metrics: Record<string, number>;
    notes?: string;
}

// ── Denuncias ────────────────────────────────────────────

export type ReportReasonDto =
    | 'metricas_falsas'
    | 'ingreso_falso'
    | 'activo_no_entregado'
    | 'activo_recuperado'
    | 'pago_no_recibido'
    | 'otro';

/**
 * Solo dos estados, y ninguno dice quién tiene razón: la plataforma no arbitra
 * el fondo del reclamo, deja constancia y reúne la evidencia que registró.
 */
export type ReportStatusDto = 'open' | 'closed';

export interface ReportDto {
    id: string;
    operationId: string;
    reason: ReportReasonDto;
    detail: string;
    status: ReportStatusDto;
    /** Si quien consulta abrió la denuncia o la recibió. */
    miRol: 'denunciante' | 'denunciado';
    closedAt?: string;
    closedReason?: string;
    createdAt: string;
}

export interface FileReportRequest {
    operationId: string;
    reason: ReportReasonDto;
    detail: string;
}

export interface CloseReportRequest {
    reason: string;
}

export interface PartyIdentityDto {
    id: string;
    fullName: string;
    dni?: string;
    email: string;
    country?: string;
}

export interface SignatureEvidenceDto {
    role: string;
    signedAt?: string;
    ipAddress?: string;
    documentHash?: string;
}

export interface ContractEvidenceDto {
    id: string;
    type: string;
    documentHash?: string;
    signatures: SignatureEvidenceDto[];
}

/**
 * El legajo de una denuncia: todo lo que la plataforma registró mientras la
 * operación transcurría, reunido en un solo lugar. No dictamina nada.
 */
export interface EvidenceDossierDto {
    reportId: string;
    filedAt: string;
    reason: ReportReasonDto;
    detail: string;
    reporter: PartyIdentityDto;
    reported: PartyIdentityDto;
    operation: {
        id: string;
        status: string;
        finalPriceCents?: number;
        currency: string;
        createdAt: string;
        completedAt?: string;
    };
    negotiations: Array<{ amount: number; currency: string; proposedBy: string; proposedAt: string }>;
    declaredAsset: { assetType: string; assetData: Record<string, unknown> };
    verifications: {
        ownership?: { verifiedAt: string; assetId: string; source: string; monthlyRevenueCents?: number };
        platformAccess?: { verifiedAt: string; accessSince: string };
        /**
         * Lo que el vendedor declaró al ceder el control. La única pieza del
         * escrow que aporta él, y por eso la que importa ante un reclamo por un
         * traspaso que nunca ocurrió. Sin `declaredBy`: el vendedor ya está
         * identificado como parte en el propio legajo.
         */
        transferInitiation?: {
            declaredAt: string;
            controlCeded: boolean;
            custodyAccountId?: string;
            notes?: string;
        };
        custody?: {
            verifiedAt: string;
            isPrimaryOwner: boolean;
            accessSecured: boolean;
            metrics: Record<string, number>;
        };
    };
    contracts: ContractEvidenceDto[];
}

// ── Avisos ───────────────────────────────────────────────

export type NotificationTypeDto =
    | 'oferta_recibida'
    | 'contraoferta_recibida'
    | 'oferta_aceptada'
    | 'oferta_cancelada'
    | 'listing_aprobado'
    | 'listing_rechazado'
    | 'contrato_firmado'
    /** Al vendedor, en vez de `contrato_firmado`: le toca ceder el control. */
    | 'cesion_pendiente'
    | 'activo_en_custodia'
    | 'pago_confirmado'
    | 'operacion_completada'
    | 'denuncia_recibida'
    /** Los que le tocan a la plataforma. */
    | 'revision_pendiente'
    | 'acceso_pendiente'
    | 'custodia_pendiente'
    | 'liquidacion_pendiente'
    /** Al vendedor: el admin no encontró su invitación a la plataforma. */
    | 'acceso_no_encontrado'
    /** A la plataforma: un vendedor avisó que ya la invitó a su activo. */
    | 'acceso_solicitado'
    | 'acceso_confirmado'
    /** A la plataforma: la invitación de traslado del dominio vence en `occursAt`. */
    | 'traspaso_recordatorio'
    /** A la plataforma: la invitación de traslado del dominio venció en `occursAt`. */
    | 'traspaso_vencido'
    /** A la plataforma: el dominio del sitio llegó a su cuenta; falta declarar la custodia. */
    | 'dominio_en_custodia'
    /** Al comprador: la invitación para recibir el dominio vence en `occursAt`. */
    | 'entrega_recordatorio'
    /** A la plataforma: la invitación de entrega al comprador venció en `occursAt`. */
    | 'entrega_vencida'
    /** Al vendedor: la plataforma rechazó su declaración de cesión; el motivo está en la operación. */
    | 'cesion_rechazada'
    /** A quien recibe la transferencia: el comprador subió el comprobante para confirmar. */
    | 'comprobante_subido'
    /** Al comprador: rechazaron uno de sus comprobantes; el motivo está en la operación. */
    | 'comprobante_rechazado'
    /** A la plataforma: hay una revisión de pago para atender (pedida, o con los movimientos del vendedor). */
    | 'revision_solicitada'
    /** Al vendedor: tiene que responder la revisión del pago; `occursAt` es su plazo. */
    | 'revision_pendiente_vendedor'
    /** A las dos partes: la plataforma resolvió la revisión del pago. */
    | 'revision_resuelta';

/**
 * El texto no viaja: el cliente lo redacta a partir del tipo. Así se cambia
 * la redacción sin tocar la base ni la API, y se traduce sin duplicar datos.
 */
export interface NotificationDto {
    id: string;
    type: NotificationTypeDto;
    operationId?: string;
    listingId?: string;
    amount?: MoneyDto;
    /** Fecha a la que se refiere el aviso (ISO), cuando habla de una. */
    occursAt?: string;
    read: boolean;
    createdAt: string;
}

export interface NotificationsDto {
    items: NotificationDto[];
    sinLeer: number;
}
