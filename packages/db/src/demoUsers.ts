import { User } from "@marketplace/domain/src/entities/User";
import { Email } from "@marketplace/domain/src/value-objects/Email";
import { IUserRepository } from "@marketplace/domain/src/ports/Repositories";
import { UserRole } from "@marketplace/shared-types";

/** Datos de una cuenta de demostración. */
export interface DemoUser {
    email: string;
    fullName: string;
    dni: string;
    role: UserRole;
    country: string;
}

/**
 * Las cuentas que se le pasan a quien quiere probar la plataforma.
 *
 * Las comparten el seed de desarrollo y el script `db:demo-users` (el único
 * camino para sumarlas en producción sin volver a correr el seed, que borra
 * todo).
 */
export const DEMO_USERS: readonly DemoUser[] = [
    {
        email: "seller3@forzalabs.online",
        fullName: "Test Seller",
        dni: "20301234569",
        role: UserRole.SELLER,
        country: "AR",
    },
    {
        email: "buyer3@forzalabs.online",
        fullName: "Test Buyer",
        dni: "27309876545",
        role: UserRole.BUYER,
        country: "AR",
    },
];

/**
 * Crea las cuentas de demostración que todavía no existen.
 *
 * La contraseña de cada una es su propio correo, siempre y a propósito: es una
 * decisión explícita para una demo entre conocidos, y ninguna es administradora.
 * Quien lea el repositorio sabe esas credenciales; por eso estas cuentas no
 * deben tener nada que perder.
 *
 * Es idempotente: busca por correo y se salta las que ya están, así que
 * correrlo dos veces no falla ni duplica. Devuelve los correos creados.
 */
export async function ensureDemoUsers(
    userRepo: IUserRepository,
    hashPassword: (password: string) => Promise<string>,
): Promise<string[]> {
    const created: string[] = [];
    for (const demo of DEMO_USERS) {
        if (await userRepo.findByEmail(demo.email)) continue;

        const user = User.create({
            email: Email.create(demo.email),
            fullName: demo.fullName,
            dni: demo.dni,
            role: demo.role,
            country: demo.country,
            passwordHash: await hashPassword(demo.email),
        });
        user.verifyKyc();
        await userRepo.save(user);
        created.push(demo.email);
    }
    return created;
}
