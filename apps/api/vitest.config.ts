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
        setupFiles: ['./tests/setup.ts'],
    },
});
