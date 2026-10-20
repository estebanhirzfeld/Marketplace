import bcrypt from "bcryptjs";
import { DEMO_USERS, ensureDemoUsers } from "../src/demoUsers";
import { PrismaUserRepository } from "../src/repositories/PrismaUserRepository";
import { prisma } from "../src/client";

// Las mismas doce rondas que usa `BcryptPasswordHasher` en la API.
const SALT_ROUNDS = 12;

/**
 * Suma las cuentas de demostración sin tocar el resto de la base. A diferencia
 * del seed no borra nada, y se puede correr las veces que haga falta.
 */
async function main() {
    const created = await ensureDemoUsers(new PrismaUserRepository(), (password) =>
        bcrypt.hash(password, SALT_ROUNDS),
    );

    for (const { email } of DEMO_USERS) {
        console.log(`${created.includes(email) ? "creado " : "ya existe"}  ${email}`);
    }
}

main()
    .catch((e) => {
        console.error("❌ Error al crear los usuarios de demostración:", e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
