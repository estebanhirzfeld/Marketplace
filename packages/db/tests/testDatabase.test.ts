import { describe, it, expect } from "vitest";
import {
    assertTestDatabaseUrl,
    deriveTestDatabaseUrl,
    TEST_DATABASE_NAME,
} from "../test-support/testDatabase";

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
