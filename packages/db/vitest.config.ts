import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        globals: true,
        environment: "node",
        setupFiles: ["dotenv/config"],
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
