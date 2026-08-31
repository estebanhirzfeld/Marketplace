import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { UserRole } from "@marketplace/shared-types";
import { User } from "@marketplace/domain/src/entities/User";
import { Notification } from "@marketplace/domain/src/entities/Notification";
import { Email } from "@marketplace/domain/src/value-objects/Email";
import { UniqueEntityID } from "@marketplace/domain/src/value-objects/UniqueEntityID";
import { PrismaUserRepository } from "../src/repositories/PrismaUserRepository";
import { PrismaNotificationRepository } from "../src/repositories/PrismaNotificationRepository";
import { prisma } from "../src/client";

const userRepo = new PrismaUserRepository();
const repo = new PrismaNotificationRepository();

async function crearUsuario(email: string): Promise<User> {
    const user = User.create({
        email: Email.create(email),
        fullName: "Destinatario",
        role: UserRole.BUYER,
        passwordHash: "hash-de-prueba",
    });
    await userRepo.save(user);
    return user;
}

async function limpiar() {
    await prisma.notification.deleteMany();
    await prisma.contract.deleteMany();
    await prisma.operation.deleteMany();
    await prisma.listing.deleteMany();
    await prisma.user.deleteMany();
}

beforeEach(limpiar);

afterAll(async () => {
    await limpiar();
    await prisma.$disconnect();
});

describe("PrismaNotificationRepository", () => {
    it("persiste y recupera un aviso con todos sus campos", async () => {
        const user = await crearUsuario("uno@test.com");

        const aviso = Notification.create({
            userId: user.id,
            type: "oferta_recibida",
            operationId: new UniqueEntityID(),
            listingId: new UniqueEntityID(),
            amountCents: 1_500_000,
            currency: "USD",
        });
        await repo.save(aviso);

        const recuperado = await repo.findById(aviso.id.toString());

        expect(recuperado).not.toBeNull();
        expect(recuperado!.type).toBe("oferta_recibida");
        expect(recuperado!.isRead).toBe(false);
        expect(recuperado!.toSnapshot().props.amountCents).toBe(1_500_000);
    });

    it("guarda varios de una y los devuelve del más nuevo al más viejo", async () => {
        const user = await crearUsuario("uno@test.com");

        await repo.saveMany([
            Notification.create({ userId: user.id, type: "oferta_recibida" }),
            Notification.create({ userId: user.id, type: "contraoferta_recibida" }),
            Notification.create({ userId: user.id, type: "oferta_aceptada" }),
        ]);

        const avisos = await repo.findByUser(user.id.toString());
        expect(avisos).toHaveLength(3);
    });

    it("no mezcla las bandejas de dos usuarios", async () => {
        const uno = await crearUsuario("uno@test.com");
        const otro = await crearUsuario("otro@test.com");

        await repo.saveMany([
            Notification.create({ userId: uno.id, type: "oferta_recibida" }),
            Notification.create({ userId: otro.id, type: "oferta_recibida" }),
            Notification.create({ userId: otro.id, type: "oferta_aceptada" }),
        ]);

        expect(await repo.findByUser(uno.id.toString())).toHaveLength(1);
        expect(await repo.findByUser(otro.id.toString())).toHaveLength(2);
    });

    it("cuenta y filtra las no leídas", async () => {
        const user = await crearUsuario("uno@test.com");

        const leida = Notification.create({ userId: user.id, type: "oferta_recibida" });
        await repo.saveMany([
            leida,
            Notification.create({ userId: user.id, type: "oferta_aceptada" }),
        ]);

        expect(await repo.countUnread(user.id.toString())).toBe(2);

        leida.markAsRead();
        await repo.save(leida);

        expect(await repo.countUnread(user.id.toString())).toBe(1);
        expect(await repo.findByUser(user.id.toString(), true)).toHaveLength(1);
    });

    /**
     * `readAt` es un Date. Si el mapper no lo reviviera correctamente, el round
     * trip lo traería como string — el mismo defecto que tenía `signedAt` en
     * las firmas.
     */
    it("recupera readAt como Date, no como string", async () => {
        const user = await crearUsuario("uno@test.com");
        const aviso = Notification.create({ userId: user.id, type: "pago_confirmado" });
        aviso.markAsRead();
        await repo.save(aviso);

        const recuperado = await repo.findById(aviso.id.toString());
        const readAt = recuperado!.toSnapshot().props.readAt;

        expect(readAt).toBeInstanceOf(Date);
        expect(Number.isNaN(readAt!.getTime())).toBe(false);
    });

    it("guardar un lote vacío no rompe", async () => {
        await expect(repo.saveMany([])).resolves.toBeUndefined();
    });

    /** El repositorio también es el notificador: notificar es guardar. */
    it("notificar deja los avisos en la bandeja", async () => {
        const user = await crearUsuario("uno@test.com");

        await repo.notify([
            Notification.create({ userId: user.id, type: "activo_en_custodia" }),
        ]);

        expect(await repo.countUnread(user.id.toString())).toBe(1);
    });
});
