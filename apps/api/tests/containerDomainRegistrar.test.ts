import { describe, it, expect, afterEach, vi } from 'vitest';
import { createContainer } from '../src/container';
import { HostingerDomainRegistrar } from '../src/adapters/HostingerDomainRegistrar';
import { RdapDomainRegistryLookup } from '../src/adapters/RdapDomainRegistryLookup';

/** El cableado del registrador de dominios según el entorno. No toca la base ni la red. */

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('Contenedor — registrador de dominios', () => {
    it('con el token arma el registrador de Hostinger: el perfil WHOIS ya no se configura', () => {
        vi.stubEnv('HOSTINGER_API_TOKEN', 'tok_de_prueba');

        const c = createContainer();

        expect(c.domainRegistrar).toBeInstanceOf(HostingerDomainRegistrar);
    });

    it.each([
        ['sin token', ''],
        ['token en blanco', '   '],
    ])('%s no arma nada', (_name, token) => {
        vi.stubEnv('HOSTINGER_API_TOKEN', token);

        const c = createContainer();

        expect(c.domainRegistrar).toBeUndefined();
    });

    it('la consulta del registro público de dominios no depende del token: la firma de un sitio la necesita siempre', () => {
        vi.stubEnv('HOSTINGER_API_TOKEN', '');

        expect(createContainer().domainRegistryLookup).toBeInstanceOf(RdapDomainRegistryLookup);
    });

    it('un HOSTINGER_WHOIS_PROFILE_ID que quedó de antes no impide arrancar', () => {
        vi.stubEnv('HOSTINGER_API_TOKEN', 'tok_de_prueba');
        vi.stubEnv('HOSTINGER_WHOIS_PROFILE_ID', 'abc');

        expect(createContainer().domainRegistrar).toBeInstanceOf(HostingerDomainRegistrar);
    });
});
