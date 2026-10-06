import { describe, it, expect } from 'vitest';
import { SellerPaymentAccount } from '../src/entities/SellerPaymentAccount';
import { UniqueEntityID } from '../src/value-objects/UniqueEntityID';
import { ValidationError } from '../src/errors/DomainError';

const AHORA = new Date('2026-10-05T12:00:00Z');
const EN_SEIS_HORAS = new Date('2026-10-05T18:00:00Z');

function datosValidos() {
    return {
        userId: new UniqueEntityID(),
        mpUserId: '123456789',
        accessToken: 'APP_USR-acceso',
        refreshToken: 'TG-refresco',
        expiresAt: EN_SEIS_HORAS,
        scope: 'offline_access read write',
        linkedAt: AHORA,
    };
}

describe('SellerPaymentAccount — creación', () => {
    it('crea la cuenta con los datos recibidos', () => {
        const datos = datosValidos();

        const cuenta = SellerPaymentAccount.create(datos);

        expect(cuenta.userId.equals(datos.userId)).toBe(true);
        expect(cuenta.mpUserId).toBe('123456789');
        expect(cuenta.accessToken).toBe('APP_USR-acceso');
        expect(cuenta.refreshToken).toBe('TG-refresco');
        expect(cuenta.expiresAt).toEqual(EN_SEIS_HORAS);
        expect(cuenta.scope).toBe('offline_access read write');
        expect(cuenta.linkedAt).toEqual(AHORA);
    });

    it.each(['mpUserId', 'accessToken', 'refreshToken', 'scope'] as const)(
        'rechaza %s vacío o en blanco',
        (campo) => {
            expect(() => SellerPaymentAccount.create({ ...datosValidos(), [campo]: '' })).toThrow(ValidationError);
            expect(() => SellerPaymentAccount.create({ ...datosValidos(), [campo]: '   ' })).toThrow(ValidationError);
        },
    );

    it('rechaza una fecha de vencimiento inválida', () => {
        expect(() =>
            SellerPaymentAccount.create({ ...datosValidos(), expiresAt: new Date('no es fecha') }),
        ).toThrow(ValidationError);
    });
});

describe('SellerPaymentAccount — rehidratación', () => {
    it('no valida ni completa nada: devuelve lo guardado tal cual', () => {
        const id = new UniqueEntityID();
        const creada = new Date('2026-01-01T00:00:00Z');
        const datos = { ...datosValidos(), accessToken: '', scope: '' };

        const cuenta = SellerPaymentAccount.reconstitute(datos, id, creada);

        expect(cuenta.id.equals(id)).toBe(true);
        expect(cuenta.createdAt).toEqual(creada);
        expect(cuenta.accessToken).toBe('');
        expect(cuenta.scope).toBe('');
        expect(cuenta.linkedAt).toEqual(AHORA);
    });
});

describe('SellerPaymentAccount — vencimiento', () => {
    it('no está vencida antes de expiresAt', () => {
        const cuenta = SellerPaymentAccount.create(datosValidos());

        expect(cuenta.isExpired(AHORA)).toBe(false);
    });

    it('está vencida justo en expiresAt y después', () => {
        const cuenta = SellerPaymentAccount.create(datosValidos());

        expect(cuenta.isExpired(EN_SEIS_HORAS)).toBe(true);
        expect(cuenta.isExpired(new Date(EN_SEIS_HORAS.getTime() + 1))).toBe(true);
    });
});

describe('SellerPaymentAccount — renovación', () => {
    const NUEVO_VENCIMIENTO = new Date('2026-10-06T00:00:00Z');

    it('reemplaza los tokens y el vencimiento y conserva el resto', () => {
        const cuenta = SellerPaymentAccount.create(datosValidos());

        cuenta.renew({
            accessToken: 'nuevo-acceso',
            refreshToken: 'nuevo-refresco',
            expiresAt: NUEVO_VENCIMIENTO,
            now: new Date('2026-10-05T17:00:00Z'),
        });

        expect(cuenta.accessToken).toBe('nuevo-acceso');
        expect(cuenta.refreshToken).toBe('nuevo-refresco');
        expect(cuenta.expiresAt).toEqual(NUEVO_VENCIMIENTO);
        expect(cuenta.mpUserId).toBe('123456789');
        expect(cuenta.linkedAt).toEqual(AHORA);
    });

    it('una cuenta vencida deja de estarlo tras renovarse', () => {
        const cuenta = SellerPaymentAccount.create(datosValidos());
        const ahora = new Date('2026-10-05T19:00:00Z');
        expect(cuenta.isExpired(ahora)).toBe(true);

        cuenta.renew({ accessToken: 'a', refreshToken: 'b', expiresAt: NUEVO_VENCIMIENTO, now: ahora });

        expect(cuenta.isExpired(ahora)).toBe(false);
    });

    it('rechaza tokens vacíos sin modificar la cuenta', () => {
        const cuenta = SellerPaymentAccount.create(datosValidos());

        expect(() =>
            cuenta.renew({ accessToken: '', refreshToken: 'b', expiresAt: NUEVO_VENCIMIENTO, now: AHORA }),
        ).toThrow(ValidationError);
        expect(() =>
            cuenta.renew({ accessToken: 'a', refreshToken: ' ', expiresAt: NUEVO_VENCIMIENTO, now: AHORA }),
        ).toThrow(ValidationError);
        expect(cuenta.accessToken).toBe('APP_USR-acceso');
    });

    it('rechaza un vencimiento inválido o que ya pasó', () => {
        const cuenta = SellerPaymentAccount.create(datosValidos());

        expect(() =>
            cuenta.renew({ accessToken: 'a', refreshToken: 'b', expiresAt: new Date('x'), now: AHORA }),
        ).toThrow(ValidationError);
        expect(() =>
            cuenta.renew({ accessToken: 'a', refreshToken: 'b', expiresAt: AHORA, now: AHORA }),
        ).toThrow(ValidationError);
        expect(cuenta.expiresAt).toEqual(EN_SEIS_HORAS);
    });
});
