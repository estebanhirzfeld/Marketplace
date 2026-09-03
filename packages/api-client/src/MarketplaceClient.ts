import {
    AuthTokenDto,
    ContractDto,
    ContractDocumentDto,
    AuthorizationUrlDto,
    ChannelMetricsReportDto,
    OwnershipVerificationDto,
    VerificationSourceDto,
    CloseReportRequest,
    CheckoutDto,
    ConfirmCustodyRequest,
    ConfirmPaymentRequest,
    EvidenceDossierDto,
    FileReportRequest,
    ReportDto,
    RegisterPlatformAccessRequest,
    CounterOfferRequest,
    CreateListingRequest,
    EstimateListingRequest,
    EstimatedPriceDto,
    PlatformDashboardDto,
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
    AssetTypeDescriptorDto,
    CompleteOperationRequest,
    DeclareRecipientIdentityRequest,
    CustodyAccountDto,
    CreateCustodyAccountRequest,
    UpdateCustodyAccountRequest,
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

    /**
     * Lo que sabe de sí mismo cada tipo de activo. Anónimo: describe la forma
     * de un canal y la de un sitio, no dice nada de ninguna publicación.
     */
    async assetTypes(): Promise<AssetTypeDescriptorDto[]> {
        return this.request('GET', '/asset-types', { anonimo: true });
    }

    verifyIdentity(body: VerifyIdentityRequest): Promise<MyProfileDto> {
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
        // Cada criterio se escribe explícitamente: un spread del objeto
        // recibido mandaría a la API cualquier clave que llegara del llamador.
        const query = new URLSearchParams();
        const texto = (clave: keyof ListingFiltersQuery) => {
            const v = filtros?.[clave];
            if (v !== undefined && v !== '') query.set(clave, String(v));
        };

        for (const clave of [
            'assetType',
            'niche',
            'onlyTransferable',
            'currency',
            'minPrice',
            'maxPrice',
            'minSubscribers',
            'onlyMonetized',
            'minDomainAuthority',
            'sort',
            'direction',
        ] as const) {
            texto(clave);
        }

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

    /** El tablero de la plataforma. Solo responde a un admin. */
    platformDashboard(): Promise<PlatformDashboardDto> {
        return this.request('GET', '/admin/dashboard');
    }

    /** Valuación de un activo que todavía no se creó. No persiste nada. */
    estimateListingPrice(body: EstimateListingRequest): Promise<EstimatedPriceDto> {
        return this.request('POST', '/listings/estimate', { body });
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

    /**
     * Dónde tiene que autorizar el vendedor para demostrar que controla el
     * activo. `youtube` prueba el control del canal; `adsense`, el del sitio
     * web y además su ingreso real.
     */
    authorizationUrl(listingId: string, source: VerificationSourceDto): Promise<AuthorizationUrlDto> {
        return this.request(
            'GET',
            `/listings/${encodeURIComponent(listingId)}/autorizacion/${source}`,
        );
    }

    /** Completa la verificación con el código que trajo el navegador. */
    verifyOwnership(
        listingId: string,
        source: VerificationSourceDto,
        code: string,
    ): Promise<OwnershipVerificationDto> {
        return this.request(
            'POST',
            `/listings/${encodeURIComponent(listingId)}/verificar/${source}`,
            { body: { code } },
        );
    }

    /**
     * Contrasta las métricas declaradas contra la API de YouTube. Solo el
     * vendedor del activo o un admin.
     */
    verifyChannelMetrics(listingId: string): Promise<ChannelMetricsReportDto> {
        return this.request('POST', `/listings/${encodeURIComponent(listingId)}/verificar-metricas`);
    }

    /**
     * Registra que la plataforma tiene acceso al activo. Solo admin.
     * `accessSince` es la fecha desde la que hay acceso, no la de hoy: de ella
     * depende cuándo se cumple el plazo de espera del activo.
     */
    registerPlatformAccess(listingId: string, body: RegisterPlatformAccessRequest): Promise<void> {
        return this.request('POST', `/admin/listings/${encodeURIComponent(listingId)}/acceso`, {
            body,
        });
    }

    /** Borra la constancia cuando la plataforma perdió el acceso. Solo admin. */
    revokePlatformAccess(listingId: string): Promise<void> {
        return this.request('DELETE', `/admin/listings/${encodeURIComponent(listingId)}/acceso`);
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

    confirmCustody(operationId: string, body: ConfirmCustodyRequest): Promise<void> {
        return this.operationStep(operationId, 'custody', body);
    }

    /** Pide el link de pago. Solo con el activo en custodia. */
    checkout(operationId: string): Promise<CheckoutDto> {
        return this.request('POST', `/operations/${encodeURIComponent(operationId)}/checkout`);
    }

    /** Registra una transferencia bancaria. Los pagos de MercadoPago los confirma el webhook. */
    confirmPayment(operationId: string, body: ConfirmPaymentRequest): Promise<void> {
        return this.operationStep(operationId, 'payment', body);
    }

    /** El comprador declara dónde quiere recibir el activo. */
    declareRecipientIdentity(operationId: string, body: DeclareRecipientIdentityRequest): Promise<void> {
        return this.request(
            'POST',
            `/operations/${encodeURIComponent(operationId)}/recipient-identity`,
            { body },
        );
    }

    /**
     * Cierra la operación registrando la constancia de entrega. Solo admin.
     * `deliveredToIdentifier` no viaja: lo copia el dominio de la identidad
     * declarada por el comprador.
     */
    completeOperation(operationId: string, body: CompleteOperationRequest): Promise<void> {
        return this.operationStep(operationId, 'complete', body);
    }

    // ── Cuentas de custodia (solo admin) ─────────────────

    listCustodyAccounts(): Promise<CustodyAccountDto[]> {
        return this.request('GET', '/admin/custody-accounts');
    }

    createCustodyAccount(body: CreateCustodyAccountRequest): Promise<CustodyAccountDto> {
        return this.request('POST', '/admin/custody-accounts', { body });
    }

    updateCustodyAccount(id: string, body: UpdateCustodyAccountRequest): Promise<CustodyAccountDto> {
        return this.request('PATCH', `/admin/custody-accounts/${encodeURIComponent(id)}`, { body });
    }

    deactivateCustodyAccount(id: string): Promise<void> {
        return this.request('POST', `/admin/custody-accounts/${encodeURIComponent(id)}/baja`);
    }

    activateCustodyAccount(id: string): Promise<void> {
        return this.request('POST', `/admin/custody-accounts/${encodeURIComponent(id)}/alta`);
    }

    // ── Denuncias ────────────────────────────────────────

    /** Las denuncias en las que el usuario es parte, denuncie o sea denunciado. */
    misDenuncias(): Promise<ReportDto[]> {
        return this.request('GET', '/me/reports');
    }

    denunciar(body: FileReportRequest): Promise<ReportDto> {
        return this.request('POST', '/reports', { body });
    }

    /** El legajo con todo lo que la plataforma registró de esa operación. */
    legajo(reportId: string): Promise<EvidenceDossierDto> {
        return this.request('GET', `/reports/${encodeURIComponent(reportId)}/legajo`);
    }

    cerrarDenuncia(reportId: string, body: CloseReportRequest): Promise<void> {
        return this.request('POST', `/reports/${encodeURIComponent(reportId)}/cerrar`, { body });
    }

    // ── Contratos ────────────────────────────────────────

    /** El texto del contrato, para leerlo antes de firmar. */
    documentoDelContrato(contractId: string): Promise<ContractDocumentDto> {
        return this.request('GET', `/contracts/${encodeURIComponent(contractId)}/documento`);
    }

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
