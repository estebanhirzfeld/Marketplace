import { describe, it, expect } from 'vitest';
import { isPublicIPv4 } from '../src/adapters/isPublicIPv4';

describe('isPublicIPv4', () => {
    it.each(['1.1.1.1', '8.8.8.8', '203.0.113.7', '172.15.255.255', '172.32.0.1', '100.63.255.255', '100.128.0.1', '198.17.0.1', '198.20.0.1'])(
        '%s es pública',
        (ip) => {
            expect(isPublicIPv4(ip)).toBe(true);
        },
    );

    it.each([
        '0.0.0.0',
        '0.1.2.3',
        '10.0.0.5',
        '10.255.255.255',
        '100.64.0.1',
        '100.127.255.255',
        '127.0.0.1',
        '169.254.169.254',
        '172.16.0.1',
        '172.31.255.255',
        '192.0.0.8',
        '192.168.1.1',
        '198.18.0.1',
        '198.19.255.255',
        '224.0.0.1',
        '239.255.255.255',
        '240.0.0.1',
        '255.255.255.255',
    ])('%s no es pública', (ip) => {
        expect(isPublicIPv4(ip)).toBe(false);
    });

    it.each(['', 'abc', '1.2.3', '1.2.3.4.5', '256.1.1.1', '1.2.3.-4', '01.2.3.4x', '::1', '1.2.3.4 '])(
        '%j no es una dirección válida y se descarta',
        (ip) => {
            expect(isPublicIPv4(ip)).toBe(false);
        },
    );
});
