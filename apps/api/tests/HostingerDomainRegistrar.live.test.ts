import { describe, it, expect } from 'vitest';
import { DomainName } from '@marketplace/domain/src/value-objects/DomainName';
import { HostingerDomainRegistrar } from '../src/adapters/HostingerDomainRegistrar';

/**
 * Prueba contra la API real de Hostinger, de solo lectura. Sale a la red y usa
 * el token de la cuenta, así que solo corre a pedido:
 * `HOSTINGER_API_TOKEN=... HOSTINGER_LIVE_DOMAIN=ejemplo.com vitest run tests/HostingerDomainRegistrar.live.test.ts`.
 *
 * Imprime los estados reales para fijarlos antes de usarlos en la custodia.
 * Nunca acepta, inicia ni cancela un traslado.
 */
const token = process.env.HOSTINGER_API_TOKEN;
const domain = DomainName.parse(process.env.HOSTINGER_LIVE_DOMAIN ?? 'deliaorrego.online');

describe.skipIf(!token)('HostingerDomainRegistrar contra la API real', { timeout: 30_000 }, () => {
    // El perfil WHOIS solo se usa al aceptar un traslado, que acá no se hace.
    const registrar = new HostingerDomainRegistrar({ token: token ?? 'sin-token', whoisProfileId: 1 });

    it('lee el dominio del portfolio, o null si no está en la cuenta', async () => {
        const entry = await registrar.getPortfolioEntry(domain);
        console.log('portfolio:', entry);

        if (entry !== null) expect(entry.domain.equals(domain)).toBe(true);
    });

    it('lee el traslado entrante, o null si no hay', async () => {
        const move = await registrar.getIncomingMove(domain);
        console.log('move entrante:', move);

        if (move !== null) expect(move.domain.equals(domain)).toBe(true);
    });
});
