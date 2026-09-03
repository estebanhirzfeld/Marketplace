import { Report } from '../entities/Report';
import { User } from '../entities/User';
import { Listing } from '../entities/Listing';
import { Operation, OperationStatus } from '../entities/Operation';
import { Contract } from '../entities/Contract';
import { CustodyAccount } from '../entities/CustodyAccount';
import { ListingStatus } from '../entities/Listing';
import { AssetType, UserRole } from '@marketplace/shared-types';

export interface IUserRepository {
    findById(id: string): Promise<User | null>;
    findByEmail(email: string): Promise<User | null>;
    /**
     * Los usuarios de un rol.
     *
     * Existe para poder avisarle a la plataforma. Un aviso apunta siempre a
     * una persona —`Notification.userId` es obligatorio— así que sin esta
     * consulta no había forma de que un administrador recibiera ninguno: la
     * campana estaba en su barra desde el principio y nunca podía tener nada.
     *
     * Devuelve una lista y no uno solo a propósito: hoy hay un admin, pero
     * asumirlo sería construir una plataforma de una sola persona.
     */
    findByRole(role: UserRole): Promise<User[]>;
    save(user: User): Promise<void>;
}

/**
 * Criterios de búsqueda del mercado.
 *
 * Reemplaza al `any` que tenía `findPublished`: sin forma declarada, cada
 * llamador inventaba la suya y el repositorio pasaba el objeto crudo a Prisma,
 * lo que dejaba que un filtro arbitrario del cliente llegara a la consulta.
 */
export type ListingCurrency = 'ARS' | 'USD';

/**
 * Por qué se ordena el mercado.
 *
 * `created` es la antigüedad del activo en la plataforma y `published` la de
 * la publicación: son dos fechas distintas porque un listing puede pasar días
 * en borrador o en revisión antes de salir. `estimated` es la proyección que
 * calcula la estrategia del activo, no un dato guardado.
 */
export type ListingSort = 'price' | 'created' | 'published' | 'estimated';

export type SortDirection = 'asc' | 'desc';

export interface ListingFilters {
    assetType?: string;
    /** Rubro del activo. Sirve para los dos tipos, así que no es propio de uno. */
    niche?: string;
    /**
     * Solo los activos que la plataforma ya puede transferir hoy. Se calcula
     * sobre la constancia de acceso y el plazo de espera del tipo de activo,
     * así que no hay columna que consultar: se resuelve después de leer.
     */
    onlyTransferable?: boolean;
    /**
     * Moneda del precio pedido. Es obligatoria si se acota el rango: comparar
     * centavos de monedas distintas no significa nada.
     */
    currency?: ListingCurrency;
    /** Precio pedido, en centavos de la moneda elegida. */
    minPrice?: number;
    maxPrice?: number;

    /** Solo canales de YouTube. */
    minSubscribers?: number;
    onlyMonetized?: boolean;

    /** Solo sitios web. */
    minDomainAuthority?: number;

    sort?: ListingSort;
    direction?: SortDirection;
}

export interface IListingRepository {
    findById(id: string): Promise<Listing | null>;
    findPublished(filters?: ListingFilters): Promise<Listing[]>;
    /** Todos los listings de un vendedor, incluidos los borradores. */
    findBySeller(sellerId: string): Promise<Listing[]>;
    /** Para la cola de revisión del admin. */
    findByStatus(status: ListingStatus): Promise<Listing[]>;
    /**
     * Los activos que esta cuenta de custodia sostiene AHORA: los que tienen un
     * `platformAccess` vigente cuyo `custodyAccountId` apunta a ella. Excluye
     * los vendidos —la constancia se conserva como evidencia de la operación
     * cerrada, pero la plataforma ya no los tiene. El radio de daño de perder
     * una cuenta es lo que sostiene en este momento, no lo que pasó alguna vez.
     */
    findHeldBy(custodyAccountId: string): Promise<Listing[]>;
    save(listing: Listing): Promise<void>;
}

/**
 * La identidad que sostiene activos en custodia.
 *
 * La consulta inversa —qué activos sostiene una cuenta— vive en
 * `IListingRepository.findHeldBy`, no acá: los listings son listings, y
 * ponerla en este puerto lo haría devolver otro agregado.
 */
export interface ICustodyAccountRepository {
    findById(id: string): Promise<CustodyAccount | null>;
    findAll(): Promise<CustodyAccount[]>;
    /** Las activas, opcionalmente acotadas a un tipo de activo. */
    findActive(assetType?: AssetType): Promise<CustodyAccount[]>;
    save(account: CustodyAccount): Promise<void>;
}

export interface IOperationRepository {
    findById(id: string): Promise<Operation | null>;
    findByListing(listingId: string): Promise<Operation[]>;
    /** Las operaciones en las que este usuario es comprador o vendedor. */
    findByParty(userId: string): Promise<Operation[]>;
    /**
     * Para el tablero de la plataforma: las operaciones paradas en las etapas
     * donde el próximo paso lo da un admin. Es una consulta transversal, sin
     * parte, y por eso no entra por `findByParty`.
     */
    findByStatuses(statuses: OperationStatus[]): Promise<Operation[]>;
    save(operation: Operation): Promise<void>;
}

export interface IContractRepository {
    findById(id: string): Promise<Contract | null>;
    findByOperation(operationId: string): Promise<Contract[]>;
    findByListingAndSigner(listingId: string, signerId: string): Promise<Contract | null>;
    findAllByListing(listingId: string): Promise<Contract[]>;
    save(contract: Contract): Promise<void>;
}

export interface IReportRepository {
    findById(id: string): Promise<Report | null>;
    /** Las denuncias en las que el usuario es parte, denuncie o sea denunciado. */
    findByUser(userId: string): Promise<Report[]>;
    findByOperation(operationId: string): Promise<Report[]>;
    /** Las abiertas, para el tablero de la plataforma. */
    findOpen(): Promise<Report[]>;
    save(report: Report): Promise<void>;
}
