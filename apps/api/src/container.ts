import {
    PrismaUserRepository,
    PrismaListingRepository,
    PrismaReportRepository,
    PrismaOperationRepository,
    PrismaContractRepository,
    PrismaUnitOfWork,
    PrismaNotificationRepository,
    PrismaCustodyAccountRepository,
    PrismaSellerPaymentAccountRepository,
    PrismaSellerBankAccountRepository,
    PrismaYouTubeConnectionRepository,
    PrismaYouTubeChannelListingFinder,
    PrismaTransferStepProgressRepository,
} from '@marketplace/db';

import { RegisterUserUseCase } from '@marketplace/domain/src/use-cases/auth/RegisterUserUseCase';
import { LoginUseCase } from '@marketplace/domain/src/use-cases/auth/LoginUseCase';
import {
    DeclareSellerBankAccountUseCase,
    GetSellerBankAccountsUseCase,
} from '@marketplace/domain/src/use-cases/payment-account/SellerBankAccountUseCases';
import { VerifyIdentityUseCase } from '@marketplace/domain/src/use-cases/auth/VerifyIdentityUseCase';
import { GetMyProfileUseCase } from '@marketplace/domain/src/use-cases/auth/GetMyProfileUseCase';
import { CreateListingUseCase } from '@marketplace/domain/src/use-cases/listing/CreateListingUseCase';
import { EstimateListingPriceUseCase } from '@marketplace/domain/src/use-cases/listing/EstimateListingPriceUseCase';
import { GetPlatformDashboardUseCase } from '@marketplace/domain/src/use-cases/admin/GetPlatformDashboardUseCase';
import { PublishListingUseCase } from '@marketplace/domain/src/use-cases/listing/PublishListingUseCase';
import { RejectPlatformAccessRequestUseCase } from '@marketplace/domain/src/use-cases/listing/RejectPlatformAccessRequestUseCase';
import { RequestPlatformAccessUseCase } from '@marketplace/domain/src/use-cases/listing/RequestPlatformAccessUseCase';
import { EditListingUseCase } from '@marketplace/domain/src/use-cases/listing/EditListingUseCase';
import { DeleteDraftListingUseCase } from '@marketplace/domain/src/use-cases/listing/DeleteDraftListingUseCase';
import { SubmitListingForReviewUseCase } from '@marketplace/domain/src/use-cases/listing/SubmitListingForReviewUseCase';
import {
    RegisterPlatformAccessUseCase,
    RevokePlatformAccessUseCase,
} from '@marketplace/domain/src/use-cases/listing/RegisterPlatformAccessUseCase';
import {
    ListListingsAwaitingAccessUseCase,
    StartPlatformAccessVerificationUseCase,
    VerifyPlatformAccessUseCase,
} from '@marketplace/domain/src/use-cases/listing/VerifyPlatformAccessUseCases';
import { VerifyChannelMetricsUseCase } from '@marketplace/domain/src/use-cases/listing/VerifyChannelMetricsUseCase';
import { YouTubeApiChannelReader } from './adapters/YouTubeApiChannelReader';
import {
    GoogleOAuthClient,
    SCOPE_ADSENSE,
    SCOPE_YOUTUBE,
} from './adapters/GoogleOAuthClient';
import {
    AdSenseApiReader,
    YouTubeOAuthCustodyAccessReader,
    YouTubeOAuthOwnershipReader,
} from './adapters/GoogleOwnershipReaders';
import {
    VerifyChannelOwnershipUseCase,
    VerifyWebsiteRevenueUseCase,
    GetDomainOwnershipChallengeUseCase,
    VerifyDomainOwnershipUseCase,
} from '@marketplace/domain/src/use-cases/listing/VerifyOwnershipUseCases';
import { HmacOwnershipChallengeIssuer } from './adapters/HmacOwnershipChallengeIssuer';
import { NodeDnsResolver } from './adapters/NodeDnsResolver';
import { HostingerDomainRegistrar } from './adapters/HostingerDomainRegistrar';
import { IDomainRegistrar } from '@marketplace/domain/src/ports/IDomainRegistrar';
import { IDomainRegistryLookup } from '@marketplace/domain/src/ports/IDomainRegistryLookup';
import { RdapDomainRegistryLookup } from './adapters/RdapDomainRegistryLookup';
import { ApproveListingUseCase } from '@marketplace/domain/src/use-cases/listing/ApproveListingUseCase';
import { RejectListingUseCase } from '@marketplace/domain/src/use-cases/listing/RejectListingUseCase';
import { GetListingDetailsUseCase } from '@marketplace/domain/src/use-cases/listing/GetListingDetailsUseCase';
import { GetPublishedListingsUseCase } from '@marketplace/domain/src/use-cases/listing/GetPublishedListingsUseCase';
import { GetMyListingsUseCase } from '@marketplace/domain/src/use-cases/listing/GetMyListingsUseCase';
import { GetListingsForReviewUseCase } from '@marketplace/domain/src/use-cases/listing/GetListingsForReviewUseCase';
import { GetMyOperationsUseCase } from '@marketplace/domain/src/use-cases/operation/GetMyOperationsUseCase';
import { GetOperationDetailsUseCase } from '@marketplace/domain/src/use-cases/operation/GetOperationDetailsUseCase';
import { GetPaymentOptionsUseCase } from '@marketplace/domain/src/use-cases/operation/GetPaymentOptionsUseCase';
import { CreateOfferUseCase } from '@marketplace/domain/src/use-cases/negotiation/CreateOfferUseCase';
import { CounterOfferUseCase } from '@marketplace/domain/src/use-cases/negotiation/CounterOfferUseCase';
import { AcceptOfferUseCase } from '@marketplace/domain/src/use-cases/negotiation/AcceptOfferUseCase';
import { CancelOperationUseCase } from '@marketplace/domain/src/use-cases/negotiation/CancelOperationUseCase';
import { GetSellerOffersUseCase } from '@marketplace/domain/src/use-cases/negotiation/GetSellerOffersUseCase';
import { SignNdaUseCase } from '@marketplace/domain/src/use-cases/contract/SignNdaUseCase';
import { SignContractUseCase } from '@marketplace/domain/src/use-cases/contract/SignContractUseCase';
import { GetContractDocumentUseCase } from '@marketplace/domain/src/use-cases/contract/GetContractDocumentUseCase';
import { ContractDataBuilder } from '@marketplace/domain/src/contracts/ContractDataBuilder';
import { InitiateTransferUseCase } from '@marketplace/domain/src/use-cases/operation/InitiateTransferUseCase';
import {
    CloseReportUseCase,
    FileReportUseCase,
    GetEvidenceDossierUseCase,
    GetMyReportsUseCase,
} from '@marketplace/domain/src/use-cases/report/ReportUseCases';
import {
    ConfirmPaymentFromGatewayUseCase,
    CreateCheckoutUseCase,
} from '@marketplace/domain/src/use-cases/operation/PaymentUseCases';
import { MercadoPagoGateway } from './adapters/MercadoPagoGateway';
import { BcraExchangeRateProvider } from './adapters/BcraExchangeRateProvider';
import { ConfirmCustodyUseCase } from '@marketplace/domain/src/use-cases/operation/ConfirmCustodyUseCase';
import { CheckDomainCustodyUseCase } from '@marketplace/domain/src/use-cases/operation/CheckDomainCustodyUseCase';
import { RunTransferStepChecksUseCase } from '@marketplace/domain/src/use-cases/operation/RunTransferStepChecksUseCase';
import { AttestTransferStepUseCase } from '@marketplace/domain/src/use-cases/operation/AttestTransferStepUseCase';
import { RejectTransferUseCase } from '@marketplace/domain/src/use-cases/operation/RejectTransferUseCase';
import {
    CheckDomainDeliveryUseCase,
    StartDomainDeliveryUseCase,
} from '@marketplace/domain/src/use-cases/operation/DomainDeliveryUseCases';
import { ConfirmPaymentUseCase } from '@marketplace/domain/src/use-cases/operation/ConfirmPaymentUseCase';
import { CompleteOperationUseCase } from '@marketplace/domain/src/use-cases/operation/CompleteOperationUseCase';
import { DeclareRecipientIdentityUseCase } from '@marketplace/domain/src/use-cases/operation/DeclareRecipientIdentityUseCase';
import {
    CreateCustodyAccountUseCase,
    UpdateCustodyAccountUseCase,
    ActivateCustodyAccountUseCase,
    DeactivateCustodyAccountUseCase,
    ListCustodyAccountsUseCase,
} from '@marketplace/domain/src/use-cases/admin/CustodyAccountUseCases';

import { GetMyNotificationsUseCase } from '@marketplace/domain/src/use-cases/notification/GetMyNotificationsUseCase';
import { MarkNotificationReadUseCase } from '@marketplace/domain/src/use-cases/notification/MarkNotificationReadUseCase';
import { NegotiationNotifier } from '@marketplace/domain/src/services/NegotiationNotifier';
import { PlatformNotifier } from '@marketplace/domain/src/services/PlatformNotifier';
import { IPasswordHasher } from '@marketplace/domain/src/ports/IPasswordHasher';
import {
    IListingRepository,
    ISellerPaymentAccountRepository,
} from '@marketplace/domain/src/ports/Repositories';
import { BcryptPasswordHasher } from './adapters/BcryptPasswordHasher';
import { AesGcmSecretCipher } from './adapters/AesGcmSecretCipher';
import { MercadoPagoOAuthClient } from './adapters/MercadoPagoOAuthClient';
import { YouTubeConnectionOAuthClient } from './adapters/YouTubeConnectionOAuthClient';
import { YouTubeAnalyticsReader } from './adapters/YouTubeAnalyticsReader';
import { IYouTubeConnectionOAuthClient } from '@marketplace/domain/src/ports/IYouTubeConnectionOAuthClient';
import { ConnectYouTubeChannelUseCase } from '@marketplace/domain/src/use-cases/youtube-connection/ConnectYouTubeChannelUseCase';
import { ListYouTubeConnectionsUseCase } from '@marketplace/domain/src/use-cases/youtube-connection/ListYouTubeConnectionsUseCase';
import { CreateListingFromYouTubeConnectionUseCase } from '@marketplace/domain/src/use-cases/youtube-connection/CreateListingFromYouTubeConnectionUseCase';
import { IMercadoPagoOAuthClient } from '@marketplace/domain/src/ports/IMercadoPagoOAuthClient';
import { LinkSellerPaymentAccountUseCase } from '@marketplace/domain/src/use-cases/payment-account/LinkSellerPaymentAccountUseCase';
import { GetSellerPaymentAccountStatusUseCase } from '@marketplace/domain/src/use-cases/payment-account/GetSellerPaymentAccountStatusUseCase';
import { UnlinkSellerPaymentAccountUseCase } from '@marketplace/domain/src/use-cases/payment-account/UnlinkSellerPaymentAccountUseCase';
import { GetSellerAccessTokenUseCase } from '@marketplace/domain/src/use-cases/payment-account/GetSellerAccessTokenUseCase';

/**
 * Composition root.
 *
 * Único lugar del sistema donde se eligen implementaciones concretas: acá se
 * decide que los repositorios son Prisma y que el hasher es bcrypt. El dominio
 * nunca lo sabe. Construcción explícita, sin framework de inyección: con 18
 * use cases el grafo entra en un archivo y se lee de arriba a abajo.
 */
export interface Container {
    listingRepo: IListingRepository;
    /**
     * Ausente mientras no haya `MP_TOKEN_ENCRYPTION_KEY`: sin clave no hay
     * dónde guardar los tokens de los vendedores.
     */
    sellerPaymentAccounts?: ISellerPaymentAccountRepository;
    /**
     * La vinculación de la cuenta de Mercado Pago del vendedor. Ausentes
     * mientras falte el cliente de OAuth (`MP_OAUTH_*`) o la clave de cifrado:
     * las rutas de `/me/mercadopago` responden 503 en vez de que la API no
     * arranque.
     */
    mercadoPagoOAuth?: IMercadoPagoOAuthClient;
    linkSellerPaymentAccount?: LinkSellerPaymentAccountUseCase;
    getSellerPaymentAccountStatus?: GetSellerPaymentAccountStatusUseCase;
    unlinkSellerPaymentAccount?: UnlinkSellerPaymentAccountUseCase;
    declareSellerBankAccount: DeclareSellerBankAccountUseCase;
    getSellerBankAccounts: GetSellerBankAccountsUseCase;
    /** Lo usa el cobro con split (`MERCADOPAGO_SPLIT_ENABLED`) para operar con el token del vendedor. */
    getSellerAccessToken?: GetSellerAccessTokenUseCase;
    /**
     * La conexión del vendedor con su canal de YouTube. Ausentes mientras falte
     * el cliente de OAuth (`YOUTUBE_OAUTH_*`) o la clave de cifrado del token:
     * las rutas de `/me/youtube` responden 503 en vez de que la API no arranque.
     */
    youtubeConnectionOAuth?: IYouTubeConnectionOAuthClient;
    connectYouTubeChannel?: ConnectYouTubeChannelUseCase;
    listYouTubeConnections?: ListYouTubeConnectionsUseCase;
    createListingFromYouTubeConnection?: CreateListingFromYouTubeConnectionUseCase;
    registerUser: RegisterUserUseCase;
    login: LoginUseCase;
    perfil: GetMyProfileUseCase;
    misAvisos: GetMyNotificationsUseCase;
    marcarAvisoLeido: MarkNotificationReadUseCase;
    verifyIdentity: VerifyIdentityUseCase;
    createListing: CreateListingUseCase;
    estimateListingPrice: EstimateListingPriceUseCase;
    submitListing: SubmitListingForReviewUseCase;
    publishListing: PublishListingUseCase;
    requestPlatformAccess: RequestPlatformAccessUseCase;
    editListing: EditListingUseCase;
    deleteDraftListing: DeleteDraftListingUseCase;
    approveListing: ApproveListingUseCase;
    rejectListing: RejectListingUseCase;
    /**
     * Ausente mientras no haya `YOUTUBE_API_KEY`. La verificación de métricas
     * es opcional: sin clave la API arranca igual y la ruta lo informa, en vez
     * de que el servidor no levante por una integración que todavía no está
     * configurada.
     */
    verifyChannelMetrics?: VerifyChannelMetricsUseCase;
    /**
     * Las tres piezas del consentimiento de Google. Ausentes mientras no haya
     * cliente de OAuth configurado: la API arranca igual y las rutas lo
     * informan, en vez de que el servidor no levante por una integración que
     * todavía no está dada de alta.
     */
    googleOAuth?: GoogleOAuthClient;
    verifyChannelOwnership?: VerifyChannelOwnershipUseCase;
    /** Verificación del acceso de la plataforma con OAuth de la cuenta de custodia. */
    listAwaitingAccess: ListListingsAwaitingAccessUseCase;
    startPlatformAccessVerification?: StartPlatformAccessVerificationUseCase;
    verifyPlatformAccess?: VerifyPlatformAccessUseCase;
    verifyWebsiteRevenue?: VerifyWebsiteRevenueUseCase;
    /**
     * Titularidad de un sitio por registro TXT. Ausentes mientras no haya
     * `DNS_CHALLENGE_SECRET`: sin el secreto no hay forma de derivar el valor.
     */
    getDomainOwnershipChallenge?: GetDomainOwnershipChallengeUseCase;
    verifyDomainOwnership?: VerifyDomainOwnershipUseCase;
    /**
     * Cuenta de Hostinger de la plataforma, donde los dominios entran en
     * custodia. Ausente mientras falte `HOSTINGER_API_TOKEN`.
     */
    domainRegistrar?: IDomainRegistrar;
    /** Registro público de dominios (RDAP): lo consulta la firma de un sitio. */
    domainRegistryLookup: IDomainRegistryLookup;
    registerPlatformAccess: RegisterPlatformAccessUseCase;
    revokePlatformAccess: RevokePlatformAccessUseCase;
    rejectPlatformAccessRequest: RejectPlatformAccessRequestUseCase;
    listadoPublico: GetPublishedListingsUseCase;
    getListingDetails: GetListingDetailsUseCase;
    misListings: GetMyListingsUseCase;
    listingsParaRevisar: GetListingsForReviewUseCase;
    tableroDePlataforma: GetPlatformDashboardUseCase;
    misOperaciones: GetMyOperationsUseCase;
    detalleOperacion: GetOperationDetailsUseCase;
    /** Siempre disponible: informa qué opciones de pago hay, incluso si ninguna. */
    paymentOptions: GetPaymentOptionsUseCase;
    createOffer: CreateOfferUseCase;
    counterOffer: CounterOfferUseCase;
    acceptOffer: AcceptOfferUseCase;
    cancelOperation: CancelOperationUseCase;
    getSellerOffers: GetSellerOffersUseCase;
    signNda: SignNdaUseCase;
    signContract: SignContractUseCase;
    documentoDelContrato: GetContractDocumentUseCase;
    initiateTransfer: InitiateTransferUseCase;
    confirmCustody: ConfirmCustodyUseCase;
    /** Ausente sin registrador: ver `domainRegistrar`. */
    checkDomainCustody?: CheckDomainCustodyUseCase;
    /**
     * La pasada periódica del traspaso de sitios (`src/jobs/run-transfer-checks.ts`).
     * Siempre presente: sin registrador no comprueba dominios, pero vigila los plazos.
     */
    runTransferStepChecks: RunTransferStepChecksUseCase;
    attestTransferStep: AttestTransferStepUseCase;
    rejectTransfer: RejectTransferUseCase;
    /** Ausentes sin registrador: ver `domainRegistrar`. */
    startDomainDelivery?: StartDomainDeliveryUseCase;
    checkDomainDelivery?: CheckDomainDeliveryUseCase;
    /**
     * Ausentes mientras no haya credenciales de MercadoPago. La API arranca
     * igual y las rutas lo informan: los pagos por transferencia siguen
     * funcionando sin la pasarela.
     */
    crearCheckout?: CreateCheckoutUseCase;
    confirmarPagoDePasarela?: ConfirmPaymentFromGatewayUseCase;
    mercadoPagoWebhookSecret?: string;
    denunciar: FileReportUseCase;
    misDenuncias: GetMyReportsUseCase;
    cerrarDenuncia: CloseReportUseCase;
    legajo: GetEvidenceDossierUseCase;
    confirmPayment: ConfirmPaymentUseCase;
    completeOperation: CompleteOperationUseCase;
    declareRecipientIdentity: DeclareRecipientIdentityUseCase;
    crearCuentaCustodia: CreateCustodyAccountUseCase;
    editarCuentaCustodia: UpdateCustodyAccountUseCase;
    activarCuentaCustodia: ActivateCustodyAccountUseCase;
    darDeBajaCuentaCustodia: DeactivateCustodyAccountUseCase;
    listarCuentasCustodia: ListCustodyAccountsUseCase;
}

export function createContainer(
    hasher: IPasswordHasher = new BcryptPasswordHasher(),
    /** Solo para tests: un registrador fake en lugar del que arma el entorno. */
    domainRegistrarOverride?: IDomainRegistrar,
): Container {
    const youtubeApiKey = process.env.YOUTUBE_API_KEY?.trim();

    const mpToken = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
    const mercadoPago = mpToken
        ? new MercadoPagoGateway({
              accessToken: mpToken,
              backUrl: process.env.MERCADOPAGO_BACK_URL?.trim() ?? 'http://localhost:3000/operaciones',
              notificationUrl:
                  process.env.MERCADOPAGO_NOTIFICATION_URL?.trim() ??
                  'http://localhost:3001/webhooks/mercadopago',
          })
        : undefined;

    // La pesificación de operaciones en USD es opcional: apagada por defecto, el
    // comportamiento es el de siempre. Solo el texto exacto `1` o `true` la
    // enciende.
    const exchangeRateFlag = process.env.EXCHANGE_RATE_ENABLED?.trim();
    const overrideRaw = process.env.EXCHANGE_RATE_OVERRIDE_USD_ARS?.trim();
    // Una tasa manual mal escrita (por ejemplo `1.500,5`) se ignoraba en
    // silencio y el operador creía estar usándola: se avisa al arrancar.
    if (overrideRaw) {
        const override = Number(overrideRaw);
        if (!Number.isFinite(override) || override <= 0) {
            console.warn(
                `[config] EXCHANGE_RATE_OVERRIDE_USD_ARS="${overrideRaw}" no es un número positivo: ` +
                    'se ignora la tasa manual. Usá un número con punto decimal, por ejemplo 1500.5.',
            );
        }
    }
    const exchangeRates =
        exchangeRateFlag === '1' || exchangeRateFlag === 'true'
            ? new BcraExchangeRateProvider({
                  override: overrideRaw ? Number(overrideRaw) : undefined,
              })
            : undefined;

    // Cuenta de Mercado Pago del vendedor. La clave cifra los tokens en
    // reposo; sin ella no se arma el repositorio. Exigir la vinculación para
    // publicar está apagado por defecto (solo `1` o `true` lo enciende): sin la
    // pantalla de vinculación, encenderlo dejaría a los vendedores sin poder
    // publicar.
    const tokenKey = process.env.MP_TOKEN_ENCRYPTION_KEY?.trim();
    const requireMpLinkFlag = process.env.REQUIRE_MP_LINK_TO_PUBLISH?.trim();
    const requireMpLink = requireMpLinkFlag === '1' || requireMpLinkFlag === 'true';
    if (requireMpLink && !tokenKey) {
        throw new Error(
            'REQUIRE_MP_LINK_TO_PUBLISH está encendida pero falta MP_TOKEN_ENCRYPTION_KEY: ' +
                'sin la clave no se pueden guardar las cuentas de Mercado Pago. ' +
                'Generala con: openssl rand -base64 32',
        );
    }
    const secretCipher = tokenKey ? new AesGcmSecretCipher(tokenKey) : undefined;
    const paymentAccountRepo = secretCipher
        ? new PrismaSellerPaymentAccountRepository(secretCipher)
        : undefined;

    // OAuth de Mercado Pago: hace falta el cliente completo Y dónde guardar los
    // tokens. Si falta algo, las rutas de vinculación responden 503.
    const mpOAuthConfig = {
        clientId: process.env.MP_OAUTH_CLIENT_ID?.trim() ?? '',
        clientSecret: process.env.MP_OAUTH_CLIENT_SECRET?.trim() ?? '',
        redirectUri: process.env.MP_OAUTH_REDIRECT_URI?.trim() ?? '',
    };
    const mercadoPagoOAuth =
        mpOAuthConfig.clientId && mpOAuthConfig.clientSecret && mpOAuthConfig.redirectUri
            ? new MercadoPagoOAuthClient(mpOAuthConfig)
            : undefined;
    const paymentAccountWiring =
        mercadoPagoOAuth && paymentAccountRepo
            ? { oauth: mercadoPagoOAuth, accounts: paymentAccountRepo }
            : undefined;

    // Cobro con split: el vendedor cobra directo con su propia cuenta y la
    // plataforma retiene su comisión. Apagado por defecto (solo `1` o `true` lo
    // enciende): cambia a nombre de quién se cobra. Necesita el OAuth del
    // vendedor y la clave de cifrado; sin ellos no hay token con el que cobrar,
    // así que se frena el arranque en vez de cobrar a medias.
    const splitFlag = process.env.MERCADOPAGO_SPLIT_ENABLED?.trim();
    const splitEnabled = splitFlag === '1' || splitFlag === 'true';
    if (splitEnabled && !paymentAccountWiring) {
        const faltan = [
            ...(tokenKey ? [] : ['MP_TOKEN_ENCRYPTION_KEY']),
            ...(mpOAuthConfig.clientId ? [] : ['MP_OAUTH_CLIENT_ID']),
            ...(mpOAuthConfig.clientSecret ? [] : ['MP_OAUTH_CLIENT_SECRET']),
            ...(mpOAuthConfig.redirectUri ? [] : ['MP_OAUTH_REDIRECT_URI']),
        ];
        throw new Error(
            'MERCADOPAGO_SPLIT_ENABLED está encendida pero falta configurar: ' +
                `${faltan.join(', ')}. ` +
                'El cobro con split necesita la vinculación de Mercado Pago de los vendedores ' +
                'y la clave que cifra sus tokens.',
        );
    }
    // Una sola instancia: el candado del refresco vive en ella y la comparten
    // el cobro, el aviso de pago y quien la expone por el contenedor.
    const getSellerAccessToken = paymentAccountWiring
        ? new GetSellerAccessTokenUseCase(paymentAccountWiring.accounts, paymentAccountWiring.oauth)
        : undefined;
    const splitSellerTokens = splitEnabled ? getSellerAccessToken : undefined;
    const splitAccounts = splitEnabled ? paymentAccountWiring?.accounts : undefined;

    const oauthConfig = {
        clientId: process.env.YOUTUBE_OAUTH_CLIENT_ID?.trim() ?? '',
        clientSecret: process.env.YOUTUBE_OAUTH_CLIENT_SECRET?.trim() ?? '',
        redirectUri: process.env.YOUTUBE_OAUTH_REDIRECT_URI?.trim() ?? '',
    };
    const googleOAuth =
        oauthConfig.clientId && oauthConfig.clientSecret && oauthConfig.redirectUri
            ? new GoogleOAuthClient(oauthConfig)
            : undefined;

    const userRepo = new PrismaUserRepository();
    const listingRepo = new PrismaListingRepository();

    const dnsChallengeSecret = process.env.DNS_CHALLENGE_SECRET?.trim();
    const dnsOwnership = dnsChallengeSecret
        ? {
              issuer: new HmacOwnershipChallengeIssuer(dnsChallengeSecret),
              resolver: new NodeDnsResolver(),
          }
        : undefined;
    const hostingerToken = process.env.HOSTINGER_API_TOKEN?.trim();
    // El perfil WHOIS no se configura: el adaptador lo busca por la terminación
    // de cada dominio al aceptar un traslado.
    const domainRegistrar =
        domainRegistrarOverride ??
        (hostingerToken ? new HostingerDomainRegistrar({ token: hostingerToken }) : undefined);
    // El registro público no pide credenciales: está siempre.
    const domainRegistryLookup = new RdapDomainRegistryLookup();
    const reportRepo = new PrismaReportRepository();
    // La conexión de canales necesita el OAuth completo Y la clave que cifra
    // el token de actualización (la misma de Mercado Pago). El adaptador de
    // Analytics no guarda nada: solo lee con el token de acceso que recibe.
    const youtubeConnectionWiring =
        googleOAuth && secretCipher
            ? {
                  oauth: new YouTubeConnectionOAuthClient(oauthConfig),
                  reader: new YouTubeAnalyticsReader(),
                  connections: new PrismaYouTubeConnectionRepository(),
                  cipher: secretCipher,
              }
            : undefined;
    const operationRepo = new PrismaOperationRepository();
    const contractRepo = new PrismaContractRepository();
    const notificationRepo = new PrismaNotificationRepository();
    const custodyRepo = new PrismaCustodyAccountRepository();

    // El repositorio también implementa INotifier: por ahora "avisar" es
    // guardar en la bandeja. Sumar email es componer otro adaptador acá.
    const avisos = new NegotiationNotifier(notificationRepo);
    const registerPlatformAccess = new RegisterPlatformAccessUseCase(listingRepo, custodyRepo, avisos);
    // Los avisos dirigidos a la plataforma van aparte porque el destinatario
    // no sale de la operación: hay que buscar quiénes son los administradores.
    const avisosDePlataforma = new PlatformNotifier(notificationRepo, userRepo);

    // Una sola definición de qué entra en el documento de un contrato: si el
    // armado divergiera entre firmar y leer, los hashes no coincidirían.
    const armador = new ContractDataBuilder(userRepo, listingRepo, operationRepo);

    // La misma comprobación la usan la ruta del admin y el job periódico.
    const transferStepProgressRepo = new PrismaTransferStepProgressRepository();
    const checkDomainCustody = domainRegistrar
        ? new CheckDomainCustodyUseCase(
              operationRepo,
              listingRepo,
              transferStepProgressRepo,
              domainRegistrar,
              undefined,
              avisosDePlataforma,
              custodyRepo,
              avisos,
          )
        : undefined;
    // La entrega al comprador: la inicia el admin, la comprueban la ruta, el
    // job y el cierre de la operación.
    const checkDomainDelivery = domainRegistrar
        ? new CheckDomainDeliveryUseCase(operationRepo, listingRepo, transferStepProgressRepo, domainRegistrar)
        : undefined;
    // Los medios de pago los usa su ruta y el detalle de la operación, que los
    // necesita para saber a quién le toca con el activo en custodia.
    const paymentOptions = new GetPaymentOptionsUseCase(operationRepo, {
        mercadoPagoEnabled: Boolean(mercadoPago),
        splitEnabled,
        paymentAccounts: paymentAccountRepo,
        rates: exchangeRates,
        transferInstructions: {
            ARS: process.env.TRANSFER_INSTRUCTIONS_ARS?.trim() || undefined,
            USD: process.env.TRANSFER_INSTRUCTIONS_USD?.trim() || undefined,
        },
    });

    const bankAccountRepo = new PrismaSellerBankAccountRepository();

    return {
        listingRepo,
        declareSellerBankAccount: new DeclareSellerBankAccountUseCase(bankAccountRepo),
        getSellerBankAccounts: new GetSellerBankAccountsUseCase(bankAccountRepo),
        sellerPaymentAccounts: paymentAccountRepo,
        mercadoPagoOAuth: paymentAccountWiring?.oauth,
        linkSellerPaymentAccount: paymentAccountWiring
            ? new LinkSellerPaymentAccountUseCase(paymentAccountWiring.accounts, paymentAccountWiring.oauth)
            : undefined,
        getSellerPaymentAccountStatus: paymentAccountWiring
            ? new GetSellerPaymentAccountStatusUseCase(paymentAccountWiring.accounts)
            : undefined,
        unlinkSellerPaymentAccount: paymentAccountWiring
            ? new UnlinkSellerPaymentAccountUseCase(paymentAccountWiring.accounts)
            : undefined,
        getSellerAccessToken,

        youtubeConnectionOAuth: youtubeConnectionWiring?.oauth,
        connectYouTubeChannel: youtubeConnectionWiring
            ? new ConnectYouTubeChannelUseCase(
                  youtubeConnectionWiring.connections,
                  youtubeConnectionWiring.oauth,
                  youtubeConnectionWiring.reader,
                  youtubeConnectionWiring.cipher,
              )
            : undefined,
        listYouTubeConnections: youtubeConnectionWiring
            ? new ListYouTubeConnectionsUseCase(youtubeConnectionWiring.connections)
            : undefined,
        createListingFromYouTubeConnection: youtubeConnectionWiring
            ? new CreateListingFromYouTubeConnectionUseCase(
                  youtubeConnectionWiring.connections,
                  listingRepo,
                  new PrismaYouTubeChannelListingFinder(),
              )
            : undefined,

        registerUser: new RegisterUserUseCase(userRepo, hasher),
        login: new LoginUseCase(userRepo, hasher),
        perfil: new GetMyProfileUseCase(userRepo),
        misAvisos: new GetMyNotificationsUseCase(notificationRepo),
        marcarAvisoLeido: new MarkNotificationReadUseCase(notificationRepo),
        verifyIdentity: new VerifyIdentityUseCase(userRepo),

        createListing: new CreateListingUseCase(listingRepo, userRepo),
        estimateListingPrice: new EstimateListingPriceUseCase(),
        submitListing: new SubmitListingForReviewUseCase(
            listingRepo,
            userRepo,
            avisosDePlataforma,
            requireMpLink ? paymentAccountRepo : undefined,
        ),
        publishListing: new PublishListingUseCase(
            listingRepo,
            userRepo,
            requireMpLink ? paymentAccountRepo : undefined,
        ),
        editListing: new EditListingUseCase(listingRepo),
        requestPlatformAccess: new RequestPlatformAccessUseCase(listingRepo, avisosDePlataforma),
        deleteDraftListing: new DeleteDraftListingUseCase(listingRepo),
        approveListing: new ApproveListingUseCase(listingRepo, avisos),
        rejectListing: new RejectListingUseCase(listingRepo, avisos),
        verifyChannelMetrics: youtubeApiKey
            ? new VerifyChannelMetricsUseCase(listingRepo, new YouTubeApiChannelReader(youtubeApiKey))
            : undefined,
        googleOAuth,
        // La verificación de titularidad necesita las dos cosas: el
        // consentimiento para preguntar qué controla el vendedor, y la clave
        // para resolver el canal publicado a su identificador.
        verifyChannelOwnership:
            googleOAuth && youtubeApiKey
                ? new VerifyChannelOwnershipUseCase(
                      listingRepo,
                      new YouTubeOAuthOwnershipReader(googleOAuth),
                      new YouTubeApiChannelReader(youtubeApiKey),
                  )
                : undefined,
        verifyWebsiteRevenue: googleOAuth
            ? new VerifyWebsiteRevenueUseCase(listingRepo, new AdSenseApiReader(googleOAuth))
            : undefined,
        getDomainOwnershipChallenge: dnsOwnership
            ? new GetDomainOwnershipChallengeUseCase(listingRepo, dnsOwnership.issuer, dnsOwnership.resolver)
            : undefined,
        verifyDomainOwnership: dnsOwnership
            ? new VerifyDomainOwnershipUseCase(listingRepo, dnsOwnership.issuer, dnsOwnership.resolver)
            : undefined,
        domainRegistrar,
        domainRegistryLookup,
        registerPlatformAccess,
        listAwaitingAccess: new ListListingsAwaitingAccessUseCase(listingRepo, userRepo),
        // Con las mismas credenciales de Google que la verificación de titularidad.
        startPlatformAccessVerification: googleOAuth
            ? new StartPlatformAccessVerificationUseCase(listingRepo, custodyRepo)
            : undefined,
        verifyPlatformAccess:
            googleOAuth && youtubeApiKey
                ? new VerifyPlatformAccessUseCase(
                      listingRepo,
                      custodyRepo,
                      new YouTubeOAuthCustodyAccessReader(googleOAuth),
                      new YouTubeApiChannelReader(youtubeApiKey),
                      registerPlatformAccess,
                  )
                : undefined,
        revokePlatformAccess: new RevokePlatformAccessUseCase(listingRepo),
        rejectPlatformAccessRequest: new RejectPlatformAccessRequestUseCase(listingRepo, avisos),
        listadoPublico: new GetPublishedListingsUseCase(listingRepo),
        getListingDetails: new GetListingDetailsUseCase(listingRepo, contractRepo, custodyRepo),
        misListings: new GetMyListingsUseCase(listingRepo, custodyRepo),
        listingsParaRevisar: new GetListingsForReviewUseCase(listingRepo),
        tableroDePlataforma: new GetPlatformDashboardUseCase(listingRepo, operationRepo, reportRepo, userRepo),
        misOperaciones: new GetMyOperationsUseCase(operationRepo, listingRepo, contractRepo),
        detalleOperacion: new GetOperationDetailsUseCase(
            operationRepo,
            contractRepo,
            userRepo,
            listingRepo,
            custodyRepo,
            transferStepProgressRepo,
            paymentOptions,
        ),
        paymentOptions,

        createOffer:new CreateOfferUseCase(operationRepo, listingRepo, avisos),
        counterOffer: new CounterOfferUseCase(operationRepo, avisos),
        // Único use case que necesita atomicidad: la cascada multi-oferta.
        acceptOffer: new AcceptOfferUseCase(new PrismaUnitOfWork(), avisos, avisosDePlataforma),
        cancelOperation: new CancelOperationUseCase(new PrismaUnitOfWork()),
        getSellerOffers: new GetSellerOffersUseCase(operationRepo, listingRepo, userRepo),

        signNda: new SignNdaUseCase(contractRepo, listingRepo, userRepo, armador),
        documentoDelContrato: new GetContractDocumentUseCase(contractRepo, operationRepo, armador),
        signContract: new SignContractUseCase(
            contractRepo,
            operationRepo,
            userRepo,
            listingRepo,
            armador,
            avisos,
            domainRegistryLookup,
        ),

        initiateTransfer: new InitiateTransferUseCase(operationRepo, listingRepo, avisosDePlataforma, custodyRepo),
        confirmCustody: new ConfirmCustodyUseCase(operationRepo, listingRepo, avisos, custodyRepo, domainRegistrar),
        checkDomainCustody,
        runTransferStepChecks: new RunTransferStepChecksUseCase(
            operationRepo,
            listingRepo,
            transferStepProgressRepo,
            // Los avisos de plazo van a la plataforma, salvo el recordatorio de
            // la entrega, que es del comprador.
            {
                transferStepReminder: (o, s) => avisosDePlataforma.transferStepReminder(o, s),
                transferStepExpired: (o, s) => avisosDePlataforma.transferStepExpired(o, s),
                deliveryExpired: (o, s) => avisosDePlataforma.deliveryExpired(o, s),
                deliveryReminder: (o, s) => avisos.deliveryReminder(o, s),
            },
            checkDomainCustody,
            checkDomainDelivery,
        ),
        attestTransferStep: new AttestTransferStepUseCase(operationRepo, listingRepo, transferStepProgressRepo),
        rejectTransfer: new RejectTransferUseCase(operationRepo, avisos),
        startDomainDelivery: domainRegistrar
            ? new StartDomainDeliveryUseCase(operationRepo, listingRepo, transferStepProgressRepo, domainRegistrar)
            : undefined,
        checkDomainDelivery,
        crearCheckout: mercadoPago
            ? new CreateCheckoutUseCase(
                  operationRepo,
                  userRepo,
                  mercadoPago,
                  exchangeRates,
                  undefined,
                  splitSellerTokens,
              )
            : undefined,
        confirmarPagoDePasarela: mercadoPago
            ? new ConfirmPaymentFromGatewayUseCase(
                  operationRepo,
                  mercadoPago,
                  avisos,
                  avisosDePlataforma,
                  splitSellerTokens,
                  splitAccounts,
              )
            : undefined,
        mercadoPagoWebhookSecret: process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim(),
        denunciar: new FileReportUseCase(reportRepo, operationRepo, notificationRepo),
        misDenuncias: new GetMyReportsUseCase(reportRepo),
        cerrarDenuncia: new CloseReportUseCase(reportRepo),
        legajo: new GetEvidenceDossierUseCase(
            reportRepo,
            operationRepo,
            listingRepo,
            contractRepo,
            userRepo,
        ),
        confirmPayment: new ConfirmPaymentUseCase(operationRepo, avisos, avisosDePlataforma),
        completeOperation: new CompleteOperationUseCase(operationRepo, listingRepo, avisos, checkDomainDelivery),
        declareRecipientIdentity: new DeclareRecipientIdentityUseCase(operationRepo, listingRepo),
        crearCuentaCustodia: new CreateCustodyAccountUseCase(custodyRepo),
        editarCuentaCustodia: new UpdateCustodyAccountUseCase(custodyRepo, listingRepo),
        activarCuentaCustodia: new ActivateCustodyAccountUseCase(custodyRepo),
        darDeBajaCuentaCustodia: new DeactivateCustodyAccountUseCase(custodyRepo, listingRepo),
        listarCuentasCustodia: new ListCustodyAccountsUseCase(custodyRepo, listingRepo),
    };
}
