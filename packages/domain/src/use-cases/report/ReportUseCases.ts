import {
    IContractRepository,
    IListingRepository,
    IOperationRepository,
    IReportRepository,
    IUserRepository,
} from '../../ports/Repositories';
import { Actor } from '../../ports/Actor';
import { INotifier } from '../../ports/INotifier';
import { Notification } from '../../entities/Notification';
import { Report, ReportReason } from '../../entities/Report';
import { UniqueEntityID } from '../../value-objects/UniqueEntityID';
import { ForbiddenError, InvalidStateError, NotFoundError } from '../../errors/DomainError';
import { UserRole } from '@marketplace/shared-types';

export interface FileReportInput {
    operationId: string;
    reason: ReportReason;
    detail: string;
}

/**
 * Abre una denuncia de una parte contra la otra.
 *
 * No se puede denunciar antes de que el contrato esté firmado, y la razón es
 * la misma que hace legal cancelar hasta ese punto: mientras nadie se
 * comprometió, el remedio ante cualquier sospecha es retirarse. Recién cuando
 * la cancelación deja de estar disponible el reclamo tiene sentido.
 */
export class FileReportUseCase {
    constructor(
        private readonly reportRepo: IReportRepository,
        private readonly operationRepo: IOperationRepository,
        private readonly notifier?: INotifier,
    ) {}

    async execute(input: FileReportInput, actor: Actor): Promise<Report> {
        const operation = await this.operationRepo.findById(input.operationId);
        if (!operation) {
            throw new NotFoundError('Operación no encontrada');
        }

        // Lanza ForbiddenError si el actor no es parte de la operación.
        const role = operation.partyFor(actor.id);

        const antesDelCompromiso = ['offer_sent', 'negotiating', 'contract_pending'];
        if (antesDelCompromiso.includes(operation.status)) {
            throw new InvalidStateError(
                'Todavía podés cancelar la operación sin costo: la denuncia existe para cuando cancelar ya no es una opción.',
            );
        }

        const { props } = operation.toSnapshot();
        const counterparty = role === 'buyer' ? props.sellerId : props.buyerId;

        const report = Report.create({
            operationId: operation.id,
            reportedBy: new UniqueEntityID(actor.id),
            reporterRole: role,
            reportedUserId: counterparty,
            reason: input.reason,
            detail: input.detail,
        });

        await this.reportRepo.save(report);

        // La contraparte se entera por la plataforma y no por una demanda.
        await this.notifyCounterparty(counterparty, operation.id);

        return report;
    }

    private async notifyCounterparty(userId: UniqueEntityID, operationId: UniqueEntityID): Promise<void> {
        if (!this.notifier) return;

        try {
            await this.notifier.notify([
                Notification.create({
                    userId,
                    type: 'denuncia_recibida',
                    operationId,
                }),
            ]);
        } catch {
            // Un aviso que no sale no puede impedir que la denuncia quede
            // asentada: la constancia es lo que importa.
        }
    }
}

export class CloseReportUseCase {
    constructor(private readonly reportRepo: IReportRepository) {}

    async execute(reportId: string, reason: string, actor: Actor): Promise<void> {
        const report = await this.reportRepo.findById(reportId);
        if (!report) {
            throw new NotFoundError('Denuncia no encontrada');
        }

        report.assertCanClose(actor.id);
        report.close(reason);

        await this.reportRepo.save(report);
    }
}

export class GetMyReportsUseCase {
    constructor(private readonly reportRepo: IReportRepository) {}

    async execute(actor: Actor): Promise<Report[]> {
        return this.reportRepo.findByUser(actor.id);
    }
}

// ═════════════════════════════════════════════════════════

export interface PartyIdentity {
    id: string;
    fullName: string;
    /** Ausente si el usuario nunca completó la verificación de identidad. */
    dni?: string;
    email: string;
    country?: string;
}

export interface SignatureEvidence {
    role: string;
    signedAt?: Date;
    ipAddress?: string;
    documentHash?: string;
}

export interface ContractEvidence {
    id: string;
    type: string;
    documentHash?: string;
    signatures: SignatureEvidence[];
}

export interface EvidenceDossier {
    reportId: string;
    filedAt: Date;
    reason: ReportReason;
    detail: string;
    reporter: PartyIdentity;
    reported: PartyIdentity;
    operation: {
        id: string;
        status: string;
        finalPriceCents?: number;
        currency: string;
        createdAt: Date;
        completedAt?: Date;
    };
    negotiations: Array<{ amount: number; currency: string; proposedBy: string; proposedAt: Date }>;
    /** Lo que el vendedor declaraba del activo, sin filtrar. */
    declaredAsset: { assetType: string; assetData: Record<string, unknown> };
    verifications: {
        ownership?: { verifiedAt: Date; assetId: string; source: string; monthlyRevenueCents?: number };
        platformAccess?: { verifiedAt: Date; accessSince: Date };
        custody?: { verifiedAt: Date; isPrimaryOwner: boolean; accessSecured: boolean; metrics: Record<string, number> };
    };
    contracts: ContractEvidence[];
}

/**
 * Arma el legajo de una denuncia.
 *
 * Es lo único que la plataforma entrega ante un fraude, y es todo lo que puede
 * entregar con honestidad: no dictamina quién tiene razón, reúne lo que
 * registró mientras la operación transcurría. Contratos firmados con su huella
 * y la IP de cada firma, las constancias de verificación con su fecha, el
 * historial completo de la negociación y lo que el vendedor declaró al
 * publicar.
 *
 * Sobre los datos personales de la contraparte: no son una revelación nueva.
 * Ambas partes firmaron un contrato tripartito que ya contiene el nombre, el
 * DNI y el domicilio de la otra. El legajo los reúne junto al resto de la
 * evidencia, que es el trabajo que hoy nadie hacía.
 *
 * Se genera en cada consulta en vez de guardarse, igual que el documento de
 * un contrato: así refleja siempre lo que la base tiene, sin una copia que
 * pueda quedar desactualizada.
 */
export class GetEvidenceDossierUseCase {
    constructor(
        private readonly reportRepo: IReportRepository,
        private readonly operationRepo: IOperationRepository,
        private readonly listingRepo: IListingRepository,
        private readonly contractRepo: IContractRepository,
        private readonly userRepo: IUserRepository,
    ) {}

    async execute(reportId: string, actor: Actor): Promise<EvidenceDossier> {
        const report = await this.reportRepo.findById(reportId);
        if (!report) {
            throw new NotFoundError('Denuncia no encontrada');
        }

        if (actor.role !== UserRole.ADMIN && !report.involves(actor.id)) {
            throw new ForbiddenError('Esta denuncia no es tuya.');
        }

        const operation = await this.operationRepo.findById(report.operationId.toString());
        if (!operation) {
            throw new NotFoundError('Operación no encontrada');
        }

        const listing = await this.listingRepo.findById(operation.listingId.toString());
        if (!listing) {
            throw new NotFoundError('Listing no encontrado');
        }

        const [reporter, reported] = await Promise.all([
            this.identidad(report.reportedBy.toString()),
            this.identidad(report.reportedUserId.toString()),
        ]);

        const contratos = await this.contractRepo.findByOperation(operation.id.toString());
        const ndas = await this.contractRepo.findAllByListing(listing.id.toString());

        const { props: opProps, createdAt } = operation.toSnapshot();

        return {
            reportId: report.id.toString(),
            filedAt: report.toSnapshot().createdAt,
            reason: report.reason,
            detail: report.detail,
            reporter,
            reported,
            operation: {
                id: operation.id.toString(),
                status: operation.status,
                finalPriceCents: operation.finalPrice?.getCents(),
                currency: operation.currentOfferPrice.getCurrency(),
                createdAt,
                completedAt: opProps.completedAt,
            },
            negotiations: operation.negotiations.map((n) => ({
                amount: n.amount,
                currency: n.currency,
                proposedBy: n.proposedBy,
                proposedAt: n.proposedAt,
            })),
            // Sin filtrar: ante un reclamo lo que importa es qué se declaró,
            // no qué veía un comprador que todavía no había firmado el NDA.
            declaredAsset: (({ assetType, assetData }) => ({ assetType, assetData }))(
                listing.assetDataFor(true),
            ),
            verifications: {
                ownership: listing.ownershipVerification && {
                    verifiedAt: listing.ownershipVerification.verifiedAt,
                    assetId: listing.ownershipVerification.assetId,
                    source: listing.ownershipVerification.source,
                    monthlyRevenueCents: listing.ownershipVerification.monthlyRevenueCents,
                },
                platformAccess: listing.platformAccess && {
                    verifiedAt: listing.platformAccess.verifiedAt,
                    accessSince: listing.platformAccess.accessSince,
                },
                custody: operation.custodyVerification && {
                    verifiedAt: operation.custodyVerification.verifiedAt,
                    isPrimaryOwner: operation.custodyVerification.isPrimaryOwner,
                    accessSecured: operation.custodyVerification.accessSecured,
                    metrics: operation.custodyVerification.metrics,
                },
            },
            contracts: [...contratos, ...ndas].map((c) => ({
                id: c.id.toString(),
                type: c.type,
                documentHash: c.documentHash,
                signatures: c.signatures.map((s) => ({
                    role: s.role,
                    signedAt: s.signedAt,
                    ipAddress: s.signatureIp,
                    documentHash: s.documentHash,
                })),
            })),
        };
    }

    private async identidad(userId: string): Promise<PartyIdentity> {
        const user = await this.userRepo.findById(userId);
        if (!user) {
            throw new NotFoundError('Usuario no encontrado');
        }

        const { props } = user.toSnapshot();
        return {
            id: userId,
            fullName: props.fullName,
            dni: props.dni,
            email: props.email.getValue(),
            country: props.country,
        };
    }
}
