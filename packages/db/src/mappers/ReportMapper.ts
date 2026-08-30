import type { Report as PrismaReport } from "../../generated/prisma/client";
import {
    Report,
    ReportProps,
    ReportReason,
    ReportStatus,
} from "@marketplace/domain/src/entities/Report";
import { NegotiatingParty } from "@marketplace/domain/src/entities/Operation";
import { UniqueEntityID } from "@marketplace/domain/src/value-objects/UniqueEntityID";

const PARTIES: readonly NegotiatingParty[] = ["buyer", "seller"];

export class ReportMapper {
    public static toDomain(raw: PrismaReport): Report {
        if (!PARTIES.includes(raw.reporterRole as NegotiatingParty)) {
            throw new Error(`Parte denunciante desconocida en la base: ${raw.reporterRole}`);
        }

        const props: ReportProps = {
            operationId: new UniqueEntityID(raw.operationId),
            reportedBy: new UniqueEntityID(raw.reportedById),
            reporterRole: raw.reporterRole as NegotiatingParty,
            reportedUserId: new UniqueEntityID(raw.reportedUserId),
            reason: raw.reason as ReportReason,
            detail: raw.detail,
            status: raw.status as ReportStatus,
            closedAt: raw.closedAt ?? undefined,
            closedReason: raw.closedReason ?? undefined,
        };

        return Report.reconstitute(props, new UniqueEntityID(raw.id), raw.createdAt);
    }

    public static toPersistence(report: Report) {
        const { id, createdAt, props } = report.toSnapshot();

        return {
            id,
            operationId: props.operationId.toString(),
            reportedById: props.reportedBy.toString(),
            reporterRole: props.reporterRole,
            reportedUserId: props.reportedUserId.toString(),
            reason: props.reason,
            detail: props.detail,
            status: props.status,
            closedAt: props.closedAt ?? null,
            closedReason: props.closedReason ?? null,
            createdAt,
        };
    }
}
