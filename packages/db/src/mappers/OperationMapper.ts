import { Prisma } from "../../generated/prisma/client";
import type { Operation as PrismaOperation } from "../../generated/prisma/client";
import {
    Operation,
    OperationProps,
    OperationStatus,
    Negotiation,
    NegotiatingParty,
    TransferInitiation,
    CustodyVerification,
    PaymentProvider,
    PaymentRecord,
    RecipientIdentity,
    DeliveryVerification,
    StoredMilestones,
    TransferRejection,
    PaymentReceipt,
    RECEIPT_REJECTION_CODES,
    ReceiptRejectionCode,
    ReceiptReview,
} from "@marketplace/domain/src/entities/Operation";
import { UniqueEntityID } from "@marketplace/domain/src/value-objects/UniqueEntityID";
import { Money } from "@marketplace/domain/src/value-objects/Money";
import {
    SettlementQuote,
    SettlementQuoteSnapshot,
} from "@marketplace/domain/src/value-objects/SettlementQuote";

const NEGOTIATING_PARTIES: readonly NegotiatingParty[] = ["buyer", "seller"];

function isNegotiatingParty(value: unknown): value is NegotiatingParty {
    return typeof value === "string" && (NEGOTIATING_PARTIES as readonly string[]).includes(value);
}

/**
 * Lee la columna Json `negotiations`. Los Date viajan como string ISO, así que
 * hay que revivirlos — y validar el turno, porque de él depende quién puede
 * responder la oferta.
 */
function parseNegotiations(raw: PrismaOperation["negotiations"]): Negotiation[] {
    if (!Array.isArray(raw)) {
        throw new Error("Columna `negotiations` corrupta: se esperaba un array.");
    }

    return raw.map((entry): Negotiation => {
        if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
            throw new Error("Negociación corrupta: se esperaba un objeto.");
        }

        const { amount, currency, proposedBy, proposedAt } = entry as Record<string, unknown>;

        if (typeof amount !== "number" || typeof currency !== "string") {
            throw new Error("Negociación corrupta: monto o moneda inválidos.");
        }
        if (!isNegotiatingParty(proposedBy)) {
            throw new Error(`Parte negociadora desconocida en la base: ${String(proposedBy)}`);
        }
        if (typeof proposedAt !== "string") {
            throw new Error("Negociación corrupta: falta la fecha de la propuesta.");
        }

        return { amount, currency, proposedBy, proposedAt: new Date(proposedAt) };
    });
}

/**
 * Lee la declaración de cesión del vendedor. Espejo de `parseCustodia`: el
 * Date viaja como string ISO y hay que revivirlo al leer. `undefined` no es
 * un dato corrupto acá — es la "declaración sin registrar" de una operación
 * que ya estaba en `transfer_in_progress` antes de este cambio.
 */
function parseCesion(raw: unknown): TransferInitiation | undefined {
    if (raw === null || raw === undefined) return undefined;
    if (typeof raw !== "object" || Array.isArray(raw)) {
        throw new Error("Columna `transferInitiation` corrupta: se esperaba un objeto.");
    }

    const c = raw as Record<string, unknown>;

    if (typeof c.declaredBy !== "string" || typeof c.declaredAt !== "string") {
        throw new Error("Declaración de cesión corrupta: falta quién declaró o cuándo.");
    }

    return {
        declaredBy: new UniqueEntityID(c.declaredBy),
        declaredAt: new Date(c.declaredAt),
        controlCeded: c.controlCeded === true,
        custodyAccountId:
            typeof c.custodyAccountId === "string" ? new UniqueEntityID(c.custodyAccountId) : undefined,
        notes: typeof c.notes === "string" ? c.notes : undefined,
        sellerSourceIdentity: typeof c.sellerSourceIdentity === "string" ? c.sellerSourceIdentity : undefined,
    };
}

/**
 * `Prisma.DbNull` y no `undefined`: rechazar la cesión borra la declaración, y
 * con `undefined` el update dejaba la vieja guardada.
 */
function serializeCesion(v?: TransferInitiation) {
    if (!v) return Prisma.DbNull;
    return {
        declaredBy: v.declaredBy.toString(),
        declaredAt: v.declaredAt.toISOString(),
        controlCeded: v.controlCeded,
        custodyAccountId: v.custodyAccountId ? v.custodyAccountId.toString() : null,
        notes: v.notes ?? null,
        sellerSourceIdentity: v.sellerSourceIdentity ?? null,
    };
}

/**
 * Lee la constancia de custodia. Como con las firmas, el Date viaja a la
 * columna Json como string ISO y hay que revivirlo al leer.
 */
function parseCustodia(raw: unknown): CustodyVerification | undefined {
    if (raw === null || raw === undefined) return undefined;
    if (typeof raw !== "object" || Array.isArray(raw)) {
        throw new Error("Columna `custodyCheck` corrupta: se esperaba un objeto.");
    }

    const c = raw as Record<string, unknown>;

    if (typeof c.verifiedBy !== "string" || typeof c.verifiedAt !== "string") {
        throw new Error("Constancia de custodia corrupta: falta quién verificó o cuándo.");
    }

    return {
        verifiedBy: new UniqueEntityID(c.verifiedBy),
        verifiedAt: new Date(c.verifiedAt),
        isPrimaryOwner: c.isPrimaryOwner === true,
        accessSecured: c.accessSecured === true,
        metrics:
            typeof c.metrics === "object" && c.metrics !== null && !Array.isArray(c.metrics)
                ? (c.metrics as Record<string, number>)
                : {},
        custodyAccountId:
            typeof c.custodyAccountId === "string" ? new UniqueEntityID(c.custodyAccountId) : undefined,
        notes: typeof c.notes === "string" ? c.notes : undefined,
    };
}

/**
 * Dónde declaró el comprador que quiere recibir el activo. Vive en la columna
 * `recipientIdentity`.
 */
function parseRecipientIdentity(raw: unknown): RecipientIdentity | undefined {
    if (raw === null || raw === undefined) return undefined;
    if (typeof raw !== "object" || Array.isArray(raw)) {
        throw new Error("Columna `recipientIdentity` corrupta: se esperaba un objeto.");
    }

    const r = raw as Record<string, unknown>;
    if (typeof r.identifier !== "string" || typeof r.declaredAt !== "string") {
        throw new Error("Identidad receptora corrupta: falta el identificador o la fecha.");
    }

    return {
        identifier: r.identifier,
        declaredAt: new Date(r.declaredAt),
        notes: typeof r.notes === "string" ? r.notes : undefined,
    };
}

function serializeRecipientIdentity(r?: RecipientIdentity) {
    if (!r) return undefined;
    return {
        identifier: r.identifier,
        declaredAt: r.declaredAt.toISOString(),
        notes: r.notes ?? null,
    };
}

/**
 * Constancia de entrega. Espejo de `custodyCheck`: mismo `undefined` en vez de
 * `Prisma.DbNull` porque se registra una vez y nunca se borra.
 */
function parseEntrega(raw: unknown): DeliveryVerification | undefined {
    if (raw === null || raw === undefined) return undefined;
    if (typeof raw !== "object" || Array.isArray(raw)) {
        throw new Error("Columna `deliveryCheck` corrupta: se esperaba un objeto.");
    }

    const d = raw as Record<string, unknown>;
    if (
        typeof d.verifiedBy !== "string" ||
        typeof d.verifiedAt !== "string" ||
        typeof d.deliveredToIdentifier !== "string"
    ) {
        throw new Error("Constancia de entrega corrupta: faltan datos obligatorios.");
    }

    return {
        verifiedBy: new UniqueEntityID(d.verifiedBy),
        verifiedAt: new Date(d.verifiedAt),
        deliveredToIdentifier: d.deliveredToIdentifier,
        buyerIsPrimaryOwner: d.buyerIsPrimaryOwner === true,
        accessTransferred: d.accessTransferred === true,
        sellerRemoved: d.sellerRemoved === true,
        notes: typeof d.notes === "string" ? d.notes : undefined,
    };
}

function serializeEntrega(d?: DeliveryVerification) {
    if (!d) return undefined;
    return {
        verifiedBy: d.verifiedBy.toString(),
        verifiedAt: d.verifiedAt.toISOString(),
        deliveredToIdentifier: d.deliveredToIdentifier,
        buyerIsPrimaryOwner: d.buyerIsPrimaryOwner,
        accessTransferred: d.accessTransferred,
        sellerRemoved: d.sellerRemoved,
        notes: d.notes ?? null,
    };
}

/**
 * `undefined` y no `null`: Prisma rechaza `null` en una columna Json opcional
 * —quiere `Prisma.DbNull`— y en un update `undefined` significa "no tocar".
 * Sirve porque la constancia se registra una vez y nunca se borra.
 */
function serializeCustodia(v?: CustodyVerification) {
    if (!v) return undefined;
    return {
        verifiedBy: v.verifiedBy.toString(),
        verifiedAt: v.verifiedAt.toISOString(),
        isPrimaryOwner: v.isPrimaryOwner,
        accessSecured: v.accessSecured,
        metrics: v.metrics,
        custodyAccountId: v.custodyAccountId ? v.custodyAccountId.toString() : null,
        notes: v.notes ?? null,
    };
}

const PROVIDERS: readonly PaymentProvider[] = ["mercadopago", "transferencia"];

/**
 * Lee la constancia del pago. El proveedor se valida contra la lista: uno
 * desconocido significaría que no sabemos de dónde salió la plata, y eso es
 * peor que no tener el dato.
 */
function parsePayment(raw: unknown): PaymentRecord | undefined {
    if (raw === null || raw === undefined) return undefined;
    if (typeof raw !== "object" || Array.isArray(raw)) {
        throw new Error("Columna `payment` corrupta: se esperaba un objeto.");
    }

    const p = raw as Record<string, unknown>;

    if (!PROVIDERS.includes(p.provider as PaymentProvider)) {
        throw new Error(`Proveedor de pago desconocido en la base: ${String(p.provider)}`);
    }
    if (
        typeof p.method !== "string" ||
        typeof p.amountCents !== "number" ||
        typeof p.currency !== "string" ||
        typeof p.confirmedAt !== "string"
    ) {
        throw new Error("Constancia de pago corrupta: faltan datos obligatorios.");
    }

    return {
        provider: p.provider as PaymentProvider,
        externalId: typeof p.externalId === "string" ? p.externalId : undefined,
        method: p.method,
        amountCents: p.amountCents,
        currency: p.currency,
        confirmedAt: new Date(p.confirmedAt),
    };
}

function serializePayment(p?: PaymentRecord) {
    if (!p) return Prisma.DbNull;
    return {
        provider: p.provider,
        externalId: p.externalId ?? null,
        method: p.method,
        amountCents: p.amountCents,
        currency: p.currency,
        confirmedAt: p.confirmedAt.toISOString(),
    };
}

/**
 * Un número finito. JSON no tiene NaN ni Infinity, pero un valor fuera de
 * rango se lee como Infinity, y una cotización así no se puede cobrar.
 */
function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

/**
 * Lee el historial de cotizaciones en pesos. `null` es "sin cotizaciones" y
 * vuelve `undefined`, nunca `[]`: una operación vieja o en pesos no las tiene
 * y rehidratarla no tiene que inventarle un historial.
 */
function parseSettlementQuotes(raw: unknown): SettlementQuote[] | undefined {
    if (raw === null || raw === undefined) return undefined;
    if (!Array.isArray(raw)) {
        throw new Error("Columna `settlementQuotes` corrupta: se esperaba un array.");
    }

    return raw.map((entry): SettlementQuote => {
        if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
            throw new Error("Cotización corrupta: se esperaba un objeto.");
        }

        const q = entry as Record<string, unknown>;
        if (
            !isFiniteNumber(q.rate) ||
            typeof q.rateDate !== "string" ||
            typeof q.source !== "string" ||
            q.currency !== "ARS" ||
            !isFiniteNumber(q.buyerPaysCents) ||
            !isFiniteNumber(q.sellerReceivesCents) ||
            !isFiniteNumber(q.platformFeeCents) ||
            typeof q.expiresAt !== "string" ||
            Number.isNaN(new Date(q.expiresAt).getTime())
        ) {
            throw new Error("Cotización corrupta: faltan datos obligatorios o son inválidos.");
        }

        return SettlementQuote.fromSnapshot({
            rate: q.rate,
            rateDate: q.rateDate,
            source: q.source as SettlementQuoteSnapshot["source"],
            currency: q.currency,
            buyerPaysCents: q.buyerPaysCents,
            sellerReceivesCents: q.sellerReceivesCents,
            platformFeeCents: q.platformFeeCents,
            expiresAt: q.expiresAt,
        });
    });
}

/**
 * `undefined` y no `Prisma.DbNull`: el historial solo crece, así que "sin
 * cotizaciones" deja la columna como está y en un update no la pisa.
 */
function serializeSettlementQuotes(quotes?: readonly SettlementQuote[]) {
    if (!quotes) return undefined;
    return quotes.map((q) => q.toSnapshot());
}

const RECEIPT_RECIPIENTS = ["seller", "platform"] as const;
const RECEIPT_STATUSES = ["pending", "confirmed", "rejected", "in_review"] as const;

/** Lee los comprobantes de la transferencia dividida. Una fila anterior a la columna no tiene. */
function parsePaymentReceipts(raw: unknown): PaymentReceipt[] | undefined {
    if (raw === null || raw === undefined) return undefined;
    if (!Array.isArray(raw)) {
        throw new Error("Columna `paymentReceipts` corrupta: se esperaba un array.");
    }
    return raw.map((entry): PaymentReceipt => {
        const r = (typeof entry === "object" && entry !== null ? entry : {}) as Record<string, unknown>;
        if (
            !RECEIPT_RECIPIENTS.includes(r.recipient as (typeof RECEIPT_RECIPIENTS)[number]) ||
            !RECEIPT_STATUSES.includes(r.status as (typeof RECEIPT_STATUSES)[number]) ||
            typeof r.fileKey !== "string" ||
            typeof r.contentType !== "string" ||
            typeof r.sizeBytes !== "number" ||
            typeof r.uploadedAt !== "string"
        ) {
            throw new Error("Comprobante corrupto: faltan datos obligatorios o son inválidos.");
        }
        return {
            recipient: r.recipient as PaymentReceipt["recipient"],
            status: r.status as PaymentReceipt["status"],
            fileKey: r.fileKey,
            contentType: r.contentType,
            sizeBytes: r.sizeBytes,
            uploadedAt: new Date(r.uploadedAt),
            decidedBy: typeof r.decidedBy === "string" ? new UniqueEntityID(r.decidedBy) : undefined,
            decidedAt: typeof r.decidedAt === "string" ? new Date(r.decidedAt) : undefined,
            rejectionCode: RECEIPT_REJECTION_CODES.includes(r.rejectionCode as ReceiptRejectionCode)
                ? (r.rejectionCode as ReceiptRejectionCode)
                : undefined,
            rejectionReason: typeof r.rejectionReason === "string" ? r.rejectionReason : undefined,
            rejectionCount: typeof r.rejectionCount === "number" ? r.rejectionCount : undefined,
            confirmedBySilence: r.confirmedBySilence === true ? true : undefined,
            review: parseReceiptReview(r.review),
        };
    });
}

/** La revisión abierta de un comprobante, si la hay. */
function parseReceiptReview(raw: unknown): ReceiptReview | undefined {
    if (raw === null || raw === undefined) return undefined;
    const v = (typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    if (
        typeof v.requestedAt !== "string" ||
        (v.requestedBy !== "buyer" && v.requestedBy !== "automatic") ||
        (v.stage !== "coherence" && v.stage !== "awaiting_seller")
    ) {
        throw new Error("Revisión de comprobante corrupta: faltan datos obligatorios o son inválidos.");
    }
    const s = (typeof v.sellerStatement === "object" && v.sellerStatement !== null ? v.sellerStatement : undefined) as
        | Record<string, unknown>
        | undefined;
    return {
        requestedAt: new Date(v.requestedAt),
        requestedBy: v.requestedBy,
        stage: v.stage,
        bankReference: typeof v.bankReference === "string" ? v.bankReference : undefined,
        sellerDeadline: typeof v.sellerDeadline === "string" ? new Date(v.sellerDeadline) : undefined,
        sellerRemindedAt: typeof v.sellerRemindedAt === "string" ? new Date(v.sellerRemindedAt) : undefined,
        sellerStatement:
            s && typeof s.fileKey === "string" && typeof s.contentType === "string" && typeof s.sizeBytes === "number" && typeof s.uploadedAt === "string"
                ? { fileKey: s.fileKey, contentType: s.contentType, sizeBytes: s.sizeBytes, uploadedAt: new Date(s.uploadedAt) }
                : undefined,
    };
}

/** `undefined` sin comprobantes: nunca se borran, solo se agregan o reemplazan por destino. */
function serializePaymentReceipts(receipts?: readonly PaymentReceipt[]) {
    if (!receipts) return undefined;
    return receipts.map((r) => ({
        recipient: r.recipient,
        status: r.status,
        fileKey: r.fileKey,
        contentType: r.contentType,
        sizeBytes: r.sizeBytes,
        uploadedAt: r.uploadedAt.toISOString(),
        decidedBy: r.decidedBy?.toString() ?? null,
        decidedAt: r.decidedAt?.toISOString() ?? null,
        rejectionCode: r.rejectionCode ?? null,
        rejectionReason: r.rejectionReason ?? null,
        rejectionCount: r.rejectionCount ?? null,
        confirmedBySilence: r.confirmedBySilence ?? null,
        review: r.review
            ? {
                  requestedAt: r.review.requestedAt.toISOString(),
                  requestedBy: r.review.requestedBy,
                  stage: r.review.stage,
                  bankReference: r.review.bankReference ?? null,
                  sellerDeadline: r.review.sellerDeadline?.toISOString() ?? null,
                  sellerRemindedAt: r.review.sellerRemindedAt?.toISOString() ?? null,
                  sellerStatement: r.review.sellerStatement
                      ? { ...r.review.sellerStatement, uploadedAt: r.review.sellerStatement.uploadedAt.toISOString() }
                      : null,
              }
            : null,
    }));
}

/** Lee el rechazo de la última declaración de cesión. */
function parseTransferRejection(raw: unknown): TransferRejection | undefined {
    if (raw === null || raw === undefined) return undefined;
    if (typeof raw !== "object" || Array.isArray(raw)) {
        throw new Error("Columna `transferRejection` corrupta: se esperaba un objeto.");
    }
    const r = raw as Record<string, unknown>;
    if (
        typeof r.reason !== "string" ||
        typeof r.rejectedBy !== "string" ||
        typeof r.rejectedAt !== "string" ||
        Number.isNaN(new Date(r.rejectedAt).getTime())
    ) {
        throw new Error("Columna `transferRejection` corrupta: faltan el motivo, quién o cuándo.");
    }
    return { reason: r.reason, rejectedBy: new UniqueEntityID(r.rejectedBy), rejectedAt: new Date(r.rejectedAt) };
}

/** Una nueva declaración deja atrás el rechazo: se borra con `Prisma.DbNull`. */
function serializeTransferRejection(r?: TransferRejection) {
    if (!r) return Prisma.DbNull;
    return { reason: r.reason, rejectedBy: r.rejectedBy.toString(), rejectedAt: r.rejectedAt.toISOString() };
}

const MILESTONE_KEYS = ["signedAt", "buyerInvitedAt", "invitationAcceptedAt", "deliveredAt", "receivedAt"] as const;

/** Lee la columna `milestones`. Una fila anterior a la columna no tiene hitos. */
function parseMilestones(raw: unknown): StoredMilestones | undefined {
    if (raw === null || raw === undefined) return undefined;
    if (typeof raw !== "object" || Array.isArray(raw)) {
        throw new Error("Columna `milestones` corrupta: se esperaba un objeto.");
    }
    const m = raw as Record<string, unknown>;
    const out: StoredMilestones = {};
    for (const key of MILESTONE_KEYS) {
        const value = m[key];
        if (value === undefined || value === null) continue;
        if (typeof value !== "string" || Number.isNaN(new Date(value).getTime())) {
            throw new Error(`Columna \`milestones\` corrupta: \`${key}\` no es una fecha.`);
        }
        out[key] = new Date(value);
    }
    const bySilence = m.receivedBySilence;
    if (bySilence !== undefined && bySilence !== null) {
        if (typeof bySilence !== "boolean") {
            throw new Error("Columna `milestones` corrupta: `receivedBySilence` no es un booleano.");
        }
        out.receivedBySilence = bySilence;
    }
    return out;
}

/**
 * `undefined` y no `Prisma.DbNull`: los hitos solo se agregan, así que sin
 * hitos la columna queda como está y en un update no se pisa.
 */
function serializeMilestones(m?: StoredMilestones) {
    if (!m) return undefined;
    const out: Record<string, string | boolean> = {};
    for (const key of MILESTONE_KEYS) {
        const value = m[key];
        if (value) out[key] = value.toISOString();
    }
    if (m.receivedBySilence !== undefined) out.receivedBySilence = m.receivedBySilence;
    return out;
}

/** Forma JSON-safe: sin Date, que Prisma no acepta como InputJson. */
function serializeNegotiations(negotiations: readonly Negotiation[]) {
    return negotiations.map((n) => ({
        amount: n.amount,
        currency: n.currency,
        proposedBy: n.proposedBy,
        proposedAt: n.proposedAt.toISOString(),
    }));
}

export class OperationMapper {
    public static toDomain(raw: PrismaOperation): Operation {
        const negotiations = parseNegotiations(raw.negotiations);

        const props: OperationProps = {
            listingId: new UniqueEntityID(raw.listingId),
            buyerId: new UniqueEntityID(raw.buyerId),
            sellerId: new UniqueEntityID(raw.sellerId),
            status: raw.status as OperationStatus,
            offerPrice: Money.fromCents(raw.offerPrice, raw.currency),
            negotiations,
            finalPrice: raw.finalPrice ? Money.fromCents(raw.finalPrice, raw.currency) : undefined,
            buyerCommission: raw.buyerCommission ? Money.fromCents(raw.buyerCommission, raw.currency) : undefined,
            sellerCommission: raw.sellerCommission ? Money.fromCents(raw.sellerCommission, raw.currency) : undefined,
            buyerPays: raw.buyerPays ? Money.fromCents(raw.buyerPays, raw.currency) : undefined,
            sellerReceives: raw.sellerReceives ? Money.fromCents(raw.sellerReceives, raw.currency) : undefined,
            platformEarns: raw.platformEarns ? Money.fromCents(raw.platformEarns, raw.currency) : undefined,
            transferInitiation: parseCesion(raw.transferInitiation),
            custodyVerification: parseCustodia(raw.custodyCheck),
            payment: parsePayment(raw.payment),
            recipientIdentity: parseRecipientIdentity(raw.recipientIdentity),
            deliveryVerification: parseEntrega(raw.deliveryCheck),
            settlementQuotes: parseSettlementQuotes(raw.settlementQuotes),
            completedAt: raw.completedAt ?? undefined,
            milestones: parseMilestones(raw.milestones),
            transferRejection: parseTransferRejection(raw.transferRejection),
            paymentReceipts: parsePaymentReceipts(raw.paymentReceipts),
        };

        return Operation.reconstitute(
            props,
            new UniqueEntityID(raw.id),
            raw.createdAt
        );
    }

    public static toPersistence(operation: Operation) {
        const { id, createdAt, props } = operation.toSnapshot();

        return {
            id,
            listingId: props.listingId.toString(),
            buyerId: props.buyerId.toString(),
            sellerId: props.sellerId.toString(),
            status: props.status,
            offerPrice: props.offerPrice.getCents(),
            finalPrice: props.finalPrice?.getCents() ?? null,
            buyerCommission: props.buyerCommission?.getCents() ?? null,
            sellerCommission: props.sellerCommission?.getCents() ?? null,
            buyerPays: props.buyerPays?.getCents() ?? null,
            sellerReceives: props.sellerReceives?.getCents() ?? null,
            platformEarns: props.platformEarns?.getCents() ?? null,
            currency: props.offerPrice.getCurrency(),
            negotiations: serializeNegotiations(props.negotiations),
            transferInitiation: serializeCesion(props.transferInitiation),
            custodyCheck: serializeCustodia(props.custodyVerification),
            payment: serializePayment(props.payment),
            recipientIdentity: serializeRecipientIdentity(props.recipientIdentity),
            deliveryCheck: serializeEntrega(props.deliveryVerification),
            settlementQuotes: serializeSettlementQuotes(props.settlementQuotes),
            completedAt: props.completedAt ?? null,
            milestones: serializeMilestones(props.milestones),
            transferRejection: serializeTransferRejection(props.transferRejection),
            paymentReceipts: serializePaymentReceipts(props.paymentReceipts),
            createdAt,
        };
    }
}
