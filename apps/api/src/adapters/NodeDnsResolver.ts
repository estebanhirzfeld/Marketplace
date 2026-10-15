import { Resolver } from 'node:dns/promises';
import { IDnsResolver } from '@marketplace/domain/src/ports/IOwnershipReaders';
import { isPublicIPv4 } from './isPublicIPv4';
import { ServiceUnavailableError } from '@marketplace/domain/src/errors/DomainError';

/** Lo mínimo de `dns.promises.Resolver` que usa el adaptador. */
export interface DnsLookup {
    resolveNs(name: string): Promise<string[]>;
    resolve4(name: string): Promise<string[]>;
    resolveTxt(name: string): Promise<string[][]>;
}

/** Crea una consulta que le pregunta a esos servidores (direcciones IP). */
export type DnsLookupFactory = (servers: string[]) => DnsLookup;

const PUBLIC_SERVERS = ['1.1.1.1', '8.8.8.8'];
const TIMEOUT_MS = 4_000;
/** Plazo total de cada llamada pública, sumando todas sus consultas. */
const DEFAULT_DEADLINE_MS = 8_000;

export interface NodeDnsResolverOptions {
    /** Plazo total por llamada; inyectable para no esperar 8 s en los tests. */
    deadlineMs?: number;
}

const defaultFactory: DnsLookupFactory = (servers) => {
    const resolver = new Resolver({ timeout: TIMEOUT_MS, tries: 1 });
    resolver.setServers(servers);
    return resolver;
};

/** El nombre no existe o no tiene ese registro: es una respuesta, no una falla. */
function isEmptyAnswer(error: unknown): boolean {
    const code = (error as { code?: unknown } | null)?.code;
    return code === 'ENOTFOUND' || code === 'ENODATA';
}

function unavailable(): ServiceUnavailableError {
    return new ServiceUnavailableError(
        'No pudimos consultar el DNS en este momento. Probá de nuevo en unos minutos.',
    );
}

/**
 * Consulta de DNS con `node:dns/promises`.
 *
 * Los servidores de nombres se piden a resolvedores públicos. Los TXT, en
 * cambio, se piden a los servidores autoritativos del dominio: un resolvedor
 * público guarda en caché la respuesta negativa y seguiría diciendo "no está"
 * un buen rato después de que el vendedor cargó el registro.
 */
export class NodeDnsResolver implements IDnsResolver {
    private readonly deadlineMs: number;

    constructor(
        private readonly lookupFor: DnsLookupFactory = defaultFactory,
        options: NodeDnsResolverOptions = {},
    ) {
        this.deadlineMs = options.deadlineMs ?? DEFAULT_DEADLINE_MS;
    }

    nameserversOf(domain: string): Promise<string[]> {
        return this.withDeadline(this.queryNameservers(domain));
    }

    txtRecordsOf(domain: string): Promise<string[]> {
        return this.withDeadline(this.queryTxtRecords(domain));
    }

    /** Corta la llamada entera si tarda más del plazo, sea cual sea la etapa. */
    private withDeadline<T>(work: Promise<T>): Promise<T> {
        let timer: NodeJS.Timeout | undefined;
        const deadline = new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(unavailable()), this.deadlineMs);
        });
        // Si el plazo gana, el trabajo sigue en el aire: que no genere rechazos sin atender.
        work.catch(() => undefined);
        return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
    }

    private async queryNameservers(domain: string): Promise<string[]> {
        try {
            return await this.lookupFor(PUBLIC_SERVERS).resolveNs(domain);
        } catch (error) {
            if (isEmptyAnswer(error)) return [];
            throw unavailable();
        }
    }

    private async queryTxtRecords(domain: string): Promise<string[]> {
        const authoritative = await this.authoritativeServersOf(domain);

        if (authoritative.length > 0) {
            try {
                return await this.txtFrom(this.lookupFor(authoritative), domain);
            } catch (error) {
                // Los autoritativos no respondieron: el público es peor
                // (caché) pero mejor que no contestar.
                if (!isTransportFailure(error)) throw error;
            }
        }

        try {
            return await this.txtFrom(this.lookupFor(PUBLIC_SERVERS), domain);
        } catch (error) {
            if (isTransportFailure(error)) throw unavailable();
            throw error;
        }
    }

    private async txtFrom(lookup: DnsLookup, domain: string): Promise<string[]> {
        try {
            const records = await lookup.resolveTxt(domain);
            // Un TXT largo llega partido en fragmentos de 255 caracteres.
            return records.map((chunks) => chunks.join(''));
        } catch (error) {
            if (isEmptyAnswer(error)) return [];
            throw new TransportFailure();
        }
    }

    /**
     * Direcciones IP de los servidores autoritativos. Si el nombre no tiene NS
     * propios (un subdominio) se sube al padre, sin llegar a la extensión sola.
     * Vacío cuando no se puede determinar.
     */
    private async authoritativeServersOf(domain: string): Promise<string[]> {
        const publicLookup = this.lookupFor(PUBLIC_SERVERS);
        const labels = domain.split('.');

        for (let i = 0; labels.length - i >= 2; i++) {
            const name = labels.slice(i).join('.');

            let nameservers: string[];
            try {
                nameservers = await publicLookup.resolveNs(name);
            } catch (error) {
                if (isEmptyAnswer(error)) continue;
                return [];
            }
            if (nameservers.length === 0) continue;

            const addresses = await Promise.all(
                nameservers.map((ns) => publicLookup.resolve4(ns).catch(() => [] as string[])),
            );
            // Las direcciones salen de nombres que fija el vendedor: solo se aceptan
            // las públicas, para que no pueda apuntarnos a la red interna.
            return [...new Set(addresses.flat().filter(isPublicIPv4))];
        }

        return [];
    }
}

/** Falla de red, de tiempo o del servidor, ya distinguida de "no existe". */
class TransportFailure extends Error {}

function isTransportFailure(error: unknown): boolean {
    return error instanceof TransportFailure;
}
