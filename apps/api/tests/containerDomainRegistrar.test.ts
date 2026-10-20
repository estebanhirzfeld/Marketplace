import { describe, it, expect, afterEach, vi } from 'vitest';
import { createContainer } from '../src/container';
import { HostingerDomainRegistrar } from '../src/adapters/HostingerDomainRegistrar';

/** El cableado del registrador de dominios según el entorno. No toca la base ni la red. */

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('Contenedor — registrador de dominios', () => {
    it('con token y perfil WHOIS arma el registrador de Hostinger', () => {
        vi.stubEnv('HOSTINGER_API_TOKEN', 'tok_de_prueba');
        vi.stubEnv('HOSTINGER_WHOIS_PROFILE_ID', '614698');

        const c = createContainer();

        expect(c.domainRegistrar).toBeInstanceOf(HostingerDomainRegistrar);
    });

    it.each([
        ['sin token', '', '614698'],
        ['sin perfil', 'tok_de_prueba', ''],
        ['ambos en blanco', '   ', '   '],
    ])('%s no arma nada', (_name, token, profile) => {
        vi.stubEnv('HOSTINGER_API_TOKEN', token);
        vi.stubEnv('HOSTINGER_WHOIS_PROFILE_ID', profile);

        const c = createContainer();

        expect(c.domainRegistrar).toBeUndefined();
    });

    it('con un perfil que no es un entero positivo falla al arrancar, no lo trata como ausente', () => {
        vi.stubEnv('HOSTINGER_API_TOKEN', 'tok_de_prueba');
        vi.stubEnv('HOSTINGER_WHOIS_PROFILE_ID', 'abc');

        expect(() => createContainer()).toThrow(/perfil WHOIS/);
    });
});
