import {
    AuthTokenDto,
    ContractDto,
    CounterOfferRequest,
    CreateListingRequest,
    CreateOfferRequest,
    CreatedListingDto,
    CreatedOperationDto,
    ListingDetailDto,
    ListingFiltersQuery,
    ListingSummaryDto,
    LoginRequest,
    OfferSummaryDto,
    RegisterRequest,
    RegisteredUserDto,
    MyListingDto,
    MyProfileDto,
    NotificationsDto,
    VerifyIdentityRequest,
    MyOperationDto,
    OperationDetailDto,
} from '@marketplace/api-contract';
import { ApiError } from './ApiError';

/**
 * Cómo obtener el token. Se pasa como función y no como string porque cada
 * plataforma lo guarda distinto: la web en una cookie httpOnly que solo el
 * servidor lee, y React Native en secure storage de forma asíncrona.
 */
export type TokenProvider = () => string | undefined | Promise<string | undefined>;

export interface MarketplaceClientOptions {
    baseUrl: string;
    getToken?: TokenProvider;
    /** Inyectable para tests; por defecto el fetch global. */
    fetchImpl?: typeof fetch;
}

/**
 * Cliente HTTP de la API.
 *
 * TypeScript puro sobre `fetch`, sin dependencias de framework ni de Node: el
 * mismo archivo corre en un Server Component de Next, en el browser y en React
 * Native. Por eso vive en packages/ y no dentro de apps/web.
 */
export class MarketplaceClient {
    private readonly baseUrl: string;
    private readonly getToken?: TokenProvider;
    private readonly fetchImpl: typeof fetch;

    constructor(options: MarketplaceClientOptions) {
        this.baseUrl = options.baseUrl.replace(/\/$/, '');
        this.getToken = options.getToken;
        this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    }

    // ── Autenticación ────────────────────────────────────

    register(body: RegisterRequest): Promise<RegisteredUserDto> {
        return this.request('POST', '/auth/register', { body, anonimo: true });
    }

    login(body: LoginRequest): Promise<AuthTokenDto> {
        return this.request('POST', '/auth/login', { body, anonimo: true });
    }

    /** Perfil propio. Trae el estado real de KYC, no el que cargue el token. */
    perfil(): Promise<MyProfileDto> {
        return this.request('GET', '/me');
    }

    verificarIdentidad(body: VerifyIdentityRequest): Promise<MyProfileDto> {
        return this.request('POST', '/me/kyc', { body });
    }

    notificaciones(soloNoLeidas = false): Promise<NotificationsDto> {
        return this.request('GET', `/me/notifications${soloNoLeidas ? '?soloNoLeidas=true' : ''}`);
    }

    marcarAvisoLeido(id: string): Promise<void> {
        return this.request('POST', `/me/notifications/${encodeURIComponent(id)}/read`);
    }

    // ── Listings ─────────────────────────────────────────

    listings(filtros?: ListingFiltersQuery): Promise<ListingSummaryDto[]> {
        const query = new URLSearchParams();
        if (filtros?.assetType) query.set('assetType', filtros.assetType);
        if (filtros?.minPrice !== undefined) query.set('minPrice', String(filtros.minPrice));
        if (filtros?.maxPrice !== undefined) query.set('maxPrice', String(filtros.maxPrice));

        const sufijo = query.toString() === '' ? '' : `?${query.toString()}`;
        return this.request('GET', `/listings${sufijo}`, { anonimo: true });
    }

    /** El detalle es público; con token puede revelar más campos. */
    listing(id: string): Promise<ListingDetailDto> {
        return this.request('GET', `/listings/${encodeURIComponent(id)}`);
    }

    createListing(body: CreateListingRequest): Promise<CreatedListingDto> {
        return this.request('POST', '/listings', { body });
    }

    submitListing(id: string): Promise<void> {
        return this.request('POST', `/listings/${encodeURIComponent(id)}/submit`);
    }

    approveListing(id: string): Promise<void> {
        return this.request('POST', `/listings/${encodeURIComponent(id)}/approve`);
    }

    rejectListing(id: string, reason: string): Promise<void> {
        return this.request('POST', `/listings/${encodeURIComponent(id)}/reject`, {
            body: { reason },
        });
    }

    /** Solo el dueño del listing. Preserva la licitación a sobre cerrado. */
    offersOf(listingId: string): Promise<OfferSummaryDto[]> {
        return this.request('GET', `/listings/${encodeURIComponent(listingId)}/offers`);
    }

    signNda(listingId: string): Promise<ContractDto> {
        return this.request('POST', `/listings/${encodeURIComponent(listingId)}/nda`);
    }

    createOffer(listingId: string, body: CreateOfferRequest): Promise<CreatedOperationDto> {
        return this.request('POST', `/listings/${encodeURIComponent(listingId)}/offers`, {
            body,
        });
    }

    /** Los listings del usuario autenticado, en cualquier estado. */
    misListings(): Promise<MyListingDto[]> {
        return this.request('GET', '/me/listings');
    }

    /** Las operaciones donde el usuario es comprador o vendedor. */
    misOperaciones(): Promise<MyOperationDto[]> {
        return this.request('GET', '/me/operations');
    }

    /** Cola de revisión. Solo admin. */
    listingsParaRevisar(): Promise<MyListingDto[]> {
        return this.request('GET', '/admin/listings');
    }

    // ── Operaciones ──────────────────────────────────────

    operation(id: string): Promise<OperationDetailDto> {
        return this.request('GET', `/operations/${encodeURIComponent(id)}`);
    }


    counterOffer(operationId: string, body: CounterOfferRequest): Promise<void> {
        return this.operationStep(operationId, 'counter', body);
    }

    acceptOffer(operationId: string): Promise<void> {
        return this.operationStep(operationId, 'accept');
    }

    cancelOperation(operationId: string): Promise<void> {
        return this.operationStep(operationId, 'cancel');
    }

    initiateTransfer(operationId: string): Promise<void> {
        return this.operationStep(operationId, 'transfer');
    }

    confirmCustody(operationId: string): Promise<void> {
        return this.operationStep(operationId, 'custody');
    }

    confirmPayment(operationId: string): Promise<void> {
        return this.operationStep(operationId, 'payment');
    }

    completeOperation(operationId: string): Promise<void> {
        return this.operationStep(operationId, 'complete');
    }

    // ── Contratos ────────────────────────────────────────

    signContract(contractId: string): Promise<void> {
        return this.request('POST', `/contracts/${encodeURIComponent(contractId)}/sign`);
    }

    // ── Interno ──────────────────────────────────────────

    private operationStep(id: string, paso: string, body?: unknown): Promise<void> {
        return this.request('POST', `/operations/${encodeURIComponent(id)}/${paso}`, { body });
    }

    private async request<T>(
        method: string,
        path: string,
        options: { body?: unknown; anonimo?: boolean } = {},
    ): Promise<T> {
        const headers: Record<string, string> = {};

        if (options.body !== undefined) {
            headers['content-type'] = 'application/json';
        }

        if (!options.anonimo && this.getToken) {
            const token = await this.getToken();
            if (token) {
                headers.authorization = `Bearer ${token}`;
            }
        }

        const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
            method,
            headers,
            body: options.body === undefined ? undefined : JSON.stringify(options.body),
        });

        if (!response.ok) {
            throw ApiError.fromResponse(response.status, await leerJson(response));
        }

        // 204 sin cuerpo: los pasos de la operación no devuelven nada.
        if (response.status === 204) {
            return undefined as T;
        }

        return (await leerJson(response)) as T;
    }
}

async function leerJson(response: Response): Promise<unknown> {
    const texto = await response.text();
    if (texto === '') return undefined;

    try {
        return JSON.parse(texto);
    } catch {
        // Una respuesta no-JSON (un proxy caído, un 502 en HTML) no debe
        // romper el cliente con un error de parseo indescifrable.
        return undefined;
    }
}
