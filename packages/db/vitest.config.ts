import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        globals: true,
        environment: "node",
        // Los tests borran tablas enteras: corren contra `marketplace_test`
        // (o `TEST_DATABASE_URL`) y se abortan si el nombre no termina en `_test`.
        globalSetup: ["./test-support/globalSetup.ts"],
        setupFiles: ["./test-support/setupFile.ts"],
        /**
         * Los tests de integración comparten una única base de datos y cada
         * archivo trunca las tablas en su `beforeEach`. Corriendo en paralelo
         * un archivo borra los datos de otro a mitad de test, con fallas que
         * parecen bugs de dominio ("Listing no encontrado") pero son
         * interferencia entre suites.
         */
        fileParallelism: false,
    },
});
