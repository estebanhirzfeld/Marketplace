import { describe, it, expect, vi } from 'vitest';
import { UserRole } from '@marketplace/shared-types';
import { LinkSellerPaymentAccountUseCase } from '../../../src/use-cases/payment-account/LinkSellerPaymentAccountUseCase';
import { GetSellerPaymentAccountStatusUseCase } from '../../../src/use-cases/payment-account/GetSellerPaymentAccountStatusUseCase';
import { UnlinkSellerPaymentAccountUseCase } from '../../../src/use-cases/payment-account/UnlinkSellerPaymentAccountUseCase';
import { GetSellerAccessTokenUseCase } from '../../../src/use-cases/payment-account/GetSellerAccessTokenUseCase';
import { ISellerPaymentAccountRepository } from '../../../src/ports/Repositories';
import {
    IMercadoPagoOAuthClient,
    MercadoPagoTokens,
} from '../../../src/ports/IMercadoPagoOAuthClient';
import { Actor } from '../../../src/ports/Actor';
import { SellerPaymentAccount } from '../../../src/entities/SellerPaymentAccount';
import { UniqueEntityID } from '../../../src/value-objects/UniqueEntityID';
import {
    ForbiddenError,
    InvalidStateError,
    NotFoundError,
    ValidationError,
} from '../../../src/errors/DomainError';

// ── Fakes ────────────────────────────────────────────────

const AHORA = new Date('2026-10-05T12:00:00.000Z');
const MINUTO = 60 * 1000;
const clock = () => AHORA;

const SELLER: Actor = { id: new UniqueEntityID().toString(), role: UserRole.SELLER };
const ADMIN: Actor = { id: new UniqueEntityID().toString(), role: UserRole.ADMIN };

/** Repositorio en memoria: guarda la entidad tal cual, como lo haría el upsert. */
function createFakeRepo(inicial: SellerPaymentAccount[] = []) {
    const filas = new Map<string, SellerPaymentAccount>(inicial.map((a) => [a.userId.toString(), a]));
    const repo: ISellerPaymentAccountRepository = {
        findByUserId: vi.fn(async (userId: string) => filas.get(userId) ?? null),
        findByMpUserId: vi.fn(async (mpUserId: string) => {
            for (const cuenta of filas.values()) {
                if (cuenta.mpUserId === mpUserId) return cuenta;
            }
            return null;
        }),
        existsByUserId: vi.fn(async (userId: string) => filas.has(userId)),
        save: vi.fn(async (account: SellerPaymentAccount) => {
            filas.set(account.userId.toString(), account);
        }),
        deleteByUserId: vi.fn(async (userId: string) => {
            filas.delete(userId);
        }),
    };
    return { repo, filas };
}

function tokens(overrides: Partial<MercadoPagoTokens> = {}): MercadoPagoTokens {
    return {
        accessToken: 'APP_USR-acceso',
        refreshToken: 'TG-refresco',
        expiresInSeconds: 15_552_000, // ~180 días
        mpUserId: '987654',
        scope: 'offline_access read write',
        ...overrides,
    };
}

function createFakeClient(overrides: Partial<IMercadoPagoOAuthClient> = {}): IMercadoPagoOAuthClient {
    return {
        authorizationUrl: vi.fn().mockReturnValue('https://auth.mercadopago.com.ar/authorization?x=1'),
        exchangeCode: vi.fn().mockResolvedValue(tokens()),
        refresh: vi.fn().mockResolvedValue(tokens({ accessToken: 'APP_USR-nuevo', refreshToken: 'TG-nuevo' })),
        ...overrides,
    };
}

function cuenta(expiresAt: Date, overrides: { userId?: string } = {}) {
    return SellerPaymentAccount.create({
        userId: new UniqueEntityID(overrides.userId ?? SELLER.id),
        mpUserId: '987654',
        accessToken: 'APP_USR-viejo',
        refreshToken: 'TG-viejo',
        expiresAt,
        scope: 'offline_access read write',
        linkedAt: new Date('2026-09-01T00:00:00.000Z'),
    });
}

// ═════════════════════════════════════════════════════════
// LinkSellerPaymentAccountUseCase
// ═════════════════════════════════════════════════════════

describe('LinkSellerPaymentAccountUseCase', () => {
    it('canjea el código y guarda la cuenta con el vencimiento calculado desde el reloj', async () => {
        const { repo, filas } = createFakeRepo();
        const client = createFakeClient();
        const useCase = new LinkSellerPaymentAccountUseCase(repo, client, clock);

        await useCase.execute({ code: 'codigo-de-un-solo-uso', codeVerifier: 'verificador' }, SELLER);

        expect(client.exchangeCode).toHaveBeenCalledWith({
            code: 'codigo-de-un-solo-uso',
            codeVerifier: 'verificador',
        });
        const guardada = filas.get(SELLER.id)!;
        expect(guardada.mpUserId).toBe('987654');
        expect(guardada.accessToken).toBe('APP_USR-acceso');
        expect(guardada.refreshToken).toBe('TG-refresco');
        expect(guardada.scope).toBe('offline_access read write');
        expect(guardada.expiresAt).toEqual(new Date(AHORA.getTime() + 15_552_000 * 1000));
        expect(guardada.linkedAt).toEqual(AHORA);
        expect(guardada.userId.toString()).toBe(SELLER.id);
    });

    it('vincular de nuevo reemplaza la cuenta anterior', async () => {
        const { repo, filas } = createFakeRepo([cuenta(new Date('2030-01-01T00:00:00Z'))]);
        const useCase = new LinkSellerPaymentAccountUseCase(repo, createFakeClient(), clock);

        await useCase.execute({ code: 'c', codeVerifier: 'v' }, SELLER);

        expect(filas.size).toBe(1);
        expect(filas.get(SELLER.id)!.accessToken).toBe('APP_USR-acceso');
    });

    it('rechaza una cuenta de Mercado Pago que ya está vinculada a otro usuario', async () => {
        const otro = new UniqueEntityID().toString();
        const { repo, filas } = createFakeRepo([cuenta(new Date('2030-01-01T00:00:00Z'), { userId: otro })]);
        const useCase = new LinkSellerPaymentAccountUseCase(repo, createFakeClient(), clock);

        const error = await useCase.execute({ code: 'c', codeVerifier: 'v' }, SELLER).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ValidationError);
        expect((error as Error).message).toBe('Esa cuenta de Mercado Pago ya está vinculada a otro usuario.');
        expect(repo.save).not.toHaveBeenCalled();
        expect(filas.has(SELLER.id)).toBe(false);
    });

    it('vincular de nuevo la misma cuenta de Mercado Pago al mismo usuario sigue permitido', async () => {
        const { repo } = createFakeRepo([cuenta(new Date('2030-01-01T00:00:00Z'))]);
        const useCase = new LinkSellerPaymentAccountUseCase(repo, createFakeClient(), clock);

        await expect(useCase.execute({ code: 'c', codeVerifier: 'v' }, SELLER)).resolves.toBeUndefined();
        expect(repo.save).toHaveBeenCalledOnce();
    });

    it('un admin no puede vincular: es operador puro', async () => {
        const { repo } = createFakeRepo();
        const client = createFakeClient();
        const useCase = new LinkSellerPaymentAccountUseCase(repo, client, clock);

        await expect(useCase.execute({ code: 'c', codeVerifier: 'v' }, ADMIN)).rejects.toThrow(ForbiddenError);

        expect(client.exchangeCode).not.toHaveBeenCalled();
        expect(repo.save).not.toHaveBeenCalled();
    });

    it('si el canje falla, lanza un ValidationError claro que no filtra secretos', async () => {
        const { repo } = createFakeRepo();
        const client = createFakeClient({
            exchangeCode: vi.fn().mockRejectedValue(new Error('invalid_grant client_secret=SECRETO code=abc')),
        });
        const useCase = new LinkSellerPaymentAccountUseCase(repo, client, clock);

        const error = await useCase
            .execute({ code: 'abc', codeVerifier: 'v' }, SELLER)
            .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ValidationError);
        expect((error as Error).message).toBe(
            'No pudimos vincular tu cuenta de Mercado Pago: el permiso venció o ya se usó. Probá de nuevo.',
        );
        expect((error as Error).message).not.toContain('SECRETO');
        expect(repo.save).not.toHaveBeenCalled();
    });

    it('si Mercado Pago devuelve datos inválidos no guarda nada', async () => {
        const { repo } = createFakeRepo();
        const client = createFakeClient({
            exchangeCode: vi.fn().mockResolvedValue(tokens({ accessToken: '  ' })),
        });
        const useCase = new LinkSellerPaymentAccountUseCase(repo, client, clock);

        await expect(useCase.execute({ code: 'c', codeVerifier: 'v' }, SELLER)).rejects.toThrow(ValidationError);
        expect(repo.save).not.toHaveBeenCalled();
    });

    it('usa el reloj real por defecto', async () => {
        const { repo, filas } = createFakeRepo();
        const useCase = new LinkSellerPaymentAccountUseCase(repo, createFakeClient());
        const antes = Date.now();

        await useCase.execute({ code: 'c', codeVerifier: 'v' }, SELLER);

        expect(filas.get(SELLER.id)!.linkedAt.getTime()).toBeGreaterThanOrEqual(antes);
    });
});

// ═════════════════════════════════════════════════════════
// GetSellerPaymentAccountStatusUseCase
// ═════════════════════════════════════════════════════════

describe('GetSellerPaymentAccountStatusUseCase', () => {
    it('sin cuenta devuelve linked: false', async () => {
        const { repo } = createFakeRepo();
        const useCase = new GetSellerPaymentAccountStatusUseCase(repo, clock);

        expect(await useCase.execute(SELLER)).toEqual({ linked: false });
    });

    it('con cuenta devuelve los datos públicos y nunca los tokens', async () => {
        const vence = new Date(AHORA.getTime() + 60 * MINUTO);
        const { repo } = createFakeRepo([cuenta(vence)]);
        const useCase = new GetSellerPaymentAccountStatusUseCase(repo, clock);

        const estado = await useCase.execute(SELLER);

        expect(estado).toEqual({
            linked: true,
            mpUserId: '987654',
            linkedAt: new Date('2026-09-01T00:00:00.000Z'),
            expiresAt: vence,
            expired: false,
        });
        expect(JSON.stringify(estado)).not.toContain('APP_USR');
        expect(JSON.stringify(estado)).not.toContain('TG-');
    });

    it('una cuenta con el token vencido sigue vinculada pero marca expired', async () => {
        const { repo } = createFakeRepo([cuenta(new Date(AHORA.getTime() - MINUTO))]);
        const useCase = new GetSellerPaymentAccountStatusUseCase(repo, clock);

        const estado = await useCase.execute(SELLER);

        expect(estado).toMatchObject({ linked: true, expired: true });
    });

    it('solo mira la cuenta del propio actor', async () => {
        const { repo } = createFakeRepo([cuenta(new Date('2030-01-01T00:00:00Z'), { userId: ADMIN.id })]);
        const useCase = new GetSellerPaymentAccountStatusUseCase(repo, clock);

        expect(await useCase.execute(SELLER)).toEqual({ linked: false });
    });
});

// ═════════════════════════════════════════════════════════
// UnlinkSellerPaymentAccountUseCase
// ═════════════════════════════════════════════════════════

describe('UnlinkSellerPaymentAccountUseCase', () => {
    it('borra la cuenta del actor', async () => {
        const { repo, filas } = createFakeRepo([cuenta(new Date('2030-01-01T00:00:00Z'))]);
        const useCase = new UnlinkSellerPaymentAccountUseCase(repo);

        await useCase.execute(SELLER);

        expect(repo.deleteByUserId).toHaveBeenCalledWith(SELLER.id);
        expect(filas.size).toBe(0);
    });

    it('es idempotente: desvincular sin cuenta no falla', async () => {
        const { repo } = createFakeRepo();
        const useCase = new UnlinkSellerPaymentAccountUseCase(repo);

        await expect(useCase.execute(SELLER)).resolves.toBeUndefined();
        await expect(useCase.execute(SELLER)).resolves.toBeUndefined();
    });
});

// ═════════════════════════════════════════════════════════
// GetSellerAccessTokenUseCase
// ═════════════════════════════════════════════════════════

describe('GetSellerAccessTokenUseCase', () => {
    it('sin cuenta lanza NotFoundError', async () => {
        const { repo } = createFakeRepo();
        const useCase = new GetSellerAccessTokenUseCase(repo, createFakeClient(), clock);

        await expect(useCase.execute(SELLER.id)).rejects.toThrow(NotFoundError);
    });

    it('con el token vigente (más de 5 minutos) lo devuelve sin refrescar', async () => {
        const { repo } = createFakeRepo([cuenta(new Date(AHORA.getTime() + 6 * MINUTO))]);
        const client = createFakeClient();
        const useCase = new GetSellerAccessTokenUseCase(repo, client, clock);

        expect(await useCase.execute(SELLER.id)).toBe('APP_USR-viejo');
        expect(client.refresh).not.toHaveBeenCalled();
        expect(repo.save).not.toHaveBeenCalled();
    });

    it('si vence dentro de 5 minutos refresca, guarda los dos tokens y devuelve el nuevo', async () => {
        const { repo, filas } = createFakeRepo([cuenta(new Date(AHORA.getTime() + 4 * MINUTO))]);
        const client = createFakeClient({
            refresh: vi.fn().mockResolvedValue(
                tokens({ accessToken: 'APP_USR-nuevo', refreshToken: 'TG-nuevo', expiresInSeconds: 3600 }),
            ),
        });
        const useCase = new GetSellerAccessTokenUseCase(repo, client, clock);

        expect(await useCase.execute(SELLER.id)).toBe('APP_USR-nuevo');

        expect(client.refresh).toHaveBeenCalledWith('TG-viejo');
        const guardada = filas.get(SELLER.id)!;
        expect(guardada.accessToken).toBe('APP_USR-nuevo');
        expect(guardada.refreshToken).toBe('TG-nuevo');
        expect(guardada.expiresAt).toEqual(new Date(AHORA.getTime() + 3600 * 1000));
        expect(repo.save).toHaveBeenCalledOnce();
    });

    it('un token ya vencido también se refresca', async () => {
        const { repo } = createFakeRepo([cuenta(new Date(AHORA.getTime() - MINUTO))]);
        const client = createFakeClient();
        const useCase = new GetSellerAccessTokenUseCase(repo, client, clock);

        expect(await useCase.execute(SELLER.id)).toBe('APP_USR-nuevo');
    });

    it('serializa refrescos concurrentes: el token de renovación rota y se usa una sola vez', async () => {
        const { repo } = createFakeRepo([cuenta(new Date(AHORA.getTime() + MINUTO))]);
        let liberar!: (t: MercadoPagoTokens) => void;
        const client = createFakeClient({
            refresh: vi.fn().mockImplementation(
                () => new Promise<MercadoPagoTokens>((resolve) => { liberar = resolve; }),
            ),
        });
        const useCase = new GetSellerAccessTokenUseCase(repo, client, clock);

        const llamadas = [useCase.execute(SELLER.id), useCase.execute(SELLER.id), useCase.execute(SELLER.id)];
        await vi.waitFor(() => expect(client.refresh).toHaveBeenCalledTimes(1));
        liberar(tokens({ accessToken: 'APP_USR-nuevo', refreshToken: 'TG-nuevo', expiresInSeconds: 3600 }));

        expect(await Promise.all(llamadas)).toEqual(['APP_USR-nuevo', 'APP_USR-nuevo', 'APP_USR-nuevo']);
        expect(client.refresh).toHaveBeenCalledTimes(1);
        expect(repo.save).toHaveBeenCalledOnce();
    });

    it('vendedores distintos no se bloquean entre sí', async () => {
        const otro = new UniqueEntityID().toString();
        const { repo } = createFakeRepo([
            cuenta(new Date(AHORA.getTime() + MINUTO)),
            cuenta(new Date(AHORA.getTime() + MINUTO), { userId: otro }),
        ]);
        const client = createFakeClient();
        const useCase = new GetSellerAccessTokenUseCase(repo, client, clock);

        await Promise.all([useCase.execute(SELLER.id), useCase.execute(otro)]);

        expect(client.refresh).toHaveBeenCalledTimes(2);
    });

    it('después de un refresco, la llamada siguiente lee la cuenta guardada y no vuelve a refrescar', async () => {
        const { repo } = createFakeRepo([cuenta(new Date(AHORA.getTime() + MINUTO))]);
        const client = createFakeClient({
            refresh: vi.fn().mockResolvedValue(tokens({ accessToken: 'APP_USR-nuevo', expiresInSeconds: 3600 })),
        });
        const useCase = new GetSellerAccessTokenUseCase(repo, client, clock);

        await useCase.execute(SELLER.id);
        expect(await useCase.execute(SELLER.id)).toBe('APP_USR-nuevo');

        expect(client.refresh).toHaveBeenCalledTimes(1);
    });

    it('si el refresco falla, pide vincular de nuevo y NO borra la cuenta', async () => {
        const { repo, filas } = createFakeRepo([cuenta(new Date(AHORA.getTime() + MINUTO))]);
        const client = createFakeClient({
            refresh: vi.fn().mockRejectedValue(new Error('invalid_grant refresh_token=TG-viejo')),
        });
        const useCase = new GetSellerAccessTokenUseCase(repo, client, clock);

        const error = await useCase.execute(SELLER.id).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(InvalidStateError);
        expect((error as Error).message).toMatch(/vincul/i);
        expect((error as Error).message).not.toContain('TG-viejo');
        expect(repo.deleteByUserId).not.toHaveBeenCalled();
        expect(filas.has(SELLER.id)).toBe(true);
        expect(repo.save).not.toHaveBeenCalled();
    });

    it('tras un refresco fallido el siguiente intento vuelve a probar', async () => {
        const { repo } = createFakeRepo([cuenta(new Date(AHORA.getTime() + MINUTO))]);
        const refresh = vi
            .fn()
            .mockRejectedValueOnce(new Error('caída de red'))
            .mockResolvedValueOnce(tokens({ accessToken: 'APP_USR-nuevo', expiresInSeconds: 3600 }));
        const useCase = new GetSellerAccessTokenUseCase(repo, createFakeClient({ refresh }), clock);

        await expect(useCase.execute(SELLER.id)).rejects.toThrow(InvalidStateError);
        expect(await useCase.execute(SELLER.id)).toBe('APP_USR-nuevo');
    });
});

// ═════════════════════════════════════════════════════════
// GetSellerAccessTokenUseCase — guardado fallido tras renovar (T5.1)
// ═════════════════════════════════════════════════════════

describe('GetSellerAccessTokenUseCase — guardado fallido tras renovar', () => {
    /** Copia de la cuenta: simula una fila de la base, que no comparte objeto con quien la leyó. */
    function copiar(a: SellerPaymentAccount): SellerPaymentAccount {
        return SellerPaymentAccount.reconstitute(
            {
                userId: a.userId,
                mpUserId: a.mpUserId,
                accessToken: a.accessToken,
                refreshToken: a.refreshToken,
                expiresAt: a.expiresAt,
                scope: a.scope,
                linkedAt: a.linkedAt,
            },
            a.id,
            a.createdAt,
        );
    }

    /** Repositorio que guarda copias y deja fallar los próximos `save`. */
    function createFlakyRepo(inicial: SellerPaymentAccount) {
        const filas = new Map<string, SellerPaymentAccount>([[inicial.userId.toString(), copiar(inicial)]]);
        const estado = { fallosPendientes: 0 };
        const repo: ISellerPaymentAccountRepository = {
            findByUserId: vi.fn(async (userId: string) => {
                const fila = filas.get(userId);
                return fila ? copiar(fila) : null;
            }),
            findByMpUserId: vi.fn(async () => null),
            existsByUserId: vi.fn(async (userId: string) => filas.has(userId)),
            save: vi.fn(async (account: SellerPaymentAccount) => {
                if (estado.fallosPendientes > 0) {
                    estado.fallosPendientes--;
                    throw new Error('conexión perdida con la base');
                }
                filas.set(account.userId.toString(), copiar(account));
            }),
            deleteByUserId: vi.fn(async (userId: string) => {
                filas.delete(userId);
            }),
        };
        return { repo, filas, estado };
    }

    const POR_VENCER = () => cuenta(new Date(AHORA.getTime() + MINUTO));

    it('si el guardado falla una vez lo reintenta y queda persistido', async () => {
        const { repo, filas, estado } = createFlakyRepo(POR_VENCER());
        estado.fallosPendientes = 1;
        const useCase = new GetSellerAccessTokenUseCase(repo, createFakeClient(), clock);

        expect(await useCase.execute(SELLER.id)).toBe('APP_USR-nuevo');

        expect(repo.save).toHaveBeenCalledTimes(2);
        expect(filas.get(SELLER.id)!.accessToken).toBe('APP_USR-nuevo');
        expect(filas.get(SELLER.id)!.refreshToken).toBe('TG-nuevo');
    });

    it('si el guardado falla dos veces igual devuelve el token renovado', async () => {
        const { repo, filas, estado } = createFlakyRepo(POR_VENCER());
        estado.fallosPendientes = 2;
        const useCase = new GetSellerAccessTokenUseCase(repo, createFakeClient(), clock);

        expect(await useCase.execute(SELLER.id)).toBe('APP_USR-nuevo');

        expect(repo.save).toHaveBeenCalledTimes(2);
        // La base quedó con el token viejo, ya invalidado por la rotación.
        expect(filas.get(SELLER.id)!.refreshToken).toBe('TG-viejo');
    });

    it('en la llamada siguiente persiste la cuenta pendiente sin volver a refrescar', async () => {
        const { repo, filas, estado } = createFlakyRepo(POR_VENCER());
        estado.fallosPendientes = 2;
        const client = createFakeClient({
            refresh: vi.fn().mockResolvedValue(
                tokens({ accessToken: 'APP_USR-nuevo', refreshToken: 'TG-nuevo', expiresInSeconds: 3600 }),
            ),
        });
        const useCase = new GetSellerAccessTokenUseCase(repo, client, clock);
        await useCase.execute(SELLER.id);

        expect(await useCase.execute(SELLER.id)).toBe('APP_USR-nuevo');

        expect(client.refresh).toHaveBeenCalledTimes(1);
        // Rotación: lo guardado termina siendo el token de renovación NUEVO.
        expect(filas.get(SELLER.id)!.accessToken).toBe('APP_USR-nuevo');
        expect(filas.get(SELLER.id)!.refreshToken).toBe('TG-nuevo');

        // Ya persistida: una tercera llamada no vuelve a guardar.
        const guardados = (repo.save as ReturnType<typeof vi.fn>).mock.calls.length;
        await useCase.execute(SELLER.id);
        expect((repo.save as ReturnType<typeof vi.fn>).mock.calls.length).toBe(guardados);
    });

    it('si el guardado pendiente vuelve a fallar, sigue usando la cuenta renovada', async () => {
        const { repo, filas, estado } = createFlakyRepo(POR_VENCER());
        estado.fallosPendientes = 3;
        const client = createFakeClient();
        const useCase = new GetSellerAccessTokenUseCase(repo, client, clock);
        await useCase.execute(SELLER.id);

        expect(await useCase.execute(SELLER.id)).toBe('APP_USR-nuevo');
        expect(client.refresh).toHaveBeenCalledTimes(1);
        expect(filas.get(SELLER.id)!.refreshToken).toBe('TG-viejo');

        // La base se recupera: la llamada siguiente la deja al día.
        await useCase.execute(SELLER.id);
        expect(filas.get(SELLER.id)!.refreshToken).toBe('TG-nuevo');
    });

    it('un nuevo refresco parte del token de renovación NUEVO, no del que quedó en la base', async () => {
        const { repo, estado } = createFlakyRepo(POR_VENCER());
        estado.fallosPendientes = 2;
        let ahora = AHORA;
        const refresh = vi
            .fn()
            .mockResolvedValueOnce(tokens({ accessToken: 'A1', refreshToken: 'R1', expiresInSeconds: 600 }))
            .mockResolvedValueOnce(tokens({ accessToken: 'A2', refreshToken: 'R2', expiresInSeconds: 3600 }));
        const useCase = new GetSellerAccessTokenUseCase(repo, createFakeClient({ refresh }), () => ahora);
        await useCase.execute(SELLER.id);

        // Pasan 6 minutos: el token de 10 minutos queda a menos de 5 de vencer.
        ahora = new Date(AHORA.getTime() + 6 * MINUTO);
        expect(await useCase.execute(SELLER.id)).toBe('A2');

        expect(refresh).toHaveBeenNthCalledWith(1, 'TG-viejo');
        expect(refresh).toHaveBeenNthCalledWith(2, 'R1');
    });

    it('si el usuario desvinculó mientras tanto, descarta la cuenta pendiente', async () => {
        const { repo, filas, estado } = createFlakyRepo(POR_VENCER());
        estado.fallosPendientes = 2;
        const useCase = new GetSellerAccessTokenUseCase(repo, createFakeClient(), clock);
        await useCase.execute(SELLER.id);

        filas.delete(SELLER.id);

        await expect(useCase.execute(SELLER.id)).rejects.toThrow(NotFoundError);
        expect(filas.has(SELLER.id)).toBe(false);
    });

    it('no filtra los tokens en ningún error ni en la consola', async () => {
        const { repo, estado } = createFlakyRepo(POR_VENCER());
        estado.fallosPendientes = 2;
        const registro = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const advertencia = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const useCase = new GetSellerAccessTokenUseCase(repo, createFakeClient(), clock);

        await useCase.execute(SELLER.id);

        const salida = JSON.stringify([...registro.mock.calls, ...advertencia.mock.calls]);
        expect(salida).not.toContain('APP_USR');
        expect(salida).not.toContain('TG-');
        registro.mockRestore();
        advertencia.mockRestore();
    });
});
