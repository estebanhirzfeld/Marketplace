import { describe, it, expect } from 'vitest';
import { resolveListenHost } from '../src/config/network';

/**
 * El único que habla con la API es el código de servidor de Next, sobre la
 * misma máquina. Que escuche en 0.0.0.0 deja el puerto expuesto y hace que la
 * única defensa sea el firewall; escuchar en loopback lo vuelve inalcanzable
 * desde afuera aunque el firewall esté mal configurado.
 */
describe('resolveListenHost', () => {
    it('escucha solo en loopback cuando no se configura nada', () => {
        expect(resolveListenHost({})).toBe('127.0.0.1');
    });

    it('respeta API_HOST cuando se lo define', () => {
        expect(resolveListenHost({ API_HOST: '0.0.0.0' })).toBe('0.0.0.0');
    });

    it('ignora un API_HOST vacío o en blanco', () => {
        expect(resolveListenHost({ API_HOST: '' })).toBe('127.0.0.1');
        expect(resolveListenHost({ API_HOST: '   ' })).toBe('127.0.0.1');
    });

    it('recorta los espacios alrededor del valor', () => {
        expect(resolveListenHost({ API_HOST: ' 0.0.0.0 ' })).toBe('0.0.0.0');
    });
});
