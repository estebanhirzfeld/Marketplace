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
    | 'INTERNAL';

export interface ApiErrorDto {
    code: ApiErrorCode;
    message: string;
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
export type ListingSortDto = 'price' | 'created' | 'published' | 'estimated';

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

    /** Solo sitios web. */
    minDomainAuthority?: number;

    sort?: ListingSortDto;
    direction?: SortDirectionDto;
}

/**
 * Un admin registra que la plataforma obtuvo acceso al activo. Es manual
 * porque la API de YouTube no expone quiénes son los propietarios de un canal.
 */
export interface RegisterPlatformAccessRequest {
    /** Desde cuándo hay acceso, en ISO. No puede ser futura. */
    accessSince: string;
    notes?: string;
}

/**
 * Contraste entre lo que el vendedor declaró y lo que informa la API pública
 * de YouTube. Es una foto con fecha, no una garantía hacia adelante.
 */
export type VerificationSourceDto = 'youtube' | 'adsense';

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

export interface RejectListingRequest {
    reason: string;
}

// ── Operaciones ──────────────────────────────────────────

export interface OfferSummaryDto {
    id: string;
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
    createdAt: string;
}

/** Una operación en la que el usuario es parte. */
export interface MyOperationDto {
    id: string;
    listingId: string;
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
}

/** Una de las dos partes de una operación, con nombre para poder mostrarla. */
export interface OperationPartyDto {
    id: string;
    fullName: string;
}

export interface OperationDetailDto {
    /**
     * Con qué nombrar el activo. Campos públicos de la strategy: dicen de
     * qué trata, no cuál es. Ausentes si el activo ya no está.
     */
    assetType?: string;
    niche?: string;
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
    createdAt: string;
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

/** El link al que hay que mandar al comprador para que pague. */
export interface CheckoutDto {
    url: string;
}

/** Registro de una transferencia bancaria que solo una persona pudo ver llegar. */
export interface ConfirmPaymentRequest {
    method: string;
    amountCents: number;
    currency: string;
}

export interface CustodyVerificationDto {
    verifiedBy: string;
    verifiedAt: string;
    isPrimaryOwner: boolean;
    accessSecured: boolean;
    metrics: Record<string, number>;
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
    | 'activo_en_custodia'
    | 'pago_confirmado'
    | 'operacion_completada'
    | 'denuncia_recibida';

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
    read: boolean;
    createdAt: string;
}

export interface NotificationsDto {
    items: NotificationDto[];
    sinLeer: number;
}
