import {
    DomainRegistryRecord,
    IDomainRegistryLookup,
} from '@marketplace/domain/src/ports/IDomainRegistryLookup';
import { ServiceUnavailableError } from '@marketplace/domain/src/errors/DomainError';
import { DomainName } from '@marketplace/domain/src/value-objects/DomainName';

/*
 * rdap.org redirige al servidor RDAP del registro de cada terminación (según
 * el arranque de IANA), así que no hace falta mantener esa tabla acá. `fetch`
 * sigue la redirección solo.
 */
const DEFAULT_BASE_URL = 'https://rdap.org';
const DEFAULT_TIMEOUT_MS = 8_000;
/** rdap.org responde 403 al «node» que manda `fetch` por defecto: hay que identificarse. */
const USER_AGENT = 'Marketplace-RDAP/1.0';
const UNAVAILABLE ='No pudimos consultar el registro del dominio. Volvé a intentar en unos minutos.';

export interface RdapDomainRegistryLookupOptions {
    baseUrl?: string;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
}

interface RdapEntity {
    roles?: string[];
    publicIds?: { type?: string; identifier?: string }[];
    vcardArray?: [string, unknown[][]];
}

interface RdapDomain {
    status?: string[];
    events?: { eventAction?: string; eventDate?: string }[];
    entities?: RdapEntity[];
}

/**
 * Consulta el registro público de un dominio (RDAP, RFC 9083). Es la única
 * mirada sobre un dominio que todavía está en la cuenta del vendedor: la API
 * de Hostinger solo ve la de la plataforma.
 *
 * Cualquier respuesta que no se pueda leer se informa como no disponible: sin
 * respuesta clara no se puede dar un dominio por listo para firmar.
 */
export class RdapDomainRegistryLookup implements IDomainRegistryLookup {
    private readonly baseUrl: string;
    private readonly fetchImpl: typeof fetch;
    private readonly timeoutMs: number;

    constructor(options: RdapDomainRegistryLookupOptions = {}) {
        this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
        this.fetchImpl = options.fetchImpl ?? fetch;
        this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    }

    async lookup(domain: DomainName): Promise<DomainRegistryRecord | null> {
        const body = await this.fetchDomain(domain);
        if (body === null) return null;
        return toRecord(body);
    }

    private async fetchDomain(domain: DomainName): Promise<RdapDomain | null> {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const response = await this.fetchImpl(`${this.baseUrl}/domain/${encodeURIComponent(domain.value)}`, {
                headers: { accept: 'application/rdap+json, application/json', 'user-agent': USER_AGENT },
                signal: controller.signal,
            });
            if (response.status === 404) return null;
            if (!response.ok) {
                throw new ServiceUnavailableError(UNAVAILABLE, { cause: `RDAP respondió ${response.status}` });
            }
            const body: unknown = await response.json();
            if (typeof body !== 'object' || body === null) {
                throw new ServiceUnavailableError(UNAVAILABLE, { cause: 'RDAP devolvió un cuerpo que no es un objeto' });
            }
            return body;
        } catch (e) {
            if (e instanceof ServiceUnavailableError) throw e;
            throw new ServiceUnavailableError(UNAVAILABLE, { cause: e });
        } finally {
            clearTimeout(timer);
        }
    }
}

function toRecord(body: RdapDomain): DomainRegistryRecord {
    const registrar = body.entities?.find((e) => e.roles?.includes('registrar'));
    const ianaId = registrar?.publicIds?.find((p) => p.type === 'IANA Registrar ID')?.identifier;
    const name = registrar?.vcardArray?.[1]?.find((field) => field[0] === 'fn')?.[3];
    const expiration = body.events?.find((e) => e.eventAction === 'expiration')?.eventDate;
    const expiresAt = expiration ? new Date(expiration) : undefined;

    return {
        ...(ianaId ? { registrarIanaId: ianaId } : {}),
        ...(typeof name === 'string' ? { registrarName: name } : {}),
        statuses: (body.status ?? []).map((s) => s.toLowerCase()),
        ...(expiresAt && !Number.isNaN(expiresAt.getTime()) ? { expiresAt } : {}),
    };
}
