import { DomainName } from '../value-objects/DomainName';

/**
 * Lo que dice el registro público de un dominio (RDAP) que importa para saber
 * si se puede traspasar. Es la mirada de afuera: la API de Hostinger solo ve
 * la cuenta de la plataforma, y antes de firmar el dominio todavía está en la
 * del vendedor.
 */
export interface DomainRegistryRecord {
    /** El «IANA Registrar ID» del registrador, el dato estable para reconocerlo. */
    registrarIanaId?: string;
    registrarName?: string;
    /** Los estados EPP tal como los publica el registro, en minúsculas. */
    statuses: string[];
    expiresAt?: Date;
}

/**
 * Consulta el registro público de un dominio. Devuelve `null` si el registro
 * no lo conoce. Si el registro no responde lanza `ServiceUnavailableError`:
 * sin respuesta no se puede dar un dominio por listo.
 */
export interface IDomainRegistryLookup {
    lookup(domain: DomainName): Promise<DomainRegistryRecord | null>;
}
