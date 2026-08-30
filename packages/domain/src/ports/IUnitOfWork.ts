import {
    IUserRepository,
    IListingRepository,
    IOperationRepository,
    IContractRepository,
} from './Repositories';

/**
 * Los repositorios vistos desde adentro de una transacción. Son las mismas
 * interfaces de siempre: el dominio no distingue una escritura transaccional
 * de una suelta, y no debería.
 */
export interface TransactionalRepositories {
    users: IUserRepository;
    listings: IListingRepository;
    operations: IOperationRepository;
    contracts: IContractRepository;
}

/**
 * Unit of Work.
 *
 * Existe para los use cases que modifican varias entidades y necesitan que el
 * conjunto sea todo-o-nada. El caso que lo motiva es la cascada híbrida de
 * AcceptOffer: aceptar una oferta, cancelar las rivales y mover el listing.
 * Sin atomicidad, una falla a mitad deja una oferta aceptada conviviendo con
 * rivales vivas — exactamente el estado que el modelo multi-oferta prohíbe.
 *
 * El dominio declara la necesidad; cómo se implementa la transacción (Prisma,
 * SQL crudo, dos fases) es decisión de infraestructura.
 */
export interface IUnitOfWork {
    run<T>(work: (repos: TransactionalRepositories) => Promise<T>): Promise<T>;
}
