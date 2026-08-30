import {
    PrismaUserRepository,
    PrismaListingRepository,
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
import { SubmitListingForReviewUseCase } from '@marketplace/domain/src/use-cases/listing/SubmitListingForReviewUseCase';
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
import { InitiateTransferUseCase } from '@marketplace/domain/src/use-cases/operation/InitiateTransferUseCase';
import { ConfirmCustodyUseCase } from '@marketplace/domain/src/use-cases/operation/ConfirmCustodyUseCase';
import { ConfirmPaymentUseCase } from '@marketplace/domain/src/use-cases/operation/ConfirmPaymentUseCase';
import { CompleteOperationUseCase } from '@marketplace/domain/src/use-cases/operation/CompleteOperationUseCase';

import { GetMyNotificationsUseCase } from '@marketplace/domain/src/use-cases/notification/GetMyNotificationsUseCase';
import { MarkNotificationReadUseCase } from '@marketplace/domain/src/use-cases/notification/MarkNotificationReadUseCase';
import { AvisosDeNegociacion } from '@marketplace/domain/src/services/AvisosDeNegociacion';
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
    verificarIdentidad: VerifyIdentityUseCase;
    createListing: CreateListingUseCase;
    submitListing: SubmitListingForReviewUseCase;
    approveListing: ApproveListingUseCase;
    rejectListing: RejectListingUseCase;
    listadoPublico: GetPublishedListingsUseCase;
    getListingDetails: GetListingDetailsUseCase;
    misListings: GetMyListingsUseCase;
    listingsParaRevisar: GetListingsForReviewUseCase;
    misOperaciones: GetMyOperationsUseCase;
    detalleOperacion: GetOperationDetailsUseCase;
    createOffer: CreateOfferUseCase;
    counterOffer: CounterOfferUseCase;
    acceptOffer: AcceptOfferUseCase;
    cancelOperation: CancelOperationUseCase;
    getSellerOffers: GetSellerOffersUseCase;
    signNda: SignNdaUseCase;
    signContract: SignContractUseCase;
    initiateTransfer: InitiateTransferUseCase;
    confirmCustody: ConfirmCustodyUseCase;
    confirmPayment: ConfirmPaymentUseCase;
    completeOperation: CompleteOperationUseCase;
}

export function createContainer(
    hasher: IPasswordHasher = new BcryptPasswordHasher(),
): Container {
    const userRepo = new PrismaUserRepository();
    const listingRepo = new PrismaListingRepository();
    const operationRepo = new PrismaOperationRepository();
    const contractRepo = new PrismaContractRepository();
    const notificationRepo = new PrismaNotificationRepository();

    // El repositorio también implementa INotifier: por ahora "avisar" es
    // guardar en la bandeja. Sumar email es componer otro adaptador acá.
    const avisos = new AvisosDeNegociacion(notificationRepo);

    return {
        listingRepo,

        registerUser: new RegisterUserUseCase(userRepo, hasher),
        login: new LoginUseCase(userRepo, hasher),
        perfil: new GetMyProfileUseCase(userRepo),
        misAvisos: new GetMyNotificationsUseCase(notificationRepo),
        marcarAvisoLeido: new MarkNotificationReadUseCase(notificationRepo),
        verificarIdentidad: new VerifyIdentityUseCase(userRepo),

        createListing: new CreateListingUseCase(listingRepo, userRepo),
        submitListing: new SubmitListingForReviewUseCase(listingRepo, userRepo),
        approveListing: new ApproveListingUseCase(listingRepo, avisos),
        rejectListing: new RejectListingUseCase(listingRepo, avisos),
        listadoPublico: new GetPublishedListingsUseCase(listingRepo),
        getListingDetails: new GetListingDetailsUseCase(listingRepo, contractRepo),
        misListings: new GetMyListingsUseCase(listingRepo),
        listingsParaRevisar: new GetListingsForReviewUseCase(listingRepo),
        misOperaciones: new GetMyOperationsUseCase(operationRepo),
        detalleOperacion: new GetOperationDetailsUseCase(operationRepo, contractRepo),

        createOffer: new CreateOfferUseCase(operationRepo, listingRepo, avisos),
        counterOffer: new CounterOfferUseCase(operationRepo, avisos),
        // Único use case que necesita atomicidad: la cascada multi-oferta.
        acceptOffer: new AcceptOfferUseCase(new PrismaUnitOfWork(), avisos),
        cancelOperation: new CancelOperationUseCase(operationRepo),
        getSellerOffers: new GetSellerOffersUseCase(operationRepo, listingRepo),

        signNda: new SignNdaUseCase(contractRepo, listingRepo, userRepo),
        signContract: new SignContractUseCase(contractRepo, operationRepo, userRepo, avisos),

        initiateTransfer: new InitiateTransferUseCase(operationRepo),
        confirmCustody: new ConfirmCustodyUseCase(operationRepo, avisos),
        confirmPayment: new ConfirmPaymentUseCase(operationRepo, avisos),
        completeOperation: new CompleteOperationUseCase(operationRepo, listingRepo, avisos),
    };
}
