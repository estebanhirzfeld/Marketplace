import { describe, it, expect } from 'vitest';
import { ApiError } from '@marketplace/api-client';
import {
    classifyConnectionError,
    createConnectionState,
    describeConnectionFailure,
    parseConnectionReason,
} from '@/lib/youtubeConnection';

/**
 * El vendedor vuelve de Google a `/vender` con un motivo en la dirección. Los
 * tests fijan qué texto ve por cada motivo y que un motivo o un detalle
 * inventados en la dirección no le pongan palabras en la boca a la plataforma.
 */

const FALTAN_PERMISOS =
    'Para publicar tu canal necesitamos que nos dejes las estadísticas de ingresos. ' +
    'Volvé a conectar y dejá todos los permisos tildados: solo leemos, no podemos publicar ni borrar nada.';

describe('describeConnectionFailure', () => {
    it('cancelada: dice que sin conexión no se puede publicar y ofrece intentar de nuevo', () => {
        expect(describeConnectionFailure('cancelada')).toEqual({
            text: 'No conectaste el canal. Sin conexión no se puede publicar.',
            actionLabel: 'Intentar de nuevo',
        });
    });

    it('permisos: muestra el mensaje de la API, que nombra lo que falta', () => {
        expect(describeConnectionFailure('permisos', FALTAN_PERMISOS)).toEqual({
            text: FALTAN_PERMISOS,
            actionLabel: 'Conectar de nuevo',
        });
    });

    it('permisos: un detalle que no es el de la API no se muestra', () => {
        const falso = 'Tu cuenta fue bloqueada. Escribinos a soporte-falso@ejemplo.com';

        const f = describeConnectionFailure('permisos', falso);

        expect(f.text).not.toContain('bloqueada');
        expect(f.text).toMatch(/permisos/);
        expect(f.actionLabel).toBe('Conectar de nuevo');
    });

    it('permisos: sin detalle usa un texto general', () => {
        expect(describeConnectionFailure('permisos').text).toMatch(/permisos/);
    });

    it('sin-canal: explica la cuenta de marca', () => {
        expect(describeConnectionFailure('sin-canal').text).toBe(
            'Esa cuenta de Google no tiene un canal. Si tu canal está en una cuenta de marca, elegila en la pantalla de Google.',
        );
    });

    it('no-disponible: dice que no se guardó nada y que pruebe en unos minutos', () => {
        expect(describeConnectionFailure('no-disponible').text).toBe(
            'No pudimos leer tu canal. No se guardó nada; probá de nuevo en unos minutos.',
        );
    });

    it('invalida: pide probar de nuevo', () => {
        expect(describeConnectionFailure('invalida').text).toBe(
            'La conexión no se pudo validar. Probá de nuevo.',
        );
    });
});

describe('parseConnectionReason', () => {
    it('reconoce los cinco motivos', () => {
        for (const m of ['cancelada', 'permisos', 'sin-canal', 'no-disponible', 'invalida']) {
            expect(parseConnectionReason(m)).toBe(m);
        }
    });

    it('descarta lo que no es un motivo', () => {
        expect(parseConnectionReason('hackeado')).toBeUndefined();
        expect(parseConnectionReason(undefined)).toBeUndefined();
    });
});

describe('classifyConnectionError', () => {
    it('permisos faltantes: motivo permisos con el mensaje', () => {
        const e = new ApiError('VALIDATION', FALTAN_PERMISOS, 400);

        expect(classifyConnectionError(e)).toEqual({ reason: 'permisos', detail: FALTAN_PERMISOS });
    });

    it('pedir que vuelva a conectar también es un problema de permisos', () => {
        const e = new ApiError(
            'VALIDATION',
            'No pudimos leer tu canal con este permiso. Volvé a conectarlo y aceptá todos los permisos.',
            400,
        );

        expect(classifyConnectionError(e).reason).toBe('permisos');
    });

    it('cuenta sin canal: motivo sin-canal', () => {
        const e = new ApiError(
            'VALIDATION',
            'Esa cuenta de Google no tiene un canal. Si tu canal está en una cuenta de marca, elegila en la pantalla de Google.',
            400,
        );

        expect(classifyConnectionError(e)).toEqual({ reason: 'sin-canal' });
    });

    it('Google caído o integración sin configurar: no-disponible', () => {
        expect(classifyConnectionError(new ApiError('SERVICE_UNAVAILABLE', 'x', 503)).reason).toBe('no-disponible');
    });

    it('un fallo de red es no-disponible', () => {
        expect(classifyConnectionError(new Error('fetch failed')).reason).toBe('no-disponible');
    });

    it('un código vencido o usado es invalida', () => {
        const e = new ApiError(
            'VALIDATION',
            'No pudimos conectar tu canal: el permiso venció o ya se usó. Probá de nuevo.',
            400,
        );

        expect(classifyConnectionError(e).reason).toBe('invalida');
    });
});

describe('createConnectionState', () => {
    it('es aleatorio y no trae los dos puntos con los que se reconoce el modo viejo', () => {
        const a = createConnectionState();
        const b = createConnectionState();

        expect(a).not.toBe(b);
        expect(a).toMatch(/^[0-9a-f]{32}$/);
    });
});
