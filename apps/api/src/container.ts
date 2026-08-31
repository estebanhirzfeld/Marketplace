import {
    PrismaUserRepository,
    PrismaListingRepository,
    PrismaReportRepository,
    PrismaOperationRepository,
    PrismaContractRepository,
    PrismaUnitOfWork,
    PrismaNotificationRepository,
} from '@marketplace/db';

import { RegisterUserUseCase } from '@marketplace/domain/src/use-cases/auth/RegisterUserUseCase';
import { LoginUseCase } from '@marketplace/domain/src/use-cases/auth/LoginUseCase';
import { VerifyIdentityUseCase } from '@marketplace/domain/src/use-cases/auth/VerifyIdentityUseCase';
import { GetMyProfileUseCase } from '@marketplace/domain/src/use-cases/auth/GetMyProfileUseCase';
import { CreateListingUseCase } from '@marketplace/domain/src/use-cases/listing/CreateListingUseCase';
import { EstimateListingPriceUseCase } from '@marketplace/domain/src/use-cases/listing/EstimateListingPriceUseCase';
import { GetPlatformDashboardUseCase } from '@marketplace/domain/src/use-cases/admin/GetPlatformDashboardUseCase';
import { SubmitListingForReviewUseCase } from '@marketplace/domain/src/use-cases/listing/SubmitListingForReviewUseCase';
import {
    RegisterPlatformAccessUseCase,
    RevokePlatformAccessUseCase,
} from '@marketplace/domain/src/use-cases/listing/RegisterPlatformAccessUseCase';
import { VerifyChannelMetricsUseCase } from '@marketplace/domain/src/use-cases/listing/VerifyChannelMetricsUseCase';
import { YouTubeApiChannelReader } from './adapters/YouTubeApiChannelReader';
import {
    GoogleOAuthClient,
    SCOPE_ADSENSE,
    SCOPE_YOUTUBE,
} from './adapters/GoogleOAuthClient';
import {
    AdSenseApiReader,
    YouTubeOAuthOwnershipReader,
} from './adapters/GoogleOwnershipReaders';
import {
    SimulatedAdSenseReader,
    SimulatedYouTubeChannelReader,
    SimulatedYouTubeOwnershipReader,
} from './adapters/SimulatedGoogleReaders';
import {
    VerifyChannelOwnershipUseCase,
    VerifyWebsiteRevenueUseCase,
} from '@marketplace/domain/src/use-cases/listing/VerifyOwnershipUseCases';
import { ApproveListingUseCase } from '@marketplace/domain/src/use-cases/listing/ApproveListingUseCase';
import { RejectListingUseCase } from '@marketplace/domain/src/use-cases/listing/RejectListingUseCase';
import { GetListingDetailsUseCase } from '@marketplace/domain/src/use-cases/listing/GetListingDetailsUseCase';
import { GetPublishedListingsUseCase } from '@marketplace/domain/src/use-cases/listing/GetPublishedListingsUseCase';
import { GetMyListingsUseCase } from '@marketplace/domain/src/use-cases/listing/GetMyListingsUseCase';
import { GetListingsForReviewUseCase } from '@marketplace/domain/src/use-cases/listing/GetListingsForReviewUseCase';
import { GetMyOperationsUseCase } from '@marketplace/domain/src/use-cases/operation/GetMyOperationsUseCase';
import { GetOperationDetailsUseCase } from '@marketplace/domain/src/use-cases/operation/GetOperationDetailsUseCase';
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
import { ConfirmCustodyUseCase } from '@marketplace/domain/src/use-cases/operation/ConfirmCustodyUseCase';
import { ConfirmPaymentUseCase } from '@marketplace/domain/src/use-cases/operation/ConfirmPaymentUseCase';
import { CompleteOperationUseCase } from '@marketplace/domain/src/use-cases/operation/CompleteOperationUseCase';

import { GetMyNotificationsUseCase } from '@marketplace/domain/src/use-cases/notification/GetMyNotificationsUseCase';
import { MarkNotificationReadUseCase } from '@marketplace/domain/src/use-cases/notification/MarkNotificationReadUseCase';
import { NegotiationNotifier } from '@marketplace/domain/src/services/NegotiationNotifier';
import { IPasswordHasher } from '@marketplace/domain/src/ports/IPasswordHasher';
import { IListingRepository } from '@marketplace/domain/src/ports/Repositories';
import { BcryptPasswordHasher } from './adapters/BcryptPasswordHasher';

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
    registerUser: RegisterUserUseCase;
    login: LoginUseCase;
    perfil: GetMyProfileUseCase;
    misAvisos: GetMyNotificationsUseCase;
    marcarAvisoLeido: MarkNotificationReadUseCase;
    verifyIdentity: VerifyIdentityUseCase;
    createListing: CreateListingUseCase;
    estimateListingPrice: EstimateListingPriceUseCase;
    submitListing: SubmitListingForReviewUseCase;
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
    /** Si las respuestas de Google están simuladas. La interfaz lo muestra. */
    simulacionDeGoogle: boolean;
    verifyChannelOwnership?: VerifyChannelOwnershipUseCase;
    verifyWebsiteRevenue?: VerifyWebsiteRevenueUseCase;
    registerPlatformAccess: RegisterPlatformAccessUseCase;
    revokePlatformAccess: RevokePlatformAccessUseCase;
    listadoPublico: GetPublishedListingsUseCase;
    getListingDetails: GetListingDetailsUseCase;
    misListings: GetMyListingsUseCase;
    listingsParaRevisar: GetListingsForReviewUseCase;
    tableroDePlataforma: GetPlatformDashboardUseCase;
    misOperaciones: GetMyOperationsUseCase;
    detalleOperacion: GetOperationDetailsUseCase;
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
}

export function createContainer(
    hasher: IPasswordHasher = new BcryptPasswordHasher(),
): Container {
    const youtubeApiKey = process.env.YOUTUBE_API_KEY?.trim();

    /*
     * Verificaciones simuladas, para recorrer el flujo sin credenciales de
     * Google. Se enciende de forma explícita y con nada más: no alcanza con
     * que falte una clave. Una constancia de titularidad falsa que llegara a
     * producción por una variable olvidada sería peor que no tener
     * verificación — es una atestiguación que miente y la firma la plataforma.
     */
    const simularGoogle = process.env.SIMULATE_GOOGLE_VERIFICATION?.trim() === 'true';
    if (simularGoogle) {
        console.warn(
            '\n  ⚠️  VERIFICACIONES DE GOOGLE SIMULADAS\n' +
            '      Las constancias de titularidad e ingreso no comprueban nada:\n' +
            '      confirman lo que el vendedor declaró. Solo para desarrollo.\n',
        );
    }

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
    const reportRepo = new PrismaReportRepository();
    const operationRepo = new PrismaOperationRepository();
    const contractRepo = new PrismaContractRepository();
    const notificationRepo = new PrismaNotificationRepository();

    // El repositorio también implementa INotifier: por ahora "avisar" es
    // guardar en la bandeja. Sumar email es componer otro adaptador acá.
    const avisos = new NegotiationNotifier(notificationRepo);

    // Una sola definición de qué entra en el documento de un contrato: si el
    // armado divergiera entre firmar y leer, los hashes no coincidirían.
    const armador = new ContractDataBuilder(userRepo, listingRepo, operationRepo);

    return {
        listingRepo,

        registerUser: new RegisterUserUseCase(userRepo, hasher),
        login: new LoginUseCase(userRepo, hasher),
        perfil: new GetMyProfileUseCase(userRepo),
        misAvisos: new GetMyNotificationsUseCase(notificationRepo),
        marcarAvisoLeido: new MarkNotificationReadUseCase(notificationRepo),
        verifyIdentity: new VerifyIdentityUseCase(userRepo),

        createListing: new CreateListingUseCase(listingRepo, userRepo),
        estimateListingPrice: new EstimateListingPriceUseCase(),
        submitListing: new SubmitListingForReviewUseCase(listingRepo, userRepo),
        approveListing: new ApproveListingUseCase(listingRepo, avisos),
        rejectListing: new RejectListingUseCase(listingRepo, avisos),
        simulacionDeGoogle: simularGoogle,
        verifyChannelMetrics: simularGoogle
            ? new VerifyChannelMetricsUseCase(listingRepo, new SimulatedYouTubeChannelReader())
            : youtubeApiKey
              ? new VerifyChannelMetricsUseCase(listingRepo, new YouTubeApiChannelReader(youtubeApiKey))
              : undefined,
        googleOAuth,
        // La verificación de titularidad necesita las dos cosas: el
        // consentimiento para preguntar qué controla el vendedor, y la clave
        // para resolver el canal publicado a su identificador.
        verifyChannelOwnership: simularGoogle
            ? new VerifyChannelOwnershipUseCase(
                  listingRepo,
                  new SimulatedYouTubeOwnershipReader(listingRepo),
                  new SimulatedYouTubeChannelReader(),
              )
            : googleOAuth && youtubeApiKey
              ? new VerifyChannelOwnershipUseCase(
                    listingRepo,
                    new YouTubeOAuthOwnershipReader(googleOAuth),
                    new YouTubeApiChannelReader(youtubeApiKey),
                )
              : undefined,
        verifyWebsiteRevenue: simularGoogle
            ? new VerifyWebsiteRevenueUseCase(listingRepo, new SimulatedAdSenseReader(listingRepo))
            : googleOAuth
              ? new VerifyWebsiteRevenueUseCase(listingRepo, new AdSenseApiReader(googleOAuth))
              : undefined,
        registerPlatformAccess: new RegisterPlatformAccessUseCase(listingRepo),
        revokePlatformAccess: new RevokePlatformAccessUseCase(listingRepo),
        listadoPublico: new GetPublishedListingsUseCase(listingRepo),
        getListingDetails: new GetListingDetailsUseCase(listingRepo, contractRepo),
        misListings: new GetMyListingsUseCase(listingRepo),
        listingsParaRevisar: new GetListingsForReviewUseCase(listingRepo),
        tableroDePlataforma: new GetPlatformDashboardUseCase(listingRepo, operationRepo, reportRepo),
        misOperaciones: new GetMyOperationsUseCase(operationRepo, listingRepo),
        detalleOperacion: new GetOperationDetailsUseCase(operationRepo, contractRepo, userRepo, listingRepo),

        createOffer: new CreateOfferUseCase(operationRepo, listingRepo, avisos),
        counterOffer: new CounterOfferUseCase(operationRepo, avisos),
        // Único use case que necesita atomicidad: la cascada multi-oferta.
        acceptOffer: new AcceptOfferUseCase(new PrismaUnitOfWork(), avisos),
        cancelOperation: new CancelOperationUseCase(operationRepo),
        getSellerOffers: new GetSellerOffersUseCase(operationRepo, listingRepo, userRepo),

        signNda: new SignNdaUseCase(contractRepo, listingRepo, userRepo, armador),
        documentoDelContrato: new GetContractDocumentUseCase(contractRepo, operationRepo, armador),
        signContract: new SignContractUseCase(contractRepo, operationRepo, userRepo, listingRepo, armador, avisos),

        initiateTransfer: new InitiateTransferUseCase(operationRepo),
        confirmCustody: new ConfirmCustodyUseCase(operationRepo, avisos),
        crearCheckout: mercadoPago
            ? new CreateCheckoutUseCase(operationRepo, userRepo, mercadoPago)
            : undefined,
        confirmarPagoDePasarela: mercadoPago
            ? new ConfirmPaymentFromGatewayUseCase(operationRepo, mercadoPago, avisos)
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
        confirmPayment: new ConfirmPaymentUseCase(operationRepo, avisos),
        completeOperation: new CompleteOperationUseCase(operationRepo, listingRepo, avisos),
    };
}
