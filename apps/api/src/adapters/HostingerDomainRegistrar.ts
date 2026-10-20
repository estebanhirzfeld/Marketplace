import {
    IDomainRegistrar,
    RegistrarDomainStatus,
    RegistrarMove,
    RegistrarMoveStatus,
    RegistrarPortfolioEntry,
} from '@marketplace/domain/src/ports/IDomainRegistrar';
import {
    DomainPremiumProtectionError,
    DomainRegistrarRejectedError,
    ServiceUnavailableError,
} from '@marketplace/domain/src/errors/DomainError';
import { DomainName } from '@marketplace/domain/src/value-objects/DomainName';
import { Email } from '@marketplace/domain/src/value-objects/Email';

const DEFAULT_BASE_URL = 'https://developers.hostinger.com';
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_RETRY_AFTER_MS = 1_000;
const MAX_RETRY_AFTER_MS = 5_000;

/** Los estados que enumera la especificación OpenAPI de Hostinger. */
const DOMAIN_STATUSES: readonly RegistrarDomainStatus[] = [
    'active',
    'pending_setup',
    'expired',
    'requested',
    'pending_verification',
    'deleted',
    'suspended',
    'failed',
];
const MOVE_STATUSES: readonly RegistrarMoveStatus[] = ['initiated', 'activating', 'completed'];

export interface HostingerDomainRegistrarOptions {
    /** Token de la API (esquema `apiToken`, Bearer). Nunca se registra ni viaja en un error. */
    token: string;
    /**
     * Perfil WHOIS de la cuenta de la plataforma. Hostinger pide los cuatro
     * contactos al aceptar un traslado; la plataforma usa el mismo para todos.
     */
    whoisProfileId: number;
    baseUrl?: string;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    /** Inyectable para no esperar de verdad el `Retry-After` en los tests. */
    sleep?: (ms: number) => Promise<void>;
}

type Reply = { found: true; body: unknown } | { found: false };

/** Respuesta 429: cuánto pide esperar el registrador antes de reintentar. */
interface RateLimited {
    retryAfterMs: number;
}

function unavailable(cause?: unknown): ServiceUnavailableError {
    return new ServiceUnavailableError(
        'No pudimos comunicarnos con el registrador de dominios en este momento. Probá de nuevo en unos minutos.',
        { cause },
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function oneOf<T extends string>(allowed: readonly T[], value: unknown): T {
    const match = allowed.find((candidate) => candidate === value);
    // Un estado fuera de la especificación no se interpreta: quien decide con
    // él (aceptar, entregar) no debe actuar a ciegas.
    if (match === undefined) throw unavailable(new Error('estado no enumerado por el registrador'));
    return match;
}

function dateOrNull(value: unknown): Date | null {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string') throw unavailable(new Error('fecha inválida'));
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw unavailable(new Error('fecha inválida'));
    return date;
}

function requiredDate(value: unknown): Date {
    const date = dateOrNull(value);
    if (date === null) throw unavailable(new Error('falta una fecha'));
    return date;
}

/** `Retry-After` en segundos, acotado; cualquier otra forma usa la espera por defecto. */
function retryDelayMs(header: string | null): number {
    const seconds = header !== null && /^\d+$/.test(header.trim()) ? Number(header.trim()) : undefined;
    if (seconds === undefined) return DEFAULT_RETRY_AFTER_MS;
    return Math.min(seconds * 1_000, MAX_RETRY_AFTER_MS);
}

/**
 * Cuenta de Hostinger de la plataforma, por su API de dominios.
 *
 * Cada llamada tiene tiempo máximo y un único reintento ante 429 (respetando
 * `Retry-After`, acotado). Las lecturas devuelven `null` ante 404. Los
 * mensajes de error son propios y nunca incluyen la respuesta del registrador
 * ni el token: lo que dijo Hostinger queda solo en `cause`, que el transporte
 * registra y no muestra.
 *
 * Los estados de la especificación son cerrados: uno desconocido se informa
 * como no disponible en vez de adivinarse.
 */
export class HostingerDomainRegistrar implements IDomainRegistrar {
    private readonly token: string;
    private readonly whoisProfileId: number;
    private readonly baseUrl: string;
    private readonly fetchImpl: typeof fetch;
    private readonly timeoutMs: number;
    private readonly sleep: (ms: number) => Promise<void>;

    constructor(options: HostingerDomainRegistrarOptions) {
        const token = options.token.trim();
        if (token === '') throw new Error('Falta el token de la API de Hostinger.');
        if (!Number.isInteger(options.whoisProfileId) || options.whoisProfileId <= 0) {
            throw new Error('El perfil WHOIS de Hostinger debe ser un entero positivo.');
        }

        this.token = token;
        this.whoisProfileId = options.whoisProfileId;
        this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
        this.fetchImpl = options.fetchImpl ?? fetch;
        this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    }

    async getPortfolioEntry(domain: DomainName): Promise<RegistrarPortfolioEntry | null> {
        const reply = await this.send('GET', `/api/domains/v1/portfolio/${this.name(domain)}`);
        if (!reply.found) return null;

        const body = reply.body;
        if (!isRecord(body)) throw unavailable(new Error('respuesta inesperada'));
        return {
            domain,
            status: oneOf(DOMAIN_STATUSES, body.status),
            // El bloqueo de transferencia: ausente se toma como no bloqueado.
            isLocked: body.is_locked === true,
            sixtyDayLockExpiresAt: dateOrNull(body['60_days_lock_expires_at']),
            registeredAt: dateOrNull(body.registered_at),
            expiresAt: dateOrNull(body.expires_at),
        };
    }

    async getIncomingMove(domain: DomainName): Promise<RegistrarMove | null> {
        return this.readMove(domain, `/api/domains/v1/move/incoming/${this.name(domain)}`);
    }

    async acceptIncomingMove(domain: DomainName): Promise<void> {
        const id = this.whoisProfileId;
        await this.send('PUT', `/api/domains/v1/move/incoming/${this.name(domain)}`, {
            domain_contacts: { owner_id: id, admin_id: id, billing_id: id, tech_id: id },
        });
    }

    async getOutgoingMove(domain: DomainName): Promise<RegistrarMove | null> {
        return this.readMove(domain, `/api/domains/v1/move/outgoing/${this.name(domain)}`);
    }

    async startOutgoingMove(domain: DomainName, recipientEmail: Email): Promise<void> {
        await this.send('POST', `/api/domains/v1/move/outgoing/${this.name(domain)}`, {
            new_customer_email: recipientEmail.getValue(),
        });
    }

    async cancelOutgoingMove(domain: DomainName): Promise<void> {
        await this.send('DELETE', `/api/domains/v1/move/outgoing/${this.name(domain)}`);
    }

    async getAuthCode(domain: DomainName): Promise<string | null> {
        const reply = await this.send('GET', `/api/domains/v1/portfolio/${this.name(domain)}/auth-code`);
        if (!reply.found) return null;

        if (!isRecord(reply.body)) throw unavailable(new Error('respuesta inesperada'));
        const code = reply.body.auth_code;
        if (code === undefined || code === null || code === '') return null;
        if (typeof code !== 'string') throw unavailable(new Error('respuesta inesperada'));
        return code;
    }

    private async readMove(domain: DomainName, path: string): Promise<RegistrarMove | null> {
        const reply = await this.send('GET', path);
        if (!reply.found) return null;

        const body = reply.body;
        if (!isRecord(body)) throw unavailable(new Error('respuesta inesperada'));
        return {
            domain,
            status: oneOf(MOVE_STATUSES, body.status),
            createdAt: requiredDate(body.created_at),
            updatedAt: requiredDate(body.updated_at),
        };
    }

    /** El nombre ya normalizado, codificado para ir como segmento de la ruta. */
    private name(domain: DomainName): string {
        return encodeURIComponent(domain.value);
    }

    /**
     * Un pedido, con un único reintento ante 429. En lecturas y escrituras 404
     * vuelve como `found: false`; quien escribe lo traduce a rechazo.
     */
    private async send(method: string, path: string, body?: unknown): Promise<Reply> {
        let reply = await this.attempt(method, path, body);
        if ('retryAfterMs' in reply) {
            await this.sleep(reply.retryAfterMs);
            reply = await this.attempt(method, path, body);
        }
        if ('retryAfterMs' in reply) throw unavailable(new Error('límite de uso del registrador (429)'));

        if (!reply.found && method !== 'GET') {
            throw new DomainRegistrarRejectedError('El registrador no encontró el dominio o el traslado pedido.');
        }
        return reply;
    }

    private async attempt(method: string, path: string, body?: unknown): Promise<Reply | RateLimited> {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);

        try {
            const headers: Record<string, string> = {
                Authorization: `Bearer ${this.token}`,
                Accept: 'application/json',
            };
            if (body !== undefined) headers['Content-Type'] = 'application/json';

            let response: Response;
            try {
                response = await this.fetchImpl(`${this.baseUrl}${path}`, {
                    method,
                    headers,
                    body: body === undefined ? undefined : JSON.stringify(body),
                    signal: controller.signal,
                });
            } catch (error) {
                // Red caída o tiempo agotado. El error original puede nombrar la
                // URL o las cabeceras: se descarta, solo se conserva su tipo.
                throw unavailable(error instanceof Error ? new Error(error.name) : undefined);
            }

            return await this.interpret(response);
        } finally {
            clearTimeout(timer);
        }
    }

    private async interpret(response: Response): Promise<Reply | RateLimited> {
        const status = response.status;

        if (status === 429) {
            return { retryAfterMs: retryDelayMs(response.headers.get('retry-after')) };
        }
        if (status === 404) return { found: false };
        if (status === 428) {
            throw new DomainPremiumProtectionError(
                'El registrador exige un paso manual adicional (protección premium) para operar este dominio.',
            );
        }
        // Credenciales vencidas o sin permiso: no es un problema del dominio ni
        // de quien pidió, y no se arregla reintentando la misma operación.
        if (status === 401 || status === 403 || status >= 500) {
            throw unavailable(new Error(`el registrador respondió ${status}`));
        }
        if (status >= 400) {
            throw new DomainRegistrarRejectedError('El registrador rechazó el pedido para este dominio.', {
                cause: new Error(`el registrador respondió ${status}`),
            });
        }

        try {
            return { found: true, body: await response.json() };
        } catch (error) {
            throw unavailable(error instanceof Error ? new Error(error.name) : undefined);
        }
    }
}
