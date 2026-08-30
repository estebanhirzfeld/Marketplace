import { User } from '../entities/User';
import { Listing } from '../entities/Listing';
import { Operation } from '../entities/Operation';
import { Contract } from '../entities/Contract';
import { ListingStatus } from '../entities/Listing';

export interface IUserRepository {
    findById(id: string): Promise<User | null>;
    findByEmail(email: string): Promise<User | null>;
    save(user: User): Promise<void>;
}

/**
 * Criterios de búsqueda del mercado.
 *
 * Reemplaza al `any` que tenía `findPublished`: sin forma declarada, cada
 * llamador inventaba la suya y el repositorio pasaba el objeto crudo a Prisma,
 * lo que dejaba que un filtro arbitrario del cliente llegara a la consulta.
 */
export interface ListingFilters {
    assetType?: string;
    /** Precio pedido, en centavos. */
    minPrice?: number;
    maxPrice?: number;
}

export interface IListingRepository {
    findById(id: string): Promise<Listing | null>;
    findPublished(filters?: ListingFilters): Promise<Listing[]>;
    /** Todos los listings de un vendedor, incluidos los borradores. */
    findBySeller(sellerId: string): Promise<Listing[]>;
    /** Para la cola de revisión del admin. */
    findByStatus(status: ListingStatus): Promise<Listing[]>;
    save(listing: Listing): Promise<void>;
}

export interface IOperationRepository {
    findById(id: string): Promise<Operation | null>;
    findByListing(listingId: string): Promise<Operation[]>;
    /** Las operaciones en las que este usuario es comprador o vendedor. */
    findByParty(userId: string): Promise<Operation[]>;
    save(operation: Operation): Promise<void>;
}

export interface IContractRepository {
    findById(id: string): Promise<Contract | null>;
    findByOperation(operationId: string): Promise<Contract[]>;
    findByListingAndSigner(listingId: string, signerId: string): Promise<Contract | null>;
    findAllByListing(listingId: string): Promise<Contract[]>;
    save(contract: Contract): Promise<void>;
}
