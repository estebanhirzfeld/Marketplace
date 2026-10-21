import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { TransferStepProgress } from "@marketplace/domain/src/entities/TransferStepProgress";
import { PrismaTransferStepProgressRepository } from "../src/repositories/PrismaTransferStepProgressRepository";
import { TransferStepProgressMapper } from "../src/mappers/TransferStepProgressMapper";
import { prisma } from "../src/client";
import type { TransferStepProgress as PrismaTransferStepProgress } from "../generated/prisma/client";

const repo = new PrismaTransferStepProgressRepository();

const DAY_MS = 24 * 60 * 60 * 1000;
const STARTED_AT = new Date("2026-10-20T12:00:00.000Z");
const DEADLINE_AT = new Date(STARTED_AT.getTime() + 10 * DAY_MS);

function startStep(overrides: { scopeId?: string; stepKey?: string; deadlineAt?: Date | undefined } = {}) {
    return TransferStepProgress.start({
        scope: "operation",
        scopeId: overrides.scopeId ?? "operation-1",
        stepKey: overrides.stepKey ?? "domain-to-platform",
        startedAt: STARTED_AT,
        deadlineAt: "deadlineAt" in overrides ? overrides.deadlineAt : DEADLINE_AT,
    });
}

beforeEach(async () => {
    await prisma.transferStepProgress.deleteMany();
});

afterAll(async () => {
    await prisma.transferStepProgress.deleteMany();
    await prisma.$disconnect();
});

describe("PrismaTransferStepProgressRepository", () => {
    it("ida y vuelta: conserva plazo, evidencia y quién lo declaró", async () => {
        const step = startStep();
        step.markWaiting(new Date("2026-10-21T10:00:00.000Z"), { invitationSeen: true, transferId: "tr-1" });
        step.markDone(new Date("2026-10-22T10:00:00.000Z"), { attestedBy: "admin-1" });
        await repo.save(step);

        const found = await repo.find("operation", "operation-1", "domain-to-platform");

        expect(found).not.toBeNull();
        expect(found?.id.toString()).toBe(step.id.toString());
        expect(found?.status).toBe("done");
        expect(found?.startedAt).toEqual(STARTED_AT);
        expect(found?.deadlineAt).toEqual(DEADLINE_AT);
        expect(found?.lastCheckedAt).toEqual(new Date("2026-10-22T10:00:00.000Z"));
        expect(found?.evidence).toEqual({ invitationSeen: true, transferId: "tr-1" });
        expect(found?.attestedBy).toBe("admin-1");
        expect(found?.remindedAt).toBeUndefined();
        expect(found?.escalatedAt).toBeUndefined();
    });

    it("un paso sin plazo vuelve sin plazo", async () => {
        await repo.save(startStep({ deadlineAt: undefined }));

        const found = await repo.find("operation", "operation-1", "domain-to-platform");

        expect(found?.deadlineAt).toBeUndefined();
    });

    it("devuelve null cuando no hay fila", async () => {
        expect(await repo.find("operation", "operation-1", "domain-to-platform")).toBeNull();
    });

    it("guardar de nuevo el mismo paso actualiza la fila en vez de duplicarla", async () => {
        const first = startStep();
        await repo.save(first);

        // Otra entidad (otro id) para el mismo paso: pisa la fila, no choca con el único.
        const second = startStep();
        second.markReminded(new Date(DEADLINE_AT.getTime() - DAY_MS));
        await repo.save(second);

        const all = await repo.findByScope("operation", "operation-1");
        expect(all).toHaveLength(1);
        expect(all[0]?.remindedAt).toEqual(new Date(DEADLINE_AT.getTime() - DAY_MS));
    });

    it("reiniciar un paso vencido y escalado deja la fila como nueva: sin recordatorio ni escalada", async () => {
        // Es lo que hace la entrega de un dominio cuando vence la invitación y
        // el admin la vuelve a iniciar: si la fila conservara `remindedAt` y
        // `escalatedAt`, el paso reiniciado nunca volvería a avisar.
        const vencido = startStep();
        vencido.markReminded(new Date(DEADLINE_AT.getTime() - DAY_MS));
        const despues = new Date(DEADLINE_AT.getTime() + DAY_MS);
        vencido.markExpired(despues);
        vencido.markEscalated(despues);
        await repo.save(vencido);

        const nuevoPlazo = new Date(despues.getTime() + 10 * DAY_MS);
        const reiniciado = TransferStepProgress.start({
            scope: "operation",
            scopeId: "operation-1",
            stepKey: vencido.stepKey,
            startedAt: despues,
            deadlineAt: nuevoPlazo,
        });
        reiniciado.markWaiting(despues, { recipientEmail: "comprador@correo.com" });
        await repo.save(reiniciado);

        const fila = await repo.find("operation", "operation-1", vencido.stepKey);
        expect(fila?.status).toBe("waiting");
        expect(fila?.startedAt).toEqual(despues);
        expect(fila?.deadlineAt).toEqual(nuevoPlazo);
        expect(fila?.remindedAt).toBeUndefined();
        expect(fila?.escalatedAt).toBeUndefined();
        expect(fila?.evidence).toEqual({ recipientEmail: "comprador@correo.com" });
    });

    it("findByScope lista solo los pasos de ese alcance y activo", async () => {
        await repo.save(startStep({ stepKey: "hosting" }));
        await repo.save(startStep({ stepKey: "code" }));
        await repo.save(startStep({ scopeId: "operation-2", stepKey: "hosting" }));
        await repo.save(
            TransferStepProgress.start({
                scope: "listing",
                scopeId: "operation-1",
                stepKey: "domain-in-hostinger",
                startedAt: STARTED_AT,
            }),
        );

        const steps = await repo.findByScope("operation", "operation-1");

        expect(steps.map((s) => s.stepKey).sort()).toEqual(["code", "hosting"]);
    });

    it("findOpen trae los pasos en curso y los vencidos sin escalar, no los terminados", async () => {
        const pending = startStep({ stepKey: "pending" });
        const waiting = startStep({ stepKey: "waiting" });
        waiting.markWaiting(STARTED_AT);
        const expiredUnescalated = startStep({ stepKey: "expired-unescalated" });
        expiredUnescalated.markExpired(DEADLINE_AT);
        const expiredEscalated = startStep({ stepKey: "expired-escalated" });
        expiredEscalated.markExpired(DEADLINE_AT);
        expiredEscalated.markEscalated(DEADLINE_AT);
        const done = startStep({ stepKey: "done" });
        done.markDone(STARTED_AT);
        const rejected = startStep({ stepKey: "rejected" });
        rejected.markRejected(STARTED_AT);
        for (const step of [pending, waiting, expiredUnescalated, expiredEscalated, done, rejected]) {
            await repo.save(step);
        }

        const open = await repo.findOpen();

        expect(open.map((s) => s.stepKey).sort()).toEqual(["expired-unescalated", "pending", "waiting"]);
    });
});

function rawRow(overrides: Partial<PrismaTransferStepProgress> = {}): PrismaTransferStepProgress {
    return {
        id: "11111111-1111-4111-8111-111111111111",
        scope: "operation",
        scopeId: "operation-1",
        stepKey: "domain-to-platform",
        status: "pending",
        startedAt: STARTED_AT,
        deadlineAt: null,
        lastCheckedAt: null,
        remindedAt: null,
        escalatedAt: null,
        evidence: {},
        attestedBy: null,
        createdAt: STARTED_AT,
        updatedAt: STARTED_AT,
        ...overrides,
    };
}

describe("TransferStepProgressMapper", () => {
    it("falla fuerte con un estado desconocido en la base", () => {
        expect(() => TransferStepProgressMapper.toDomain(rawRow({ status: "inventado" }))).toThrow(/Estado/);
    });

    it("falla fuerte con un alcance desconocido en la base", () => {
        expect(() => TransferStepProgressMapper.toDomain(rawRow({ scope: "usuario" }))).toThrow(/Alcance/);
    });

    it("falla fuerte con una evidencia que no es un objeto", () => {
        expect(() => TransferStepProgressMapper.toDomain(rawRow({ evidence: ["no", "es", "un", "objeto"] }))).toThrow(
            /evidence/,
        );
    });
});
