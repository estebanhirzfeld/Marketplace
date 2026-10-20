import { describe, it, expect, vi } from "vitest";
import {
    assertTestDatabaseUrl,
    createDatabaseIfMissing,
    deriveTestDatabaseUrl,
    TEST_DATABASE_NAME,
    useTestDatabase,
} from "../test-support/testDatabase";

function databaseNameOf(url: string): string {
    return new URL(url).pathname.replace(/^\//, "");
}

const DEV_URL = "postgresql://marketplace:secreto@localhost:5434/marketplace_dev?schema=public";

describe("deriveTestDatabaseUrl", () => {
    it("cambia solo el nombre de la base de DATABASE_URL por marketplace_test", () => {
        const url = new URL(deriveTestDatabaseUrl({ DATABASE_URL: DEV_URL }));

        expect(url.pathname).toBe(`/${TEST_DATABASE_NAME}`);
        expect(TEST_DATABASE_NAME).toBe("marketplace_test");
        expect(url.host).toBe("localhost:5434");
        expect(url.username).toBe("marketplace");
        expect(url.search).toBe("?schema=public");
    });

    it("prefiere TEST_DATABASE_URL cuando existe", () => {
        const explicit = "postgresql://u:p@otro:5555/otra_test";

        expect(deriveTestDatabaseUrl({ DATABASE_URL: DEV_URL, TEST_DATABASE_URL: explicit })).toBe(explicit);
    });

    it("falla si no hay ninguna URL", () => {
        expect(() => deriveTestDatabaseUrl({})).toThrow(/DATABASE_URL/);
    });
});

describe("assertTestDatabaseUrl", () => {
    it("acepta una base cuyo nombre termina en _test", () => {
        expect(() => assertTestDatabaseUrl("postgresql://u:p@h:1/marketplace_test")).not.toThrow();
    });

    it.each([
        ["la base de desarrollo", DEV_URL],
        ["un nombre que solo contiene test", "postgresql://u:p@h:1/testing"],
        ["un nombre sin base", "postgresql://u:p@h:1"],
    ])("aborta con %s", (_label, url) => {
        expect(() => assertTestDatabaseUrl(url)).toThrow(/_test/);
    });

    it("aborta con una URL ilegible sin filtrar su contenido", () => {
        const error = (() => {
            try {
                assertTestDatabaseUrl("no-es-una-url-secreto");
                return undefined;
            } catch (e) {
                return e as Error;
            }
        })();

        expect(error).toBeInstanceOf(Error);
        expect(error?.message).not.toContain("secreto");
    });
});

describe("useTestDatabase", () => {
    it("reescribe DATABASE_URL a la base de prueba cuando el resguardo pasa", () => {
        const env: NodeJS.ProcessEnv = { DATABASE_URL: DEV_URL };

        const url = useTestDatabase(env);

        expect(databaseNameOf(url)).toBe(TEST_DATABASE_NAME);
        expect(env.DATABASE_URL).toBe(url);
    });

    it("usa TEST_DATABASE_URL como DATABASE_URL cuando termina en _test", () => {
        const explicit = "postgresql://u:p@otro:5555/otra_test";
        const env: NodeJS.ProcessEnv = { DATABASE_URL: DEV_URL, TEST_DATABASE_URL: explicit };

        useTestDatabase(env);

        expect(env.DATABASE_URL).toBe(explicit);
    });

    it("deja DATABASE_URL intacta y aborta cuando TEST_DATABASE_URL no termina en _test", () => {
        const env: NodeJS.ProcessEnv = {
            DATABASE_URL: DEV_URL,
            TEST_DATABASE_URL: "postgresql://u:p@h:1/marketplace_dev",
        };

        expect(() => useTestDatabase(env)).toThrow(/_test/);
        expect(env.DATABASE_URL).toBe(DEV_URL);
    });

    it("deja DATABASE_URL intacta cuando no hay de dónde derivar la base de prueba", () => {
        const env: NodeJS.ProcessEnv = {};

        expect(() => useTestDatabase(env)).toThrow(/DATABASE_URL/);
        expect(env.DATABASE_URL).toBeUndefined();
    });
});

describe("createDatabaseIfMissing", () => {
    it("no crea nada si la base ya existe", async () => {
        const query = vi.fn().mockResolvedValue({ rowCount: 1 });

        await createDatabaseIfMissing({ query }, "marketplace_test");

        expect(query).toHaveBeenCalledTimes(1);
    });

    it("crea la base si no existe", async () => {
        const query = vi.fn().mockResolvedValueOnce({ rowCount: 0 }).mockResolvedValueOnce({ rowCount: null });

        await createDatabaseIfMissing({ query }, "marketplace_test");

        expect(query).toHaveBeenLastCalledWith('create database "marketplace_test"');
    });

    it("sigue si otra suite la creó entre la consulta y el create (42P04)", async () => {
        const duplicate = Object.assign(new Error("database already exists"), { code: "42P04" });
        const query = vi.fn().mockResolvedValueOnce({ rowCount: 0 }).mockRejectedValueOnce(duplicate);

        await expect(createDatabaseIfMissing({ query }, "marketplace_test")).resolves.toBeUndefined();
    });

    it("sigue si dos creaciones simultáneas chocan en el índice de pg_database (23505)", async () => {
        // Es lo que Postgres responde de verdad cuando dos `create database`
        // corren a la vez: no siempre llega a avisar con 42P04.
        const race = Object.assign(new Error("duplicate key value"), {
            code: "23505",
            constraint: "pg_database_datname_index",
        });
        const query = vi.fn().mockResolvedValueOnce({ rowCount: 0 }).mockRejectedValueOnce(race);

        await expect(createDatabaseIfMissing({ query }, "marketplace_test")).resolves.toBeUndefined();
    });

    it("propaga una violación de unicidad que no es la de pg_database", async () => {
        const other = Object.assign(new Error("duplicate key value"), { code: "23505", constraint: "otra" });
        const query = vi.fn().mockResolvedValueOnce({ rowCount: 0 }).mockRejectedValueOnce(other);

        await expect(createDatabaseIfMissing({ query }, "marketplace_test")).rejects.toBe(other);
    });

    it("propaga cualquier otro error del create", async () => {
        const denied = Object.assign(new Error("permission denied"), { code: "42501" });
        const query = vi.fn().mockResolvedValueOnce({ rowCount: 0 }).mockRejectedValueOnce(denied);

        await expect(createDatabaseIfMissing({ query }, "marketplace_test")).rejects.toBe(denied);
    });
});
