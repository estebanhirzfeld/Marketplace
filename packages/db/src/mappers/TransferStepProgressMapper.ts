import { Prisma } from "../../generated/prisma/client";
import type { TransferStepProgress as PrismaTransferStepProgress } from "../../generated/prisma/client";
import {
    TransferStepProgress,
    TransferStepProgressStatus,
    TransferStepScope,
} from "@marketplace/domain/src/entities/TransferStepProgress";
import { UniqueEntityID } from "@marketplace/domain/src/value-objects/UniqueEntityID";

const SCOPES: readonly TransferStepScope[] = ["listing", "operation"];
const STATUSES: readonly TransferStepProgressStatus[] = ["pending", "waiting", "done", "expired", "rejected"];

/**
 * `scope` y `status` son texto en la tabla: se validan al leer y un valor
 * desconocido falla fuerte, porque seguir con él escondería datos corruptos.
 * La evidencia viaja como JSON y se exige que sea un objeto.
 */
export class TransferStepProgressMapper {
    public static toDomain(raw: PrismaTransferStepProgress): TransferStepProgress {
        const scope = SCOPES.find((s) => s === raw.scope);
        if (!scope) {
            throw new Error(`Alcance de paso de traspaso desconocido en la base: ${raw.scope}`);
        }
        const status = STATUSES.find((s) => s === raw.status);
        if (!status) {
            throw new Error(`Estado de paso de traspaso desconocido en la base: ${raw.status}`);
        }

        return TransferStepProgress.reconstitute(
            {
                scope,
                scopeId: raw.scopeId,
                stepKey: raw.stepKey,
                status,
                startedAt: raw.startedAt,
                deadlineAt: raw.deadlineAt ?? undefined,
                lastCheckedAt: raw.lastCheckedAt ?? undefined,
                remindedAt: raw.remindedAt ?? undefined,
                escalatedAt: raw.escalatedAt ?? undefined,
                evidence: parseEvidence(raw.evidence),
                attestedBy: raw.attestedBy ?? undefined,
            },
            new UniqueEntityID(raw.id),
            raw.createdAt,
        );
    }

    public static toPersistence(progress: TransferStepProgress) {
        const { id, createdAt, props } = progress.toSnapshot();

        return {
            id,
            scope: props.scope,
            scopeId: props.scopeId,
            stepKey: props.stepKey,
            status: props.status,
            startedAt: props.startedAt,
            deadlineAt: props.deadlineAt ?? null,
            lastCheckedAt: props.lastCheckedAt ?? null,
            remindedAt: props.remindedAt ?? null,
            escalatedAt: props.escalatedAt ?? null,
            evidence: serializeEvidence(props.evidence),
            attestedBy: props.attestedBy ?? null,
            createdAt,
        };
    }
}

/** Ida y vuelta por JSON: deja la evidencia en lo que la columna Json admite. */
function serializeEvidence(evidence: Record<string, unknown>): Prisma.InputJsonObject {
    return JSON.parse(JSON.stringify(evidence));
}

function parseEvidence(raw: unknown): Record<string, unknown> {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        throw new Error("Columna `evidence` corrupta: se esperaba un objeto.");
    }
    return Object.fromEntries(Object.entries(raw));
}
