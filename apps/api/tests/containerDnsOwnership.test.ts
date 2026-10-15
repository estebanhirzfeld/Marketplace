import { describe, it, expect, afterEach, vi } from 'vitest';
import { createContainer } from '../src/container';

/** El cableado de la titularidad por DNS según el entorno. No toca la base. */

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('Contenedor — titularidad por DNS', () => {
    it('con DNS_CHALLENGE_SECRET arma los dos casos de uso', () => {
        vi.stubEnv('DNS_CHALLENGE_SECRET', 'a'.repeat(32));

        const c = createContainer();

        expect(c.getDomainOwnershipChallenge).toBeDefined();
        expect(c.verifyDomainOwnership).toBeDefined();
    });

    it.each(['', '   '])('sin secreto (%j) no arma nada', (value) => {
        vi.stubEnv('DNS_CHALLENGE_SECRET', value);

        const c = createContainer();

        expect(c.getDomainOwnershipChallenge).toBeUndefined();
        expect(c.verifyDomainOwnership).toBeUndefined();
    });

    it('con un secreto demasiado corto falla al arrancar, no lo trata como ausente', () => {
        vi.stubEnv('DNS_CHALLENGE_SECRET', 'corto');

        expect(() => createContainer()).toThrow(/openssl rand -hex 32/);
    });
});
