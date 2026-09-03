import { defineConfig } from 'tsup';

/**
 * Artefacto de producción de la API.
 *
 * `tsconfig.base.json` declara `module: "ESNext"` + `moduleResolution: "Bundler"`:
 * es un contrato que dice que estas fuentes las consume un bundler, no Node a
 * secas. `apps/web` lo respeta (Next bundlea); `apps/api` lo rompía al pasarle
 * la salida cruda de `tsc` a `node`. La solución es honrar el contrato y
 * bundlear la API a un único archivo, sin tocar ninguna fuente.
 *
 * Formato ESM + banner `createRequire`, verificado empíricamente:
 *   - CJS:            compila, pero muere al arrancar — `import.meta` queda vacío
 *                     y el cliente Prisma hace `fileURLToPath(import.meta.url)`.
 *   - ESM plano:      muere — `dotenv` hace `require` y el output ESM no lo tiene.
 *   - ESM + banner:   arranca, sirve y consulta Postgres. Es esta.
 *
 * No se agrega `"type": "module"` a package.json a propósito: la extensión
 * `.mjs` es una declaración por archivo y no altera las rutas de vitest ni de
 * `tsx` en desarrollo.
 */
export default defineConfig({
    entry: ['src/server.ts'],
    platform: 'node',
    target: 'node20',
    format: ['esm'],
    bundle: true,
    outDir: 'dist',
    outExtension: () => ({ js: '.mjs' }),
    banner: {
        js: "import{createRequire as __cr}from'module';const require=__cr(import.meta.url);",
    },
    // Los paquetes de workspace no tienen un entry JS cargable (exportan `.ts`),
    // así que deben inlinarse en el bundle.
    noExternal: [/^@marketplace\//],
    // Dependencias npm reales: quedan en node_modules.
    external: [
        'fastify',
        '@fastify/jwt',
        'fastify-plugin',
        'pg',
        '@prisma/adapter-pg',
        'bcryptjs',
        'dotenv',
    ],
    sourcemap: true,
    clean: true,
});
