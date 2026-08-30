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
    isBlind: boolean;
    /**
     * En la grilla los campos confidenciales nunca vienen, ni siquiera con el
     * NDA firmado: el desbloqueo pertenece al detalle.
     */
    assetData: Record<string, unknown>;
    hiddenFields: string[];
    createdAt: string;
}

export interface ListingDetailDto {
    id: string;
    status: ListingStatusDto;
    askingPrice: MoneyDto;
    estimatedPrice: MoneyDto;
    isBlind: boolean;
    /** Filtrado a los campos públicos si el listing es blind y no hay NDA. */
    assetData: Record<string, unknown>;
    /** Qué campos quedaron ocultos, para que la UI sepa qué difuminar. */
    hiddenFields: string[];
    createdAt: string;
}

/** Criterios de búsqueda del mercado. Todos opcionales. */
export interface ListingFiltersQuery {
    assetType?: string;
    /** En centavos, igual que el resto del sistema. */
    minPrice?: number;
    maxPrice?: number;
}

export interface CreateListingRequest {
    assetType: string;
    assetData: Record<string, unknown>;
    askingPrice: MoneyDto;
    isBlind: boolean;
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
    isBlind: boolean;
    rejectionReason?: string;
    createdAt: string;
}

/** Una operación en la que el usuario es parte. */
export interface MyOperationDto {
    id: string;
    listingId: string;
    status: OperationStatusDto;
    miParte?: NegotiatingPartyDto;
    currentOfferPrice: MoneyDto;
    pendingResponseFrom: NegotiatingPartyDto;
    createdAt: string;
}

export interface NegociacionDto {
    amount: number;
    currency: string;
    proposedBy: NegotiatingPartyDto;
    proposedAt: string;
}

export interface OperationDetailDto {
    id: string;
    listingId: string;
    status: OperationStatusDto;
    /** Ausente cuando quien consulta es un admin que no es parte. */
    miParte?: NegotiatingPartyDto;
    currentOfferPrice: MoneyDto;
    pendingResponseFrom: NegotiatingPartyDto;
    /** Solo presente una vez aceptada la oferta. */
    finalPrice?: MoneyDto;
    buyerPays?: MoneyDto;
    sellerReceives?: MoneyDto;
    platformEarns?: MoneyDto;
    negotiations: NegociacionDto[];
    contracts: ContractDto[];
    createdAt: string;
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
    | 'operacion_completada';

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
