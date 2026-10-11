import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['tests/**/*.test.ts'],
        // bcrypt con 12 rondas es deliberadamente lento.
        testTimeout: 20_000,
        // Los tests HTTP comparten la base con los de integración: en
        // paralelo, el beforeEach de un archivo borra los datos del otro.
        fileParallelism: false,
        // Los tests HTTP borran tablas enteras: comparten la base de prueba y el
        // resguardo `_test` con el paquete de persistencia.
        globalSetup: ['../../packages/db/test-support/globalSetup.ts'],
        setupFiles: ['./tests/setup.ts'],
    },
});
