import { User } from '../entities/User';
import { Listing } from '../entities/Listing';
import { Operation } from '../entities/Operation';
import { NDA } from '../entities/NDA';

export interface IUserRepository {
    findById(id: string): Promise<User | null>;
    findByEmail(email: string): Promise<User | null>;
    save(user: User): Promise<void>;
}

export interface IListingRepository {
    findById(id: string): Promise<Listing | null>;
    findPublished(filters?: any): Promise<Listing[]>;
    save(listing: Listing): Promise<void>;
}

export interface IOperationRepository {
    findById(id: string): Promise<Operation | null>;
    findByListing(listingId: string): Promise<Operation[]>;
    save(operation: Operation): Promise<void>;
}

export interface INdaRepository {
    findByListingAndBuyer(listingId: string, buyerId: string): Promise<NDA | null>;
    save(nda: NDA): Promise<void>;
}
