import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import nextConfig from '../next.config';

/**
 * La caja de 1 GB no puede correr `next build`. El build se hace fuera (CI) y a
 * la VM llega el bundle `standalone`. Para que ese bundle sea autocontenido en
 * un monorepo pnpm, `outputFileTracingRoot` tiene que apuntar a la raíz del
 * workspace: sin eso, Next omite en silencio las dependencias de los paquetes
 * del workspace y el server standalone explota en runtime.
 */
describe('next.config — build fuera de la caja', () => {
    it('emite el bundle standalone', () => {
        expect(nextConfig.output).toBe('standalone');
    });

    it('traza los archivos desde la raíz del monorepo, no desde apps/web', () => {
        const root = nextConfig.outputFileTracingRoot;
        expect(typeof root).toBe('string');
        // La raíz trazada debe contener el manifiesto del workspace pnpm.
        expect(fs.existsSync(path.join(root as string, 'pnpm-workspace.yaml'))).toBe(true);
        // Y NO debe ser el propio directorio de apps/web.
        expect(path.resolve(root as string)).not.toBe(path.resolve(__dirname, '..'));
    });

    it('turbopack y el trazado coinciden en la misma raíz', () => {
        const tRoot = nextConfig.turbopack?.root;
        expect(path.resolve(tRoot as string)).toBe(
            path.resolve(nextConfig.outputFileTracingRoot as string),
        );
    });
});
