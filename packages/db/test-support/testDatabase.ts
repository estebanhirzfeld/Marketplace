import { execFileSync } from "node:child_process";
import path from "node:path";
import { Client } from "pg";

/** Base separada donde corren los tests de integración. Nunca la de desarrollo. */
export const TEST_DATABASE_NAME = "marketplace_test";

const TEST_SUFFIX = "_test";
const DB_PACKAGE_ROOT = path.resolve(__dirname, "..");

function databaseNameOf(url: string): string {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        // No se incluye la URL en el mensaje: puede traer la contraseña.
        throw new Error("La URL de la base de datos no es válida; se aborta la suite.");
    }
    return decodeURIComponent(parsed.pathname.replace(/^\//, ""));
}

/**
 * Resguardo: los tests hacen `deleteMany` sobre todas las tablas, así que solo
 * pueden correr contra una base cuyo nombre termina en `_test`.
 */
export function assertTestDatabaseUrl(url: string): void {
    const name = databaseNameOf(url);
    if (!name.endsWith(TEST_SUFFIX)) {
        throw new Error(
            `Los tests de integración borran datos y solo corren contra una base cuyo nombre termina en "${TEST_SUFFIX}" ` +
                `(la base apuntada se llama "${name}"). Se aborta la suite sin tocar nada.`,
        );
    }
}

/** URL de la base de prueba: `TEST_DATABASE_URL` o `DATABASE_URL` con otro nombre de base. */
export function deriveTestDatabaseUrl(env: Record<string, string | undefined>): string {
    if (env.TEST_DATABASE_URL) return env.TEST_DATABASE_URL;
    if (!env.DATABASE_URL) {
        throw new Error("Falta DATABASE_URL (o TEST_DATABASE_URL) para derivar la base de prueba.");
    }
    const derived = new URL(env.DATABASE_URL);
    derived.pathname = `/${TEST_DATABASE_NAME}`;
    return derived.toString();
}

/**
 * Apunta el proceso a la base de prueba y verifica el resguardo. Se llama desde
 * el setup de cada suite, antes de que se importe el cliente de Prisma.
 */
export function useTestDatabase(env: NodeJS.ProcessEnv = process.env): string {
    const url = deriveTestDatabaseUrl(env);
    assertTestDatabaseUrl(url);
    env.DATABASE_URL = url;
    return url;
}

/** Crea la base de prueba si no existe y le aplica las migraciones. */
export async function provisionTestDatabase(url: string): Promise<void> {
    assertTestDatabaseUrl(url);
    const name = databaseNameOf(url);
    if (!/^[a-z0-9_]+$/.test(name)) {
        throw new Error(`Nombre de base de prueba no permitido: "${name}".`);
    }

    const maintenance = new URL(url);
    maintenance.pathname = "/postgres";
    const client = new Client({ connectionString: maintenance.toString() });
    await client.connect();
    try {
        const found = await client.query("select 1 from pg_database where datname = $1", [name]);
        if (found.rowCount === 0) {
            await client.query(`create database "${name}"`);
        }
    } finally {
        await client.end();
    }

    // `migrate deploy` solo aplica migraciones pendientes: no resetea nada.
    execFileSync(path.join(DB_PACKAGE_ROOT, "node_modules/.bin/prisma"), ["migrate", "deploy"], {
        cwd: DB_PACKAGE_ROOT,
        env: { ...process.env, DATABASE_URL: url },
        stdio: "pipe",
    });
}
